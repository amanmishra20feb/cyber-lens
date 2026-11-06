import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { sql } from '../db.js';
import { USER_COLUMNS } from '../models.js';
import { COOKIE, cookieOptions, setSession, requireUser } from '../auth.js';

const router = Router();
const limit = (max, keyGenerator) => rateLimit({ windowMs: 60_000, limit: max, keyGenerator, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Wait a minute and try again.' } });
// Login is limited per IP and email, so a classroom behind one IP is not locked out together.
const loginLimit = limit(5, (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '').toLowerCase()}`);
const signupLimit = limit(20);
const admins = (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean);
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12); // compare against this when the email is unknown

router.post('/signup', signupLimit, async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72)
    return res.status(400).json({ error: 'Use a password between 8 and 72 characters.' });
  if (typeof name !== 'string' || !name.trim() || name.length > 80) return res.status(400).json({ error: 'Enter your name.' });

  const clean = email.trim().toLowerCase();
  let user;
  try {
    [user] = await sql(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING ${USER_COLUMNS}`,
      [clean, name.trim(), await bcrypt.hash(password, 12), admins.includes(clean) ? 'admin' : 'free'],
    );
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' }); // unique email
    throw e;
  }
  setSession(res, user);
  res.status(201).json({ user });
});

router.post('/login', loginLimit, async (req, res) => {
  const { email, password } = req.body ?? {};
  const [found] = await sql(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`, [String(email ?? '').trim().toLowerCase()]);
  const ok = await bcrypt.compare(String(password ?? ''), found?.passwordHash ?? DUMMY_HASH);
  if (!found || !ok) return res.status(401).json({ error: 'Email or password is wrong.' });
  const { passwordHash, ...user } = found; // the hash never leaves this function
  setSession(res, user);
  res.json({ user });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, cookieOptions);
  res.status(204).end();
});

router.get('/me', requireUser, (req, res) => res.json({ user: req.user }));

export default router;
