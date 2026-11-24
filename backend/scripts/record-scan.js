// npm run record-scan: scans OWASP NodeGoat for real and saves the result for the landing page.
// Run it again whenever the rules change, so the landing page never shows an old or made-up result.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepo } from '../src/scanner/scan.js';

const REPO = 'https://github.com/OWASP/NodeGoat';
const OUT = fileURLToPath(new URL('../../frontend/src/landing/nodegoat-scan.json', import.meta.url));

const started = Date.now();
const result = await scanRepo({ id: `record-${Date.now()}`, repoUrl: REPO });
const scan = {
  repoUrl: REPO,
  commit: result.commit,
  scannedAt: new Date().toISOString(),
  seconds: Math.round((Date.now() - started) / 1000),
  fileCount: result.fileCount,
  files: result.files,
  engines: result.engines,
  findings: result.findings.map(({ file, line, severity, title, owasp, engines }) => ({ file, line, severity, title, owasp, engines, status: 'open' })),
};
await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(scan)}\n`);
console.log(`NodeGoat at ${scan.commit.slice(0, 7)}: ${scan.findings.length} findings in ${scan.fileCount} files, ${scan.seconds} s. Wrote ${OUT}`);
