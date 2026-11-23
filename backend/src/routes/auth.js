import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { sql } from '../db.js';
import { NOT_FINAL, USER_COLUMNS } from '../models.js';
import { COOKIE, cookieOptions, setSession, requireUser } from '../auth.js';
import { cancel } from '../scanner/worker.js';

const router = Router();
const limiter = (max, keyGenerator) =>
  rateLimit({ windowMs: 60_000, limit: max, keyGenerator, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Wait a minute and try again.' } });
// keyed on IP + email, so one shared college network doesn't lock everyone out
const loginLimit = limiter(5, (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '').toLowerCase()}`);
const signupLimit = limiter(20);
// compared when the email doesn't exist, so that case takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12);

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
      `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
      [clean, name.trim(), await bcrypt.hash(password, 12)],
    );
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    throw e;
  }
  setSession(res, user);
  res.status(201).json({ user });
});

router.post('/login', loginLimit, async (req, res) => {
  const { email, password } = req.body ?? {};
  const [found] = await sql(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`, [String(email ?? '').trim().toLowerCase()]);
  const ok = await bcrypt.compare(String(password ?? ''), found?.passwordHash ?? DUMMY_HASH);
  if (found && !found.passwordHash) return res.status(401).json({ error: 'This account signs in with Google. Use Continue with Google.' });
  if (!found || !ok) return res.status(401).json({ error: 'Email or password is wrong.' });
  const { passwordHash, ...user } = found;
  setSession(res, user);
  res.json({ user });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, cookieOptions);
  res.status(204).end();
});

router.post('/logout-all', requireUser, async (req, res) => {
  await sql('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  res.clearCookie(COOKIE, cookieOptions);
  res.status(204).end();
});

router.get('/me', requireUser, (req, res) => res.json({ user: req.user }));

// Scans and findings go with the account (ON DELETE CASCADE); running scans are stopped first.
router.delete('/me', requireUser, async (req, res) => {
  const running = await sql(`SELECT id FROM scans WHERE user_id = $1 AND ${NOT_FINAL}`, [req.user.id]);
  running.forEach((scan) => cancel(scan.id));
  await sql('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.clearCookie(COOKIE, cookieOptions);
  res.status(204).end();
});

export default router;
