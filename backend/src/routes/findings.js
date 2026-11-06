import { Router } from 'express';
import { sql } from '../db.js';
import { IGNORE_REASONS } from '../models.js';
import { requireUser, ownedBy } from '../auth.js';
import { isId } from '../validate.js';

const router = Router();
router.use(requireUser);

// Triage: mark a finding open, fixed, or ignored (with a reason). A reason only exists while ignored.
router.patch('/:id', async (req, res) => {
  const { status, ignoreReason } = req.body ?? {};
  if (!['open', 'fixed', 'ignored'].includes(status)) return res.status(400).json({ error: 'Choose open, fixed or ignored.' });
  if (status === 'ignored' && !IGNORE_REASONS.includes(ignoreReason)) return res.status(400).json({ error: 'Say why you are ignoring this finding: false positive, acceptable risk or no time to fix.' });

  const [finding] = isId(req.params.id)
    ? await sql(
        'UPDATE findings SET status = $1, ignore_reason = $2, updated_at = now() WHERE id = $3 AND ($4 OR user_id = $5) RETURNING *',
        [status, status === 'ignored' ? ignoreReason : null, req.params.id, ...ownedBy(req)],
      )
    : [];
  if (!finding) return res.status(404).json({ error: 'Finding not found.' });
  res.json({ finding });
});

export default router;
