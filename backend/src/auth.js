import jwt from 'jsonwebtoken';
import { sql } from './db.js';
import { USER_COLUMNS } from './models.js';
import { isId } from './validate.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 random characters.');

export const COOKIE = 'cl_token';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' };

export function setSession(res, user) {
  res.cookie(COOKIE, jwt.sign({ sub: user.id }, SECRET, { expiresIn: '7d' }), { ...cookieOptions, maxAge: WEEK_MS });
}

// Loads the user on every request, so a role change by an admin applies at once.
export async function requireUser(req, res, next) {
  let sub = null;
  try {
    ({ sub } = jwt.verify(req.cookies[COOKIE] ?? '', SECRET));
  } catch {
    // missing, expired or forged token: treated the same as signed out
  }
  // A database error is not caught here: it should be a 500, not a confusing "Please sign in."
  [req.user] = isId(sub) ? await sql(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [sub]) : [];
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have access to this.' });

// Ownership for every scan and finding query: admins see everything, everyone else only their own rows.
// Use as `… AND ($2 OR user_id = $3)` with params [..., ...ownedBy(req)].
export const ownedBy = (req) => [req.user.role === 'admin', req.user.id];
