import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'; // gitleaks:allow (a fake value for tests)
const { app } = await import('../src/app.js');
const { connect, close, sql } = await import('../src/db.js');

let server, base, profile;
const realFetch = globalThis.fetch;
before(async () => {
  await connect(process.env.TEST_DATABASE_URL);
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
  // only Google's two addresses are faked; calls to our own server go through
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/')) return Response.json({ access_token: 'fake' });
    if (String(url).startsWith('https://openidconnect.googleapis.com/')) return Response.json(profile);
    return realFetch(url, options);
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await close();
});

const get = (path, cookie) => realFetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];
// the same two steps a browser takes: leave for Google, come back with the code
const signInWithGoogle = async (next = '') => {
  const start = await get(`/auth/google${next}`);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  return get(`/auth/google/callback?code=abc&state=${state}`, cookieOf(start));
};

test('without Google keys there is no Google button and the routes answer 404', async () => {
  assert.deepEqual(await (await get('/auth/providers')).json(), { google: false });
  assert.equal((await get('/auth/google')).status, 404);
});

test('Google sign-in creates an account without a password, returns the same one next time, and keeps the next page', async () => {
  process.env.GOOGLE_CLIENT_ID = 'client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret'; // gitleaks:allow (a fake value for tests)
  assert.deepEqual(await (await get('/auth/providers')).json(), { google: true });

  const start = await get('/auth/google');
  const url = new URL(start.headers.get('location'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.match(start.headers.get('set-cookie'), /HttpOnly/i);

  profile = { sub: '111', email: 'Gina@Example.com', email_verified: true, name: 'Gina' };
  const first = await signInWithGoogle(`?next=${encodeURIComponent('/app/scans/1.5')}`);
  assert.equal(first.status, 302);
  assert.equal(first.headers.get('location'), '/app/scans/1.5');
  const sessionCookie = first.headers.getSetCookie().find((c) => c.startsWith('cl_token')).split(';')[0];
  const me = await (await get('/auth/me', sessionCookie)).json();
  assert.equal(me.user.email, 'gina@example.com');

  assert.equal((await signInWithGoogle()).headers.get('location'), '/app');
  assert.equal((await sql('SELECT count(*)::int AS n FROM users'))[0].n, 1);
  assert.equal((await sql('SELECT password_hash FROM users'))[0].passwordHash, null);

  const login = await realFetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'gina@example.com', password: 'anything at all' }) });
  assert.equal(login.status, 401);
  assert.match((await login.json()).error, /Google/);
});

test('a wrong state, an unverified email and an email already used by a password account are refused', async () => {
  const start = await get('/auth/google');
  const wrong = await get('/auth/google/callback?code=abc&state=forged', cookieOf(start));
  assert.equal(wrong.headers.get('location'), '/login?error=google_failed');
  assert.equal((await get('/auth/google/callback?code=abc&state=forged')).headers.get('location'), '/login?error=google_failed');

  profile = { sub: '222', email: 'sam@example.com', email_verified: false, name: 'Sam' };
  assert.equal((await signInWithGoogle()).headers.get('location'), '/login?error=google_email');

  await sql('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)', ['pat@example.com', 'Pat', await bcrypt.hash('correct horse', 4)]);
  profile = { sub: '333', email: 'pat@example.com', email_verified: true, name: 'Pat' };
  assert.equal((await signInWithGoogle()).headers.get('location'), '/login?error=google_exists');
  assert.equal((await sql('SELECT count(*)::int AS n FROM users WHERE google_id IS NOT NULL'))[0].n, 1);
});
