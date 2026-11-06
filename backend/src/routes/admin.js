import { Router } from 'express';
import { sql } from '../db.js';
import { ROLES, USER_COLUMNS } from '../models.js';
import { requireUser, requireRole } from '../auth.js';
import { isId } from '../validate.js';

const router = Router();
router.use(requireUser, requireRole('admin'));

// Every account, newest first, with how many scans it has run. Only USER_COLUMNS leave the server: never the password hash.
router.get('/users', async (req, res) => {
  // shortcut: the newest 500 accounts in one list, add paging and search past that
  const users = await sql(
    `SELECT ${USER_COLUMNS.split(', ').map((c) => `u.${c}`).join(', ')}, count(s.id)::int AS scans
     FROM users u LEFT JOIN scans s ON s.user_id = u.id
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 500`,
  );
  res.json({ users });
});

// Change someone's plan. It applies on their next request, because requireUser reloads the user every time.
// Your own plan is fixed, so the last admin can never lock everyone out.
router.patch('/users/:id', async (req, res) => {
  const { role } = req.body ?? {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Choose Free, Pro or Admin.' });
  if (!isId(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  if (req.params.id.toLowerCase() === req.user.id) return res.status(400).json({ error: 'You cannot change your own plan. Ask another admin.' });
  const [user] = await sql(`UPDATE users SET role = $1 WHERE id = $2 RETURNING ${USER_COLUMNS}`, [role, req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user });
});

export default router;
