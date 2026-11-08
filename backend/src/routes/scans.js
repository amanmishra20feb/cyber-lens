import { Router } from 'express';
import { sql } from '../db.js';
import { FINAL, SCAN_COLUMNS, NOT_FINAL } from '../models.js';
import { requireUser } from '../auth.js';
import { parseRepo, isBranch, isId } from '../validate.js';
import { enqueue, cancel } from '../scanner/worker.js';
import { subscribe, publish } from '../scanner/events.js';

const router = Router();
const DAILY_LIMIT = 25; // only shown once someone hits it
const BUSY = 'You already have a scan running. Wait for it to finish.';

router.use(requireUser);

router.post('/', async (req, res) => {
  const repo = parseRepo(req.body?.repoUrl);
  if (!repo) return res.status(400).json({ error: 'Paste a public GitHub repo URL, like https://github.com/owner/repo.' });
  const branch = typeof req.body?.branch === 'string' && req.body.branch.trim() ? req.body.branch.trim() : null;
  if (branch && !isBranch(branch)) return res.status(400).json({ error: 'That branch name is not valid.' });

  const userId = req.user.id;
  if ((await sql(`SELECT 1 FROM scans WHERE user_id = $1 AND ${NOT_FINAL}`, [userId])).length) return res.status(409).json({ error: BUSY });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // scans that failed before any engine ran (typo in the URL, private repo) don't count
  const [{ used }] = await sql(
    `SELECT count(*)::int AS used FROM scans
     WHERE user_id = $1 AND created_at >= $2 AND NOT (status IN ('failed', 'cancelled') AND jsonb_array_length(engines) = 0)`,
    [userId, today],
  );
  if (used >= DAILY_LIMIT) return res.status(429).json({ error: 'You have run a lot of scans today. Try again tomorrow.' });

  let scan;
  try {
    [scan] = await sql(`INSERT INTO scans (user_id, repo_url, branch) VALUES ($1, $2, $3) RETURNING ${SCAN_COLUMNS}`, [userId, repo.url, branch]);
  } catch (e) {
    // two requests at the same moment: the unique index lets only one through
    if (e.code === '23505') return res.status(409).json({ error: BUSY });
    throw e;
  }
  enqueue(scan.id);
  res.status(201).json({ scan });
});

router.get('/', async (req, res) => {
  const scans = await sql(`SELECT ${SCAN_COLUMNS} FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
  res.json({ scans });
});

async function findScan(req, res) {
  const [scan] = isId(req.params.id) ? await sql('SELECT * FROM scans WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]) : [];
  if (!scan) res.status(404).json({ error: 'Scan not found.' });
  return scan;
}

router.get('/:id', async (req, res) => {
  const scan = await findScan(req, res);
  if (scan) res.json({ scan });
});

// Live progress over server-sent events: the scan now, again after every change, then close once it's finished.
router.get('/:id/events', async (req, res) => {
  const scan = await findScan(req, res);
  if (!scan) return;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();

  let closed = false;
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000); // proxies drop silent connections
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unsubscribe();
    res.end();
  };
  let pending = Promise.resolve(); // one read at a time, so updates arrive in order
  const send = () => {
    pending = pending.then(async () => {
      if (closed) return;
      const [current] = await sql(`SELECT ${SCAN_COLUMNS} FROM scans WHERE id = $1`, [scan.id]);
      if (!current) return stop();
      res.write(`data: ${JSON.stringify(current)}\n\n`);
      if (FINAL.includes(current.status)) stop();
    }).catch(stop);
  };
  const unsubscribe = subscribe(scan.id, send);
  req.on('close', stop);
  send();
});

router.post('/:id/cancel', async (req, res) => {
  const scan = await findScan(req, res);
  if (!scan) return;
  const [cancelled] = await sql(`UPDATE scans SET status = 'cancelled', finished_at = now() WHERE id = $1 AND ${NOT_FINAL} RETURNING ${SCAN_COLUMNS}`, [scan.id]);
  if (!cancelled) return res.status(409).json({ error: 'This scan has already finished.' });
  cancel(scan.id);
  publish(scan.id);
  res.json({ scan: cancelled });
});

router.get('/:id/findings', async (req, res) => {
  const scan = await findScan(req, res);
  if (!scan) return;
  const findings = await sql(
    `SELECT * FROM findings WHERE scan_id = $1
     ORDER BY array_position(ARRAY['critical', 'high', 'medium', 'low'], severity), file, line NULLS FIRST`,
    [scan.id],
  );
  res.json({ findings });
});

export default router;
