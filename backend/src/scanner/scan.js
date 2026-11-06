import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './run.js';
import { parseSemgrep, parseGitleaks, parseOsv, merge, maskSecrets } from './normalise.js';
import { parseRepo } from '../validate.js';

const RULES = fileURLToPath(new URL('../../rules', import.meta.url));
const SANDBOXES = process.env.SANDBOX_DIR || path.join(os.tmpdir(), 'cyberlens-sandboxes');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build']);
const MAX_MAP_FILES = 1500;
// LOW_MEMORY=1 is for hosts with about 512 MB: engines run one after another and the worker scans one repo at a time.
export const LOW_MEMORY = process.env.LOW_MEMORY === '1';
const MAX_FINDINGS = 2000;

// A message safe to show the user; anything else becomes a generic failure.
export class ScanError extends Error {}

const ENGINES = [
  {
    name: 'semgrep',
    timeout: 300_000,
    okCodes: [0, 1],
    // --jobs 1 keeps Semgrep's memory near 270 MB instead of 470 MB (same findings, about 0.4 s slower on NodeGoat); --max-memory stops it taking the whole host.
    args: (dir) => ['scan', '--config', 'p/owasp-top-ten', '--config', 'p/secrets', '--config', RULES, '--json', '--metrics', 'off', '--quiet', '--timeout', '30', '--jobs', '1', '--max-memory', LOW_MEMORY ? '350' : '700', dir],
    parse: parseSemgrep,
  },
  {
    name: 'gitleaks',
    timeout: 120_000,
    okCodes: [0],
    args: (dir) => ['dir', dir, '--report-format', 'json', '--report-path', '-', '--redact', '--no-banner', '--exit-code', '0'],
    parse: parseGitleaks,
  },
  {
    name: 'osv',
    cmd: 'osv-scanner',
    timeout: 120_000,
    okCodes: [0, 1, 128], // 1 = vulnerabilities found, 128 = no lockfiles found
    args: (dir) => ['scan', 'source', '-r', '--format', 'json', dir],
    parse: (json, dir) => (json ? parseOsv(json, dir) : []),
  },
];

async function runEngine(engine, dir, onEngine, signal) {
  const started = Date.now();
  const { code, stdout, stderr } = await run(engine.cmd ?? engine.name, engine.args(dir), { timeout: engine.timeout, signal });
  let status, findings;
  try {
    if (!engine.okCodes.includes(code)) throw new Error(stderr.trim().split('\n').pop() || `exited with code ${code}`);
    findings = engine.parse(stdout.trim() ? JSON.parse(stdout) : null, dir);
    status = { name: engine.name, ok: true, count: findings.length, ms: Date.now() - started };
  } catch (e) {
    findings = [];
    status = { name: engine.name, ok: false, error: e.message.slice(0, 300), ms: Date.now() - started };
  }
  await onEngine?.(status); // outside the try: a failure to save progress is not an engine failure
  return { status, findings };
}

// Every regular file (no symlinks) with its line count, largest first, for the Repo Map.
async function mapFiles(dir) {
  const files = [];
  async function walk(relDir) {
    for (const entry of await fs.readdir(path.join(dir, relDir), { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) await walk(rel);
      else if (entry.isFile()) files.push(rel);
    }
  }
  await walk('');
  const counted = [];
  for (const file of files) {
    const full = path.join(dir, file);
    if ((await fs.stat(full)).size > 1_000_000) continue;
    const buf = await fs.readFile(full);
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    counted.push({ path: file, loc: buf.toString('utf8').split('\n').length });
  }
  counted.sort((a, b) => b.loc - a.loc);
  return { files: counted.slice(0, MAX_MAP_FILES), fileCount: files.length };
}

// Two lines either side of the finding, read from the sandbox, secrets masked.
async function addSnippet(f, dir) {
  if (f.snippet) return { ...f, snippet: maskSecrets(f.snippet), snippetLine: f.line };
  if (!f.line) return f;
  try {
    const full = path.resolve(dir, f.file);
    const stat = await fs.lstat(full);
    if (!full.startsWith(dir + path.sep) || !stat.isFile() || stat.size > 2_000_000) return f;
    const lines = (await fs.readFile(full, 'utf8')).split('\n');
    const start = Math.max(1, f.line - 2);
    return { ...f, snippet: maskSecrets(lines.slice(start - 1, f.line + 2).join('\n')), snippetLine: start };
  } catch {
    return f; // the snippet is a convenience; the finding still stands without it
  }
}

export async function scanDirectory(dir, onEngine, signal) {
  dir = await fs.realpath(dir); // engines report real paths (/private/var on macOS), so match them
  const run = (engine) => runEngine(engine, dir, onEngine, signal);
  let results;
  if (LOW_MEMORY) {
    results = [];
    for (const engine of ENGINES) results.push(await run(engine)); // one at a time
  } else {
    results = await Promise.all(ENGINES.map(run));
  }
  const { files, fileCount } = await mapFiles(dir);
  const merged = merge(results.flatMap((r) => r.findings)).slice(0, MAX_FINDINGS); // shortcut: cap at 2000 findings, page them if real repos exceed it
  const findings = await Promise.all(merged.map((f) => addSnippet(f, dir)));
  return { files, fileCount, engines: results.map((r) => r.status), findings };
}

export const MAX_REPO_KB = 200_000;
export const MAX_FILE_BYTES = 1_000_000; // the Repo Map and the engines already ignore files above this

// GitHub's repo record, or null when GitHub cannot be reached or does not answer 200.
export async function repoMeta({ owner, name }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: { 'User-Agent': 'cyberlens-scanner', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }) }, // a token lifts the limit from 60 to 5,000 calls an hour
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (res?.status === 404) throw new ScanError('Repo not found. Cyberlens scans public GitHub repos only.');
  return res?.ok ? res.json() : null; // shortcut: GitHub API down or rate-limited (60/h per IP) means no size check; add a token if this happens often
}

// What the clone really downloaded, in KB. The GitHub size check can be skipped (API down or rate-limited), this cannot.
async function downloadedKb(dir) {
  const { stdout } = await run('git', ['-C', dir, 'count-objects', '-v']);
  return Number(/^size-pack: (\d+)/m.exec(stdout)?.[1] ?? 0) + Number(/^size: (\d+)/m.exec(stdout)?.[1] ?? 0);
}

export function tooLargeMessage(sizeKb) {
  const mb = sizeKb / 1000;
  return `This repo is ${mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`} on GitHub. Cyberlens scans repos up to 200 MB.`;
}

// Partial clone for repos over the limit: fetch only files up to 1 MB, check out only those, and say which were left out.
export async function partialClone({ url, branch, dir, signal }) {
  const git = (args, opts) => run('git', args, { timeout: 60_000, signal, ...opts });
  const clone = await git(['clone', '--depth', '1', '--single-branch', '--no-tags', `--filter=blob:limit=${MAX_FILE_BYTES}`, '--no-checkout', ...(branch ? ['--branch', branch] : []), '--', url, dir]);
  if (clone.code !== 0) return clone;
  // Trees are always present; blobs over the limit are the ones the clone left out. `--missing=print` lists them without fetching.
  const missing = new Set((await git(['-C', dir, 'rev-list', '--objects', '--missing=print', '--no-object-names', 'HEAD'])).stdout.split('\n').filter((l) => l.startsWith('?')).map((l) => l.slice(1)));
  const tree = (await git(['-C', dir, 'ls-tree', '-r', '-z', 'HEAD'])).stdout.split('\0').filter(Boolean);
  const keep = [];
  const skipped = [];
  for (const entry of tree) {
    const [meta, file] = [entry.slice(0, entry.indexOf('\t')), entry.slice(entry.indexOf('\t') + 1)];
    const [, type, oid] = meta.split(' ');
    if (type !== 'blob') continue; // submodules are not scanned
    (missing.has(oid) ? skipped : keep).push(file);
  }
  const list = `${dir}.paths`; // outside the clone, so the scan never sees it
  await fs.writeFile(list, keep.join('\0'));
  try {
    const checkout = await git(['-C', dir, '--literal-pathspecs', 'checkout', 'HEAD', `--pathspec-from-file=${list}`, '--pathspec-file-nul']);
    return { ...checkout, skipped };
  } finally {
    await fs.rm(list, { force: true });
  }
}

// Clone, scan, always delete the clone. onStatus('scanning') is called between the two.
export async function scanRepo({ id, repoUrl, branch, skipLarge }, { onStatus, onEngine, signal } = {}) {
  const repo = parseRepo(repoUrl);
  if (!repo) throw new ScanError('That is not a public GitHub repo URL.');
  const meta = await repoMeta(repo);
  if (meta?.private) throw new ScanError('This repo is private. Cyberlens scans public GitHub repos only.');
  const tooLarge = meta?.size > MAX_REPO_KB;
  if (tooLarge && !skipLarge) throw new ScanError(tooLargeMessage(meta.size)); // the API asks the user first; this guards any other way in
  const dir = path.join(SANDBOXES, String(id));
  await fs.mkdir(SANDBOXES, { recursive: true });
  try {
    const clone = tooLarge
      ? await partialClone({ url: repo.url, branch, dir, signal })
      : await run(
        'git',
        ['clone', '--depth', '1', '--single-branch', '--no-tags', ...(branch ? ['--branch', branch] : []), '--', repo.url, dir],
        { timeout: 60_000, signal },
      );
    if (signal?.aborted) throw new ScanError('Cancelled.');
    if (clone.code !== 0) {
      if (/Remote branch .* not found/.test(clone.stderr)) throw new ScanError(`Branch "${branch}" was not found in this repo.`);
      if (/timed out/.test(clone.stderr)) throw new ScanError('Cloning took longer than 60 seconds. Try a smaller repo.');
      throw new ScanError('Could not clone the repo. Check the URL and that the repo is public.');
    }
    const kb = await downloadedKb(dir);
    if (kb > MAX_REPO_KB) throw new ScanError(tooLargeMessage(kb));
    const commit = (await run('git', ['-C', dir, 'rev-parse', 'HEAD'])).stdout.trim();
    await onStatus?.('scanning');
    const skipped = clone.skipped ? { count: clone.skipped.length, paths: clone.skipped.slice(0, 50) } : undefined; // shortcut: names the first 50, the count is complete
    return { commit, skipped, ...(await scanDirectory(dir, onEngine, signal)) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
