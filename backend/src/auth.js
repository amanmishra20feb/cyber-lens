import jwt from 'jsonwebtoken';
import { sql } from './db.js';
import { USER_COLUMNS } from './models.js';
import { isId } from './validate.js';

if (!process.env.JWT_SECRET) {
  try { process.loadEnvFile?.(); } catch {}
  try { process.loadEnvFile?.(new URL('../.env', import.meta.url)); } catch {}
}

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 random characters.');

export const COOKIE = 'cl_token';
export const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.tokenVersion }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export async function requireUser(req, res, next) {
  let sub, v;
  try {
    ({ sub, v } = jwt.verify(req.cookies?.[COOKIE] ?? '', SECRET));
  } catch {
    // missing, expired or forged: treated as signed out
  }
  [req.user] = isId(sub) ? await sql(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [sub]) : [];
  // an old token stops working once the user signs out everywhere
  if (!req.user || req.user.tokenVersion !== v) return res.status(401).json({ error: 'Please sign in.' });
  next();
}
