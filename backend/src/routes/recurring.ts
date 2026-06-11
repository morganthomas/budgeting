import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const VALID_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'];

function toDateStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).split('T')[0];
}

function generateDates(startDate: string, upToDate: string, frequency: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T12:00:00Z');
  const end = new Date(upToDate + 'T23:59:59Z');
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    switch (frequency) {
      case 'daily':    current.setUTCDate(current.getUTCDate() + 1); break;
      case 'weekly':   current.setUTCDate(current.getUTCDate() + 7); break;
      case 'biweekly': current.setUTCDate(current.getUTCDate() + 14); break;
      case 'monthly':  current.setUTCMonth(current.getUTCMonth() + 1); break;
      case 'yearly':   current.setUTCFullYear(current.getUTCFullYear() + 1); break;
    }
  }
  return dates;
}

async function ensureOccurrences(rpId: string): Promise<void> {
  const { rows } = await pool.query('SELECT * FROM recurring_payments WHERE id = $1', [rpId]);
  if (rows.length === 0) return;
  const startDate = toDateStr(rows[0].start_date)!;
  const endDate = toDateStr(rows[0].end_date);
  const { frequency } = rows[0];
  const today = new Date().toISOString().split('T')[0];
  const upTo = endDate && endDate <= today ? endDate : today;
  const dates = generateDates(startDate, upTo, frequency);
  if (dates.length === 0) return;
  const placeholders = dates.map((_, i) => `($1, $${i + 2})`).join(', ');
  await pool.query(
    `INSERT INTO recurring_occurrences (recurring_payment_id, due_date) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
    [rpId, ...dates]
  );
}

// List all recurring payments
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT rp.*, a.name AS account_name, c.code AS currency_code, cat.name AS category_name
     FROM recurring_payments rp
     JOIN accounts a ON rp.account_id = a.id
     JOIN currencies c ON a.currency_id = c.id
     LEFT JOIN categories cat ON rp.category_id = cat.id
     WHERE rp.user_id = $1
     ORDER BY rp.created_at`,
    [req.userId]
  );
  res.json(rows);
});

// Create a recurring payment
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { account_id, counterparty, amount, category_id, frequency, start_date, end_date } = req.body;

  if (!account_id || !counterparty || amount == null || !frequency || !start_date) {
    res.status(400).json({ error: 'account_id, counterparty, amount, frequency, and start_date are required' });
    return;
  }
  if (!VALID_FREQUENCIES.includes(frequency)) {
    res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
    return;
  }
  if (end_date && end_date < start_date) {
    res.status(400).json({ error: 'end_date cannot be before start_date' });
    return;
  }

  const accountCheck = await pool.query(
    'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
    [account_id, req.userId]
  );
  if (accountCheck.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  if (category_id) {
    const catCheck = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [category_id, req.userId]);
    if (catCheck.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO recurring_payments (user_id, account_id, counterparty, amount, category_id, frequency, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [req.userId, account_id, counterparty, amount, category_id ?? null, frequency, start_date, end_date ?? null]
  );
  await ensureOccurrences(rows[0].id);

  const result = await pool.query(
    `SELECT rp.*, a.name AS account_name, c.code AS currency_code, cat.name AS category_name
     FROM recurring_payments rp
     JOIN accounts a ON rp.account_id = a.id
     JOIN currencies c ON a.currency_id = c.id
     LEFT JOIN categories cat ON rp.category_id = cat.id
     WHERE rp.id = $1`,
    [rows[0].id]
  );
  res.status(201).json(result.rows[0]);
});

// End a recurring payment (set end_date to today)
router.put('/:id/end', async (req: AuthRequest, res: Response): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  const check = await pool.query(
    'SELECT id FROM recurring_payments WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (check.rows.length === 0) {
    res.status(404).json({ error: 'Recurring payment not found' });
    return;
  }
  await pool.query(
    'UPDATE recurring_payments SET end_date = $1 WHERE id = $2',
    [today, req.params.id]
  );
  // Drop future unverified occurrences
  await pool.query(
    'DELETE FROM recurring_occurrences WHERE recurring_payment_id = $1 AND due_date > $2 AND NOT verified',
    [req.params.id, today]
  );
  res.json({ ok: true });
});

// Update a recurring payment
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { account_id, counterparty, amount, category_id, frequency, start_date, end_date } = req.body;

  const check = await pool.query(
    'SELECT id FROM recurring_payments WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (check.rows.length === 0) {
    res.status(404).json({ error: 'Recurring payment not found' });
    return;
  }

  if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
    res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
    return;
  }
  if (start_date && end_date && end_date < start_date) {
    res.status(400).json({ error: 'end_date cannot be before start_date' });
    return;
  }

  if (account_id) {
    const accountCheck = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [account_id, req.userId]);
    if (accountCheck.rows.length === 0) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
  }
  if (category_id) {
    const catCheck = await pool.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [category_id, req.userId]);
    if (catCheck.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
  }

  const hasCategoryId = 'category_id' in req.body;
  await pool.query(
    `UPDATE recurring_payments SET
       account_id   = COALESCE($1, account_id),
       counterparty = COALESCE($2, counterparty),
       amount       = COALESCE($3, amount),
       category_id  = CASE WHEN $4 THEN $5 ELSE category_id END,
       frequency    = COALESCE($6, frequency),
       start_date   = COALESCE($7, start_date),
       end_date     = CASE WHEN $8 THEN $9 ELSE end_date END
     WHERE id = $10`,
    [
      account_id ?? null,
      counterparty ?? null,
      amount ?? null,
      hasCategoryId, category_id ?? null,
      frequency ?? null,
      start_date ?? null,
      'end_date' in req.body, end_date ?? null,
      req.params.id,
    ]
  );

  // Remove unverified occurrences that fall outside the new date range
  const updated = await pool.query('SELECT * FROM recurring_payments WHERE id = $1', [req.params.id]);
  const rp = updated.rows[0];
  const rpStartDate = toDateStr(rp.start_date)!;
  const rpEndDate = toDateStr(rp.end_date);
  await pool.query(
    'DELETE FROM recurring_occurrences WHERE recurring_payment_id = $1 AND due_date < $2 AND NOT verified',
    [req.params.id, rpStartDate]
  );
  if (rpEndDate) {
    await pool.query(
      'DELETE FROM recurring_occurrences WHERE recurring_payment_id = $1 AND due_date > $2 AND NOT verified',
      [req.params.id, rpEndDate]
    );
  }
  await ensureOccurrences(req.params.id);

  const result = await pool.query(
    `SELECT rp.*, a.name AS account_name, c.code AS currency_code, cat.name AS category_name
     FROM recurring_payments rp
     JOIN accounts a ON rp.account_id = a.id
     JOIN currencies c ON a.currency_id = c.id
     LEFT JOIN categories cat ON rp.category_id = cat.id
     WHERE rp.id = $1`,
    [req.params.id]
  );
  res.json(result.rows[0]);
});

// Delete a recurring payment (cascades to occurrences)
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    'DELETE FROM recurring_payments WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Recurring payment not found' });
    return;
  }
  res.json({ ok: true });
});

// Get occurrences for an account (generates pending ones first)
router.get('/occurrences/account/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const accountCheck = await pool.query(
    'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
    [req.params.accountId, req.userId]
  );
  if (accountCheck.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  // Generate any pending occurrences for recurring payments on this account
  const rps = await pool.query(
    'SELECT id FROM recurring_payments WHERE account_id = $1 AND user_id = $2',
    [req.params.accountId, req.userId]
  );
  await Promise.all(rps.rows.map((rp: { id: string }) => ensureOccurrences(rp.id)));

  const { rows } = await pool.query(
    `SELECT ro.id, ro.recurring_payment_id, ro.due_date, ro.verified,
            rp.counterparty, rp.amount, rp.category_id, cat.name AS category_name
     FROM recurring_occurrences ro
     JOIN recurring_payments rp ON ro.recurring_payment_id = rp.id
     LEFT JOIN categories cat ON rp.category_id = cat.id
     WHERE rp.account_id = $1 AND rp.user_id = $2
     ORDER BY ro.due_date DESC`,
    [req.params.accountId, req.userId]
  );
  res.json(rows);
});

// Toggle verified on an occurrence
router.put('/occurrences/:id/verify', async (req: AuthRequest, res: Response): Promise<void> => {
  const check = await pool.query(
    `SELECT ro.id FROM recurring_occurrences ro
     JOIN recurring_payments rp ON ro.recurring_payment_id = rp.id
     WHERE ro.id = $1 AND rp.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (check.rows.length === 0) {
    res.status(404).json({ error: 'Occurrence not found' });
    return;
  }
  const { rows } = await pool.query(
    'UPDATE recurring_occurrences SET verified = NOT verified WHERE id = $1 RETURNING verified',
    [req.params.id]
  );
  res.json({ verified: rows[0].verified });
});

export default router;
