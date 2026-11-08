import { sql, tx } from '../db.js';
import { SEVERITIES, NOT_FINAL } from '../models.js';
import { scanRepo, ScanError, LOW_MEMORY } from './scan.js';
import { publish } from './events.js';

// TODO: this queue lives in memory, so it only works with a single API instance
const MAX_RUNNING = LOW_MEMORY ? 1 : 2;
const queue = [];
const running = new Map(); // scan id -> AbortController

export function enqueue(scanId) {
  queue.push(String(scanId));
  next();
}

export const cancel = (scanId) => running.get(String(scanId))?.abort();

function next() {
  while (running.size < MAX_RUNNING && queue.length) {
    const id = queue.shift();
    running.set(id, new AbortController());
    runScan(id).finally(() => {
      running.delete(id);
      next();
    });
  }
}

async function runScan(id) {
  // Only touches a scan that isn't finished yet, so a cancel always wins.
  const set = async (changes, params = [], run = sql) => {
    const updated = (await run(`UPDATE scans SET ${changes} WHERE id = $1 AND ${NOT_FINAL} RETURNING id`, [id, ...params])).length > 0;
    if (updated && run === sql) publish(id);
    return updated;
  };

  try {
    const [scan] = await sql(`UPDATE scans SET status = 'cloning', started_at = now() WHERE id = $1 AND status = 'queued' RETURNING *`, [id]);
    if (!scan) return; // cancelled while it was queued
    publish(id);

    const result = await scanRepo(scan, {
      signal: running.get(id).signal,
      onStatus: (status) => set('status = $2', [status]),
      onEngine: (engine) => set('engines = engines || $2::jsonb', [JSON.stringify([engine])]),
    });
    const saving = await set("status = 'saving', commit = $2, files = $3::jsonb, file_count = $4", [result.commit, JSON.stringify(result.files), result.fileCount]);
    if (!saving) return;

    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, result.findings.filter((f) => f.severity === s).length]));
    const done = await tx(async (run) => {
      if (!(await set("status = 'done', counts = $2::jsonb, finished_at = now()", [JSON.stringify(counts)], run))) return false;
      await insertFindings(run, scan, result.findings);
      return true;
    });
    if (done) publish(id);
  } catch (e) {
    if (!(e instanceof ScanError)) console.error(`scan ${id} failed:`, e);
    const message = e instanceof ScanError ? e.message : 'The scan failed unexpectedly. Try again.';
    await set("status = 'failed', error = $2, finished_at = now()", [message]).catch((err) => console.error(`could not mark scan ${id} as failed:`, err));
  }
}

// All findings go in as one JSON parameter and Postgres turns them into rows.
export const insertFindings = (run, scan, findings) =>
  run(
    `INSERT INTO findings (scan_id, user_id, engines, rule_id, title, message, severity, cwe, owasp, file, line, end_line, snippet, snippet_line, fingerprint)
     SELECT $1, $2, f.engines, f."ruleId", f.title, f.message, f.severity, f.cwe, f.owasp, f.file, f.line, f."endLine", f.snippet, f."snippetLine", f.fingerprint
     FROM jsonb_to_recordset($3::jsonb) AS f(engines text[], "ruleId" text, title text, message text, severity text, cwe text[], owasp text[],
                                              file text, line int, "endLine" int, snippet text, "snippetLine" int, fingerprint text)`,
    [scan.id, scan.userId, JSON.stringify(findings)],
  );

// On startup: anything still running was cut off by the restart.
export const recoverScans = async () =>
  (await sql(`UPDATE scans SET status = 'failed', error = 'The server restarted during this scan. Run it again.', finished_at = now() WHERE ${NOT_FINAL} RETURNING id`)).length;
