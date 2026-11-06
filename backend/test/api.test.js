import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// The tests create and change rows, so they must never run on the real database.
if (process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL is the same as DATABASE_URL. Point it at a separate test database (a Neon branch).');
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'; // gitleaks:allow (a fake value for tests)
process.env.ADMIN_EMAILS = 'admin@example.com';
const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cl-static-'));
await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><div id="root"></div>');
process.env.STATIC_DIR = staticDir;
const { app } = await import('../src/app.js');
const { connect, close, sql } = await import('../src/db.js');

let server, base;
before(async () => {
  // In-memory Postgres (PGlite) by default; set TEST_DATABASE_URL to run the same tests against a real, empty Postgres.
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
// Rows written straight to the database, for states the API cannot create on its own (a finished scan, a finding).
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
  assert.equal(res.body.user.role, 'free');
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

test('emails listed in ADMIN_EMAILS become admin on sign up', async () => {
  assert.equal((await signup('admin@example.com')).body.user.role, 'admin');
});

test('a user cannot see another user’s scans or findings; an admin can', async () => {
  const bob = await signup('bob@example.com');
  const carol = await signup('carol@example.com');
  const admin = await call('/auth/login', { body: { email: 'admin@example.com', password: 'correct horse' } });
  const bobId = (await call('/auth/me', { cookie: bob.cookie })).body.user.id;
  const scan = await addScan(bobId);
  await addFinding(scan, { fingerprint: 'f1' });

  assert.equal((await call(`/scans/${scan.id}`, { cookie: bob.cookie })).status, 200);
  assert.equal((await call(`/scans/${scan.id}/findings`, { cookie: bob.cookie })).body.findings.length, 1);
  assert.equal((await call(`/scans/${scan.id}`, { cookie: carol.cookie })).status, 404);
  assert.equal((await call(`/scans/${scan.id}/findings`, { cookie: carol.cookie })).status, 404);
  assert.equal((await call('/scans', { cookie: carol.cookie })).body.scans.length, 0);
  assert.equal((await call('/scans', { cookie: admin.cookie })).body.scans.some((s) => s.id === scan.id), false); // the list is your own, even for an admin
  assert.equal((await call(`/scans/${scan.id}`, { cookie: admin.cookie })).status, 200);
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
  // The database itself refuses a second unfinished scan, so two requests in the same instant cannot both start one.
  await assert.rejects(addScan(daveId, { status: 'queued' }), { code: '23505' });
});

test('free accounts are limited to 3 scans a day', async () => {
  const erin = await signup('erin@example.com');
  const erinId = (await call('/auth/me', { cookie: erin.cookie })).body.user.id;
  for (let i = 0; i < 3; i++) await addScan(erinId);
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
  for (let i = 0; i < 3; i++) await addScan(fredId, { repoUrl: 'https://github.com/a/typo', status: 'failed', error: 'Repo not found.' });
  const res = await call('/scans', { cookie: fred.cookie, body: { repoUrl: 'https://github.com/a/b' } });
  assert.equal(res.status, 201);
  await call(`/scans/${res.body.scan.id}/cancel`, { cookie: fred.cookie, method: 'POST' });
});

// Reads the event stream until it ends (or the timeout hits) and returns the scan statuses it carried.
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

  // A scan cancelled while queued is skipped by the worker and stays cancelled.
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
  const owner = await call('/auth/login', { body: { email: 'bob@example.com', password: 'correct horse' } }); // an existing account: the suite is at the sign-up limit
  const scan = await addScan((await call('/auth/me', { cookie: owner.cookie })).body.user.id);
  // Shaped exactly like merge() output after snippets are read (scan.js).
  const full = { engines: ['semgrep', 'gitleaks'], ruleId: 'cyberlens.sql-injection', title: 'Sql injection', message: "Query built from \"input\" with 'quotes'", severity: 'critical', cwe: ['CWE-89'], owasp: ['A05:2025 - Injection'], file: 'src/db.js', line: 12, endLine: 14, snippet: 'const q = `SELECT * FROM t WHERE id = ${id}`; // ✓ ünïcode', snippetLine: 10, fingerprint: 'a'.repeat(64) };
  const bare = { engines: ['osv'], ruleId: 'GHSA-xxxx', title: 'lodash 4.17.0', message: 'Upgrade to 4.17.21', severity: 'low', cwe: [], owasp: [], file: 'package-lock.json', line: null, endLine: null, snippet: null, snippetLine: null, fingerprint: 'b'.repeat(64) };
  await insertFindings(sql, scan, [full, bare]);

  const { findings } = (await call(`/scans/${scan.id}/findings`, { cookie: owner.cookie })).body;
  const pick = (f) => Object.fromEntries(Object.keys(full).map((k) => [k, f[k]]));
  assert.deepEqual(findings.map(pick), [full, bare]); // sorted critical first
  assert.ok(findings.every((f) => f.status === 'open' && f.ignoreReason === null && f.scanId === scan.id));
  assert.equal((await call(`/scans/${scan.id}/findings?owasp=${encodeURIComponent('A05:2025 - Injection')}`, { cookie: owner.cookie })).body.findings.length, 1);
  assert.equal((await call(`/scans/${scan.id}/findings?engine=gitleaks`, { cookie: owner.cookie })).body.findings.length, 1);
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
  const list = await call(`/scans/${scan.id}/findings?status=ignored`, { cookie: jo.cookie });
  assert.equal(list.body.findings.length, 1);

  const reopened = await patch({ status: 'open', ignoreReason: 'false_positive' }); // a stale reason must not stick
  assert.deepEqual([reopened.body.finding.status, reopened.body.finding.ignoreReason], ['open', null]);
  assert.equal((await patch({ status: 'fixed' })).body.finding.status, 'fixed');

  assert.equal((await patch({ status: 'fixed' }, kit.cookie)).status, 404); // someone else's finding
  assert.equal((await patch({ status: 'fixed' }, jo.cookie, 'nope')).status, 404);
  assert.equal((await call(`/findings/${finding.id}`, { body: { status: 'open' }, method: 'PATCH' })).status, 401);
});

test('only admins can list users; the list has scan counts and never a password hash', async () => {
  const hank = await signup('hank@example.com');
  const hankId = (await call('/auth/me', { cookie: hank.cookie })).body.user.id;
  for (let i = 0; i < 2; i++) await addScan(hankId);
  const admin = await call('/auth/login', { body: { email: 'admin@example.com', password: 'correct horse' } });

  assert.equal((await call('/admin/users')).status, 401);
  assert.equal((await call('/admin/users', { cookie: hank.cookie })).status, 403);
  const { users } = (await call('/admin/users', { cookie: admin.cookie })).body;
  const row = users.find((u) => u.email === 'hank@example.com');
  assert.deepEqual({ name: row.name, role: row.role, scans: row.scans }, { name: 'Test', role: 'free', scans: 2 });
  assert.ok(row.createdAt);
  assert.equal(users.find((u) => u.email === 'admin@example.com').scans, 0);
  assert.ok(users.every((u) => u.passwordHash === undefined));
  assert.equal(users[0].email, 'hank@example.com'); // newest account first
});

test('an admin changes a plan, it applies at once, and nobody can change their own', async () => {
  const jack = await signup('jack@example.com');
  const jackId = (await call('/auth/me', { cookie: jack.cookie })).body.user.id;
  const admin = await call('/auth/login', { body: { email: 'admin@example.com', password: 'correct horse' } });
  const adminId = (await call('/auth/me', { cookie: admin.cookie })).body.user.id;
  const patch = (id, body, cookie = admin.cookie) => call(`/admin/users/${id}`, { cookie, body, method: 'PATCH' });

  assert.equal((await patch(jackId, { role: 'pro' }, jack.cookie)).status, 403);
  assert.equal((await patch(jackId, { role: 'owner' })).status, 400);
  assert.equal((await patch(jackId, {})).status, 400);
  assert.equal((await patch('not-an-id', { role: 'pro' })).status, 404);
  assert.equal((await patch('00000000-0000-0000-0000-000000000000', { role: 'pro' })).status, 404);
  assert.equal((await patch(adminId, { role: 'free' })).status, 400);
  assert.equal((await call('/auth/me', { cookie: admin.cookie })).body.user.role, 'admin');

  const res = await patch(jackId, { role: 'pro' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'pro');
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal((await call('/auth/me', { cookie: jack.cookie })).body.user.role, 'pro'); // same cookie, new plan
});

test('a repo over 200 MB asks first (409 with its size), and scans without its large files only when the user agrees', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, ...rest) => String(url).startsWith('https://api.github.com/')
    ? Promise.resolve(Response.json({ size: 1_452_612, private: false }))
    : realFetch(url, ...rest);
  try {
    const { cookie } = await signup('big@example.com');
    const ask = await call('/scans', { cookie, body: { repoUrl: 'https://github.com/owner/huge' } });
    assert.equal(ask.status, 409);
    assert.equal(ask.body.code, 'repo_too_large');
    assert.match(ask.body.error, /1\.5 GB/);
    assert.equal(await countRows('scans WHERE repo_url = $1', ['https://github.com/owner/huge']), 0); // asking costs nothing and creates nothing
    const agreed = await call('/scans', { cookie, body: { repoUrl: 'https://github.com/owner/huge', skipLarge: true } });
    assert.equal(agreed.status, 201);
    assert.equal(agreed.body.scan.skipLarge, true);
    await call(`/scans/${agreed.body.scan.id}/cancel`, { cookie, method: 'POST' });
  } finally {
    globalThis.fetch = realFetch;
  }
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
