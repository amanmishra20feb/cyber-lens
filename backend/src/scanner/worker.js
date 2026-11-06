import { sql, tx } from '../db.js';
import { SEVERITIES, NOT_FINAL } from '../models.js';
import { scanRepo, ScanError, LOW_MEMORY } from './scan.js';
import { publish } from './events.js';

const MAX_RUNNING = LOW_MEMORY ? 1 : 2;
const queue = [];
const running = new Map(); // scan id -> AbortController, so a cancel can stop the engines
// shortcut: in-memory queue in the API process; move to a job queue if the API ever runs on more than one instance

export function enqueue(scanId) {
  queue.push(String(scanId));
  pump();
}

export const cancel = (scanId) => running.get(String(scanId))?.abort();

function pump() {
  while (running.size < MAX_RUNNING && queue.length) {
    const id = queue.shift();
    running.set(id, new AbortController());
    runScan(id).finally(() => {
      running.delete(id);
      pump();
    });
  }
}

async function runScan(id) {
  // Every write is skipped once the scan is final, so a cancelled scan can never become failed or done.
  // `changes` is fixed SQL from this file (e.g. "status = $2"); the values go in params.
  const set = async (changes, params = [], run = sql) => {
    const updated = (await run(`UPDATE scans SET ${changes} WHERE id = $1 AND ${NOT_FINAL} RETURNING id`, [id, ...params])).length > 0;
    if (updated && run === sql) publish(id);
    return updated;
  };
  try {
    const [scan] = await sql(`UPDATE scans SET status = 'cloning', started_at = now() WHERE id = $1 AND status = 'queued' RETURNING *`, [id]);
    if (!scan) return; // cancelled while waiting in the queue
    publish(id);
    // Each engine is saved the moment it finishes, so the page can show them one by one.
    const result = await scanRepo(scan, {
      signal: running.get(id).signal,
      onStatus: (status) => set('status = $2', [status]),
      onEngine: (engine) => set('engines = engines || $2::jsonb', [JSON.stringify([engine])]),
    });
    const saving = await set("status = 'saving', commit = $2, skipped = $3::jsonb, files = $4::jsonb, file_count = $5", [
      result.commit, result.skipped ? JSON.stringify(result.skipped) : null, JSON.stringify(result.files), result.fileCount,
    ]);
    if (!saving) return;
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, result.findings.filter((f) => f.severity === s).length]));
    // Findings and "done" are saved together: if either fails, neither is kept, so a failed save leaves no stray findings.
    const done = await tx(async (run) => {
      if (!(await set("status = 'done', counts = $2::jsonb, finished_at = now()", [JSON.stringify(counts)], run))) return false; // cancelled meanwhile
      await insertFindings(run, scan, result.findings);
      return true;
    });
    if (done) publish(id);
  } catch (e) {
    if (!(e instanceof ScanError)) console.error(`scan ${id} failed:`, e);
    await set("status = 'failed', error = $2, finished_at = now()", [e instanceof ScanError ? e.message : 'The scan failed unexpectedly. Try again.'])
      .catch((err) => console.error(`could not mark scan ${id} failed:`, err));
  }
}

// Saves the findings of one scan in one statement: the list goes in as a single JSON parameter (so any number fits)
// and Postgres turns it into rows. `run` is sql or a transaction's runner.
export const insertFindings = (run, scan, findings) =>
  run(
    `INSERT INTO findings (scan_id, user_id, engines, rule_id, title, message, severity, cwe, owasp, file, line, end_line, snippet, snippet_line, fingerprint)
     SELECT $1, $2, f.engines, f."ruleId", f.title, f.message, f.severity, f.cwe, f.owasp, f.file, f.line, f."endLine", f.snippet, f."snippetLine", f.fingerprint
     FROM jsonb_to_recordset($3::jsonb) AS f(engines text[], "ruleId" text, title text, message text, severity text, cwe text[], owasp text[],
                                              file text, line int, "endLine" int, snippet text, "snippetLine" int, fingerprint text)`,
    [scan.id, scan.userId, JSON.stringify(findings)],
  );

// A scan that was running when the server stopped can never finish; say so instead of spinning forever.
export const recoverScans = async () =>
  (await sql(`UPDATE scans SET status = 'failed', error = 'The server restarted during this scan. Run it again.', finished_at = now() WHERE ${NOT_FINAL} RETURNING id`)).length;
