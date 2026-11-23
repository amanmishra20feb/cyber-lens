import { Router } from 'express';
import crypto from 'node:crypto';
import { sql } from '../db.js';
import { USER_COLUMNS } from '../models.js';
import { cookieOptions, setSession } from '../auth.js';

const router = Router();
const STATE_COOKIE = 'cl_oauth';
const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// Google only accepts redirect URLs registered in its console, so a forged Host header gets refused there
const redirectUri = (req) => `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
// only paths inside the app, never another site
const safeNext = (next) => (typeof next === 'string' && next.startsWith('/app') ? next : '/app');
const fail = (res, code) => res.redirect(`/login?error=${code}`);
const notSetUp = (res) => res.status(404).json({ error: 'Sign in with Google is not set up.' });

router.get('/providers', (req, res) => res.json({ google: configured() }));

router.get('/google', (req, res) => {
  if (!configured()) return notSetUp(res);
  // the state proves the answer comes back to the browser that asked
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, `${state}.${safeNext(req.query.next)}`, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  }));
});

router.get('/google/callback', async (req, res) => {
  if (!configured()) return notSetUp(res);
  const saved = String(req.cookies?.[STATE_COOKIE] ?? '');
  const dot = saved.indexOf('.');
  const state = saved.slice(0, dot);
  res.clearCookie(STATE_COOKIE, cookieOptions);
  if (req.query.error) return fail(res, 'google_denied');
  if (!state || req.query.state !== state || typeof req.query.code !== 'string') return fail(res, 'google_failed');

  let profile;
  try {
    const signal = AbortSignal.timeout(10_000);
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req),
        grant_type: 'authorization_code',
      }),
      signal,
    });
    if (!token.ok) throw new Error(`token request answered ${token.status}`);
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${(await token.json()).access_token}` },
      signal,
    });
    if (!info.ok) throw new Error(`profile request answered ${info.status}`);
    profile = await info.json();
  } catch (e) {
    console.error('Google sign-in failed:', e.message);
    return fail(res, 'google_failed');
  }

  const { sub, email, email_verified: verified, name } = profile;
  if (!sub || typeof email !== 'string' || verified !== true) return fail(res, 'google_email');
  const clean = email.toLowerCase();

  let [user] = await sql(`SELECT ${USER_COLUMNS} FROM users WHERE google_id = $1`, [sub]);
  if (!user) {
    try {
      [user] = await sql(
        `INSERT INTO users (email, name, google_id) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
        [clean, (name || clean.split('@')[0]).slice(0, 80), sub],
      );
    } catch (e) {
      // not linked by email: sign-up does not verify addresses, so a password account could belong to someone else
      if (e.code === '23505') return fail(res, 'google_exists');
      throw e;
    }
  }
  setSession(res, user);
  res.redirect(safeNext(saved.slice(dot + 1)));
});

export default router;
