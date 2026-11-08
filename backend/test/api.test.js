import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// never run these against the real database
if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. Point it at a separate test database (a Neon branch).');
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'; // gitleaks:allow (a fake value for tests)
const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cl-static-'));
await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><div id="root"></div>');
process.env.STATIC_DIR = staticDir;
const { app } = await import('../src/app.js');
const { connect, close, sql } = await import('../src/db.js');

let server, base;
before(async () => {
  // PGlite in memory unless TEST_DATABASE_URL points at an empty Postgres
  await connect(process.env.TEST_DATABASE_URL);
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
});
after(async () => {
  await fs.rm(staticDir, { recursive: true, force: true });
  server.close();
  await close();
});

const call = async (path, { cookie, body, method = body ? 'POST' : 'GET' } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie && { cookie }) }, body: body && JSON.stringify(body) });
  return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0], setCookie: res.headers.get('set-cookie'), body: res.status === 204 ? null : await res.json() };
};
const signup = (email) => call('/auth/signup', { body: { email, password: 'correct horse', name: 'Test' } });
// for states the API can't create by itself, like a finished scan
const addScan = async (userId, { repoUrl = 'https://github.com/a/b', status = 'done', error = null } = {}) =>
  (await sql('INSERT INTO scans (user_id, repo_url, status, error) VALUES ($1, $2, $3, $4) RETURNING *', [userId, repoUrl, status, error]))[0];
const addFinding = async (scan, { fingerprint, severity = 'high', file = 'a.js', line = 1, title = 'x' }) =>
  (await sql('INSERT INTO findings (scan_id, user_id, severity, file, line, fingerprint, title) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [scan.id, scan.userId, severity, file, line, fingerprint, title]))[0];
const countRows = async (query, params) => (await sql(`SELECT count(*)::int AS n FROM ${query}`, params))[0].n;

test('sign up sets an httpOnly cookie, never returns the password hash, and /me works', async () => {
  const res = await signup('alice@example.com');
  assert.equal(res.status, 201);
  assert.match(res.setCookie, /HttpOnly/i);
  assert.match(res.setCookie, /SameSite=Lax/i);
  assert.equal(res.body.user.passwordHash, undefined);
  const me = await call('/auth/me', { cookie: res.cookie });
  assert.equal(me.body.user.email, 'alice@example.com');
});

test('duplicate email, bad input, wrong password and missing cookie are refused', async () => {
  assert.equal((await signup('alice@example.com')).status, 409);
  assert.equal((await call('/auth/signup', { body: { email: 'x', password: 'short', name: '' } })).status, 400);
  assert.equal((await call('/auth/login', { body: { email: 'alice@example.com', password: 'wrong password' } })).status, 401);
  assert.equal((await call('/auth/login', { body: { email: { $ne: null }, password: 'x' } })).status, 401);
  assert.equal((await call('/auth/me')).status, 401);
  assert.equal((await call('/auth/me', { cookie: 'cl_token=forged' })).status, 401);
});

test('login works and logout clears the cookie', async () => {
  const res = await call('/auth/login', { body: { email: 'ALICE@example.com', password: 'correct horse' } });
  assert.equal(res.status, 200);
  const out = await call('/auth/logout', { cookie: res.cookie, method: 'POST' });
  assert.equal(out.status, 204);
  assert.match(out.setCookie, /cl_token=;/);
});

test('a user cannot see another user’s scans or findings', async () => {
  const bob = await signup('bob@example.com');
  const carol = await signup('carol@example.com');
  const bobId = (await call('/auth/me', { cookie: bob.cookie })).body.user.id;
  const scan = await addScan(bobId);
  await addFinding(scan, { fingerprint: 'f1' });

  assert.equal((await call(`/scans/${scan.id}`, { cookie: bob.cookie })).status, 200);
  assert.equal((await call(`/scans/${scan.id}/findings`, { cookie: bob.cookie })).body.findings.length, 1);
  assert.equal((await call(`/scans/${scan.id}`, { cookie: carol.cookie })).status, 404);
  assert.equal((await call(`/scans/${scan.id}/findings`, { cookie: carol.cookie })).status, 404);
  assert.equal((await call('/scans', { cookie: carol.cookie })).body.scans.length, 0);
  assert.equal((await call('/scans/not-an-id', { cookie: bob.cookie })).status, 404);
});

test('starting a scan validates the URL and allows one running scan per user', async () => {
  const dave = await signup('dave@example.com');
  assert.equal((await call('/scans', { cookie: dave.cookie, body: { repoUrl: 'https://gitlab.com/a/b' } })).status, 400);
  assert.equal((await call('/scans', { cookie: dave.cookie, body: { repoUrl: 'https://github.com/a/b', branch: '--upload-pack=x' } })).status, 400);
  const daveId = (await call('/auth/me', { cookie: dave.cookie })).body.user.id;
  await addScan(daveId, { status: 'scanning' });
  const busy = await call('/scans', { cookie: dave.cookie, body: { repoUrl: 'https://github.com/a/b' } });
  assert.equal(busy.status, 409);
  // the unique index refuses it too, so two requests at once can't both start a scan
  await assert.rejects(addScan(daveId, { status: 'queued' }), { code: '23505' });
});

test('an account can run 25 scans a day', async () => {
  const erin = await signup('erin@example.com');
  const erinId = (await call('/auth/me', { cookie: erin.cookie })).body.user.id;
  for (let i = 0; i < 25; i++) await addScan(erinId);
  const res = await call('/scans', { cookie: erin.cookie, body: { repoUrl: 'https://github.com/a/b' } });
  assert.equal(res.status, 429);
});

test('the scan list shows the newest scan first', async () => {
  const gina = await signup('gina@example.com');
  const ginaId = (await call('/auth/me', { cookie: gina.cookie })).body.user.id;
  await addScan(ginaId, { repoUrl: 'https://github.com/a/older' });
  await new Promise((r) => setTimeout(r, 5));
  await addScan(ginaId, { repoUrl: 'https://github.com/a/newer' });
  const { scans } = (await call('/scans', { cookie: gina.cookie })).body;
  assert.deepEqual(scans.map((s) => s.repoUrl), ['https://github.com/a/newer', 'https://github.com/a/older']);
});

test('scans that failed before any engine ran do not use up the daily limit', async () => {
  const fred = await signup('fred@example.com');
  const fredId = (await call('/auth/me', { cookie: fred.cookie })).body.user.id;
  for (let i = 0; i < 25; i++) await addScan(fredId, { repoUrl: 'https://github.com/a/typo', status: 'failed', error: 'Repo not found.' });
  const res = await call('/scans', { cookie: fred.cookie, body: { repoUrl: 'https://github.com/a/b' } });
  assert.equal(res.status, 201);
  await call(`/scans/${res.body.scan.id}/cancel`, { cookie: fred.cookie, method: 'POST' });
});

// reads the event stream until it closes and returns the statuses it sent
async function readStatuses(path, cookie, between) {
  const res = await fetch(base + path, { headers: { cookie }, signal: AbortSignal.timeout(5000) });
  if (res.status !== 200) return { status: res.status, statuses: [] };
  const reader = res.body.getReader();
  let text = '';
  between?.();
  for (let r = await reader.read(); !r.done; r = await reader.read()) text += new TextDecoder().decode(r.value);
  const statuses = [...text.matchAll(/^data: (.+)$/gm)].map((m) => JSON.parse(m[1]).status).filter((s, i, all) => s !== all[i - 1]);
  return { status: 200, statuses, hasFiles: text.includes('"files"') };
}

test('the event stream sends the scan, then each change, then closes when the scan ends', async () => {
  const { publish } = await import('../src/scanner/events.js');
  const fay = await signup('fay@example.com');
  const gus = await signup('gus@example.com');
  const fayId = (await call('/auth/me', { cookie: fay.cookie })).body.user.id;
  const scan = await addScan(fayId, { status: 'cloning' });
  const later = async () => {
    await new Promise((r) => setTimeout(r, 150));
    await sql("UPDATE scans SET status = 'scanning', engines = engines || $2::jsonb WHERE id = $1", [scan.id, JSON.stringify([{ name: 'semgrep', ok: true, count: 2, ms: 10 }])]);
    publish(scan.id);
    await new Promise((r) => setTimeout(r, 150));
    await sql("UPDATE scans SET status = 'done' WHERE id = $1", [scan.id]);
    publish(scan.id);
  };
  const result = await readStatuses(`/scans/${scan.id}/events`, fay.cookie, later);
  assert.deepEqual(result.statuses, ['cloning', 'scanning', 'done']);
  assert.equal(result.hasFiles, false); // the Repo Map data is large and not part of progress events
  assert.equal((await readStatuses(`/scans/${scan.id}/events`, gus.cookie)).status, 404);
  assert.equal((await readStatuses(`/scans/${scan.id}/events`, 'cl_token=forged')).status, 401);
  assert.deepEqual((await readStatuses(`/scans/${scan.id}/events`, fay.cookie)).statuses, ['done']); // a finished scan sends once and closes
});

test('cancel stops an unfinished scan, refuses a finished one, and respects ownership', async () => {
  const { enqueue } = await import('../src/scanner/worker.js');
  const hal = await signup('hal@example.com');
  const ivy = await signup('ivy@example.com');
  const halId = (await call('/auth/me', { cookie: hal.cookie })).body.user.id;
  const running = await addScan(halId, { status: 'scanning' });

  assert.equal((await call(`/scans/${running.id}/cancel`, { cookie: ivy.cookie, method: 'POST' })).status, 404);
  const ok = await call(`/scans/${running.id}/cancel`, { cookie: hal.cookie, method: 'POST' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.scan.status, 'cancelled');
  assert.equal((await call(`/scans/${running.id}/cancel`, { cookie: hal.cookie, method: 'POST' })).status, 409); // already final

  // cancelled while queued: the worker skips it
  const queued = await addScan(halId, { status: 'queued' });
  await call(`/scans/${queued.id}/cancel`, { cookie: hal.cookie, method: 'POST' });
  enqueue(queued.id);
  await new Promise((r) => setTimeout(r, 300));
  const [after] = await sql('SELECT status FROM scans WHERE id = $1', [queued.id]);
  assert.equal(after.status, 'cancelled');
  assert.equal(await countRows('findings WHERE scan_id = $1', [queued.id]), 0);
});

test('saving a scan keeps every finding field, including lists, empty values and odd characters', async () => {
  const { insertFindings } = await import('../src/scanner/worker.js');
  // log in instead of signing up: the suite is at the sign-up rate limit
  const owner = await call('/auth/login', { body: { email: 'bob@example.com', password: 'correct horse' } });
  const scan = await addScan((await call('/auth/me', { cookie: owner.cookie })).body.user.id);
  const full = { engines: ['semgrep', 'gitleaks'], ruleId: 'cyberlens.sql-injection', title: 'Sql injection', message: "Query built from \"input\" with 'quotes'", severity: 'critical', cwe: ['CWE-89'], owasp: ['A05:2025 - Injection'], file: 'src/db.js', line: 12, endLine: 14, snippet: 'const q = `SELECT * FROM t WHERE id = ${id}`; // ✓ ünïcode', snippetLine: 10, fingerprint: 'a'.repeat(64) };
  const bare = { engines: ['osv'], ruleId: 'GHSA-xxxx', title: 'lodash 4.17.0', message: 'Upgrade to 4.17.21', severity: 'low', cwe: [], owasp: [], file: 'package-lock.json', line: null, endLine: null, snippet: null, snippetLine: null, fingerprint: 'b'.repeat(64) };
  await insertFindings(sql, scan, [full, bare]);

  const { findings } = (await call(`/scans/${scan.id}/findings`, { cookie: owner.cookie })).body;
  const pick = (f) => Object.fromEntries(Object.keys(full).map((k) => [k, f[k]]));
  assert.deepEqual(findings.map(pick), [full, bare]); // sorted critical first
  assert.ok(findings.every((f) => f.status === 'open' && f.ignoreReason === null && f.scanId === scan.id));
});

test('triage: ignore needs a reason, reopening clears it, and only the owner can triage', async () => {
  const jo = await signup('jo@example.com');
  const kit = await signup('kit@example.com');
  const joId = (await call('/auth/me', { cookie: jo.cookie })).body.user.id;
  const scan = await addScan(joId);
  const finding = await addFinding(scan, { fingerprint: 'tri1' });
  const patch = (body, cookie = jo.cookie, id = finding.id) => call(`/findings/${id}`, { cookie, body, method: 'PATCH' });

  assert.equal((await patch({ status: 'ignored' })).status, 400); // no reason
  assert.equal((await patch({ status: 'ignored', ignoreReason: 'because' })).status, 400); // not an allowed reason
  assert.equal((await patch({ status: 'done' })).status, 400);
  assert.equal((await patch({ status: { $ne: 'open' } })).status, 400);

  const ignored = await patch({ status: 'ignored', ignoreReason: 'false_positive' });
  assert.deepEqual([ignored.body.finding.status, ignored.body.finding.ignoreReason], ['ignored', 'false_positive']);
  const list = await call(`/scans/${scan.id}/findings`, { cookie: jo.cookie });
  assert.equal(list.body.findings[0].status, 'ignored');

  const reopened = await patch({ status: 'open', ignoreReason: 'false_positive' }); // a stale reason must not stick
  assert.deepEqual([reopened.body.finding.status, reopened.body.finding.ignoreReason], ['open', null]);
  assert.equal((await patch({ status: 'fixed' })).body.finding.status, 'fixed');

  assert.equal((await patch({ status: 'fixed' }, kit.cookie)).status, 404); // someone else's finding
  assert.equal((await patch({ status: 'fixed' }, jo.cookie, 'nope')).status, 404);
  assert.equal((await call(`/findings/${finding.id}`, { body: { status: 'open' }, method: 'PATCH' })).status, 401);
});

test('with STATIC_DIR the API also serves the app: any page gives index.html, unknown /api paths stay JSON 404', async () => {
  const origin = base.replace('/api', '');
  for (const url of ['/', '/app/scans/abc', '/login']) {
    const res = await fetch(origin + url);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /id="root"/);
  }
  const missing = await fetch(`${base}/nope`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'Not found.');
  assert.equal((await call('/health')).body.ok, true);
});
