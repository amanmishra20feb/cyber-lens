import { Router } from 'express';
import { sql } from '../db.js';
import { FINAL, SEVERITIES, SCAN_COLUMNS, NOT_FINAL } from '../models.js';
import { requireUser, ownedBy } from '../auth.js';
import { parseRepo, isBranch, isId } from '../validate.js';
import { enqueue, cancel } from '../scanner/worker.js';
import { repoMeta, tooLargeMessage, MAX_REPO_KB } from '../scanner/scan.js';
import { subscribe, publish } from '../scanner/events.js';

const router = Router();
const DAILY_LIMIT = { free: 3, pro: 25, admin: Infinity };

router.use(requireUser);

router.post('/', async (req, res) => {
  const repo = parseRepo(req.body?.repoUrl);
  if (!repo) return res.status(400).json({ error: 'Paste a public GitHub repo URL, like https://github.com/owner/repo.' });
  const branch = typeof req.body?.branch === 'string' && req.body.branch.trim() ? req.body.branch.trim() : null;
  if (branch && !isBranch(branch)) return res.status(400).json({ error: 'That branch name is not valid.' });

  // A repo over the size limit is not refused outright: say so first, and scan only its files up to 1 MB if the user agrees.
  const skipLarge = req.body?.skipLarge === true;
  if (!skipLarge) {
    const meta = await repoMeta(repo).catch(() => null); // not-found and private repos are reported by the scan itself
    if (meta?.size > MAX_REPO_KB) return res.status(409).json({ error: tooLargeMessage(meta.size), code: 'repo_too_large', sizeKb: meta.size });
  }

  const userId = req.user.id;
  const running = 'You already have a scan running. Wait for it to finish.';
  if ((await sql(`SELECT 1 FROM scans WHERE user_id = $1 AND ${NOT_FINAL}`, [userId])).length) return res.status(409).json({ error: running });
  const limit = DAILY_LIMIT[req.user.role];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // A failed or cancelled scan whose engines never ran (a typo in the URL, a private repo) does not use up the day's scans.
  const [{ used }] = await sql(
    `SELECT count(*)::int AS used FROM scans
     WHERE user_id = $1 AND created_at >= $2 AND NOT (status IN ('failed', 'cancelled') AND jsonb_array_length(engines) = 0)`,
    [userId, today],
  );
  if (used >= limit) return res.status(429).json({ error: `Your plan allows ${limit} scans a day. Try again tomorrow or upgrade to Pro.` });

  let scan;
  try {
    [scan] = await sql(`INSERT INTO scans (user_id, repo_url, branch, skip_large) VALUES ($1, $2, $3, $4) RETURNING ${SCAN_COLUMNS}`, [userId, repo.url, branch, skipLarge]);
  } catch (e) {
    // Two requests in the same instant both passed the check above; the database lets only one unfinished scan exist.
    if (e.code === '23505') return res.status(409).json({ error: running });
    throw e;
  }
  enqueue(scan.id);
  res.status(201).json({ scan });
});

router.get('/', async (req, res) => {
  // Your own scans, admins included; an admin opens someone else's scan by its id.
  const scans = await sql(`SELECT ${SCAN_COLUMNS} FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
  res.json({ scans });
});

async function findScan(req, res) {
  const [scan] = isId(req.params.id) ? await sql('SELECT * FROM scans WHERE id = $1 AND ($2 OR user_id = $3)', [req.params.id, ...ownedBy(req)]) : [];
  if (!scan) res.status(404).json({ error: 'Scan not found.' });
  return scan;
}

router.get('/:id', async (req, res) => {
  const scan = await findScan(req, res);
  if (scan) res.json({ scan });
});

// Live progress: the current scan first, then the scan again after every change, closing when it ends.
router.get('/:id/events', async (req, res) => {
  const scan = await findScan(req, res);
  if (!scan) return;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();

  let closed = false;
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20_000); // stops proxies from dropping a quiet connection
  const stop = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };
  let chain = Promise.resolve(); // one read at a time, so updates reach the browser in order
  const send = () => {
    chain = chain.then(async () => {
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
  // Only a scan that has not finished can be cancelled; the filter makes this safe against a scan finishing at the same moment.
  const [cancelled] = await sql(`UPDATE scans SET status = 'cancelled', finished_at = now() WHERE id = $1 AND ${NOT_FINAL} RETURNING ${SCAN_COLUMNS}`, [scan.id]);
  if (!cancelled) return res.status(409).json({ error: 'This scan has already finished.' });
  cancel(scan.id);
  publish(scan.id);
  res.json({ scan: cancelled });
});

router.get('/:id/findings', async (req, res) => {
  const scan = await findScan(req, res);
  if (!scan) return;
  // Each filter adds one condition with its value as a parameter. The SQL text comes from this fixed list, never from the request.
  const where = ['scan_id = $1'];
  const params = [scan.id];
  const add = (condition, value) => typeof value === 'string' && where.push(condition.replace('?', `$${params.push(value)}`));
  add('severity = ?', req.query.severity);
  add('status = ?', req.query.status);
  add('file = ?', req.query.file);
  add('? = ANY(engines)', req.query.engine);
  add('? = ANY(owasp)', req.query.owasp);
  const findings = await sql(`SELECT * FROM findings WHERE ${where.join(' AND ')}`, params);
  findings.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  res.json({ findings });
});

export default router;
