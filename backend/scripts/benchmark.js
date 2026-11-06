// Scans ../cyberlens-goat and checks every planted bug was found and no safe line was flagged.
// Writes benchmark.json, which the report and the landing page read. Usage: npm run benchmark
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from '../src/scanner/scan.js';

const GOAT = fileURLToPath(new URL('../../cyberlens-goat', import.meta.url));
const OUT = fileURLToPath(new URL('../../benchmark.json', import.meta.url));

// Read the markers from the source: "// VULN: CWE-89 A05" or "// SAFE".
async function markers() {
  const vulns = [];
  const safe = [];
  for (const file of await fs.readdir(path.join(GOAT, 'src'), { recursive: true })) {
    if (!file.endsWith('.js')) continue;
    const rel = `src/${file}`;
    (await fs.readFile(path.join(GOAT, rel), 'utf8')).split('\n').forEach((text, i) => {
      const vuln = /\/\/ VULN: (CWE-\d+) (A\d\d)/.exec(text);
      if (vuln) vulns.push({ file: rel, line: i + 1, cwe: vuln[1], owasp: vuln[2] });
      if (/\/\/ SAFE/.test(text)) safe.push({ file: rel, line: i + 1 });
    });
  }
  const deps = JSON.parse(await fs.readFile(path.join(GOAT, 'expected-deps.json'), 'utf8'));
  return { vulns, safe, deps };
}

const { vulns, safe, deps } = await markers();
const result = await scanDirectory(GOAT);
const { findings } = result;
const near = (f, m) => f.file === m.file && f.line != null && m.line >= f.line && m.line <= (f.endLine ?? f.line); // the finding must cover the marked line

const found = vulns.filter((v) => findings.some((f) => near(f, v)));
const missed = vulns.filter((v) => !found.includes(v));
const falseAlarms = findings.filter((f) => safe.some((s) => near(f, s)));
const depsFound = deps.filter((d) => findings.some((f) => f.engines.includes('osv') && f.title.startsWith(`${d} `)));

const report = {
  date: new Date().toISOString(),
  engines: result.engines,
  planted: vulns.length + deps.length,
  found: found.length + depsFound.length,
  missed: [...missed.map((m) => `${m.file}:${m.line} ${m.cwe} ${m.owasp}`), ...deps.filter((d) => !depsFound.includes(d)).map((d) => `dependency ${d}`)],
  falseAlarms: falseAlarms.map((f) => `${f.file}:${f.line} ${f.ruleId}`),
  totalFindings: findings.length,
};
await fs.writeFile(OUT, JSON.stringify(report, null, 2) + '\n');

console.log(`Engines: ${result.engines.map((e) => `${e.name} ${e.ok ? `ok (${e.count}, ${(e.ms / 1000).toFixed(1)} s)` : `FAILED: ${e.error}`}`).join(' · ')}`);
console.log(`Found ${report.found} of ${report.planted} planted issues; ${report.falseAlarms.length} false alarms; ${report.totalFindings} findings in total.`);
if (report.missed.length) console.log(`Missed:\n  ${report.missed.join('\n  ')}`);
if (report.falseAlarms.length) console.log(`False alarms:\n  ${report.falseAlarms.join('\n  ')}`);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
