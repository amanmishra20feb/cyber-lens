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
const MAX_REPO_KB = 200_000;
const MAX_MAP_FILES = 1500;
const MAX_FINDINGS = 2000; // TODO: page the findings if a real repo ever goes past this

// For small hosts (~512 MB): run the engines one after another and one scan at a time.
export const LOW_MEMORY = process.env.LOW_MEMORY === '1';

// Errors whose message is safe to show the user.
export class ScanError extends Error {}

const ENGINES = [
  {
    name: 'semgrep',
    timeout: 300_000,
    okCodes: [0, 1],
    // --jobs 1 uses about half the memory for the same results
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
    okCodes: [0, 1, 128], // 1 = vulnerabilities found, 128 = no lockfile in the repo
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
  await onEngine?.(status);
  return { status, findings };
}

// Text files under 1 MB with their line counts, biggest first. Feeds the repo map.
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

// Two lines above and below the finding, secrets masked.
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
    return f; // the finding is still valid without a snippet
  }
}

export async function scanDirectory(dir, onEngine, signal) {
  dir = await fs.realpath(dir); // engines report real paths, e.g. /private/var on macOS
  const runOne = (engine) => runEngine(engine, dir, onEngine, signal);
  let results = [];
  if (LOW_MEMORY) for (const engine of ENGINES) results.push(await runOne(engine));
  else results = await Promise.all(ENGINES.map(runOne));

  const { files, fileCount } = await mapFiles(dir);
  const merged = merge(results.flatMap((r) => r.findings)).slice(0, MAX_FINDINGS);
  const findings = await Promise.all(merged.map((f) => addSnippet(f, dir)));
  return { files, fileCount, engines: results.map((r) => r.status), findings };
}

async function repoMeta({ owner, name }) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: {
      'User-Agent': 'cyberlens-scanner',
      Accept: 'application/vnd.github+json',
      // optional: raises GitHub's limit from 60 to 5,000 calls an hour
      ...(process.env.GITHUB_TOKEN && { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }),
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (res?.status === 404) throw new ScanError('Repo not found. Cyberlens scans public GitHub repos only.');
  return res?.ok ? res.json() : null; // GitHub down or rate limited: carry on, the clone size is checked below
}

async function downloadedKb(dir) {
  const { stdout } = await run('git', ['-C', dir, 'count-objects', '-v']);
  return Number(/^size-pack: (\d+)/m.exec(stdout)?.[1] ?? 0) + Number(/^size: (\d+)/m.exec(stdout)?.[1] ?? 0);
}

function tooLarge(kb) {
  const mb = kb / 1000;
  const size = mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.round(mb)} MB`;
  return new ScanError(`This repo is ${size} on GitHub. Cyberlens scans repos up to 200 MB.`);
}

// Clone into a sandbox, scan it, and always delete the clone afterwards.
export async function scanRepo({ id, repoUrl, branch }, { onStatus, onEngine, signal } = {}) {
  const repo = parseRepo(repoUrl);
  if (!repo) throw new ScanError('That is not a public GitHub repo URL.');
  const meta = await repoMeta(repo);
  if (meta?.private) throw new ScanError('This repo is private. Cyberlens scans public GitHub repos only.');
  if (meta?.size > MAX_REPO_KB) throw tooLarge(meta.size);

  const dir = path.join(SANDBOXES, String(id));
  await fs.mkdir(SANDBOXES, { recursive: true });
  try {
    const args = ['clone', '--depth', '1', '--single-branch', '--no-tags', ...(branch ? ['--branch', branch] : []), '--', repo.url, dir];
    const clone = await run('git', args, { timeout: 60_000, signal });
    if (signal?.aborted) throw new ScanError('Cancelled.');
    if (clone.code !== 0) {
      if (/Remote branch .* not found/.test(clone.stderr)) throw new ScanError(`Branch "${branch}" was not found in this repo.`);
      if (/timed out/.test(clone.stderr)) throw new ScanError('Cloning took longer than 60 seconds. Try a smaller repo.');
      throw new ScanError('Could not clone the repo. Check the URL and that the repo is public.');
    }
    const kb = await downloadedKb(dir);
    if (kb > MAX_REPO_KB) throw tooLarge(kb);
    const commit = (await run('git', ['-C', dir, 'rev-parse', 'HEAD'])).stdout.trim();
    await onStatus?.('scanning');
    return { commit, ...(await scanDirectory(dir, onEngine, signal)) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
