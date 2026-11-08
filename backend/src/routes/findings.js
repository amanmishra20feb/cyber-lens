import { Router } from 'express';
import { sql } from '../db.js';
import { IGNORE_REASONS } from '../models.js';
import { requireUser } from '../auth.js';
import { isId } from '../validate.js';

const router = Router();
router.use(requireUser);

// Triage. An ignore reason is required when ignoring and cleared otherwise.
router.patch('/:id', async (req, res) => {
  const { status, ignoreReason } = req.body ?? {};
  if (!['open', 'fixed', 'ignored'].includes(status)) return res.status(400).json({ error: 'Choose open, fixed or ignored.' });
  if (status === 'ignored' && !IGNORE_REASONS.includes(ignoreReason)) return res.status(400).json({ error: 'Say why you are ignoring this finding: false positive, acceptable risk or no time to fix.' });

  const [finding] = isId(req.params.id)
    ? await sql(
        'UPDATE findings SET status = $1, ignore_reason = $2, updated_at = now() WHERE id = $3 AND user_id = $4 RETURNING *',
        [status, status === 'ignored' ? ignoreReason : null, req.params.id, req.user.id],
      )
    : [];
  if (!finding) return res.status(404).json({ error: 'Finding not found.' });
  res.json({ finding });
});

export default router;
