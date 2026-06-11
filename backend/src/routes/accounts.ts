import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT a.*, c.code as currency_code, c.name as currency_name,
       a.start_balance
       + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id), 0)
       + COALESCE((SELECT SUM(rp.amount) FROM recurring_occurrences ro
                   JOIN recurring_payments rp ON ro.recurring_payment_id = rp.id
                   WHERE rp.account_id = a.id), 0)
       as current_balance
     FROM accounts a
     JOIN currencies c ON a.currency_id = c.id
     WHERE a.user_id = $1
     ORDER BY a.sort_order NULLS LAST, a.created_at`,
    [req.userId]
  );
  res.json(result.rows);
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, currency_id, start_balance } = req.body;
  if (!name || !currency_id) {
    res.status(400).json({ error: 'name and currency_id are required' });
    return;
  }

  const currencyCheck = await pool.query(
    'SELECT id FROM currencies WHERE id = $1 AND user_id = $2',
    [currency_id, req.userId]
  );
  if (currencyCheck.rows.length === 0) {
    res.status(404).json({ error: 'Currency not found' });
    return;
  }

  const result = await pool.query(
    `INSERT INTO accounts (user_id, name, currency_id, start_balance, sort_order)
     VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(sort_order) + 1 FROM accounts WHERE user_id = $1), 0))
     RETURNING *`,
    [req.userId, name, currency_id, start_balance ?? 0]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT a.*, c.code as currency_code, c.name as currency_name,
       a.start_balance
       + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id), 0)
       + COALESCE((SELECT SUM(rp.amount) FROM recurring_occurrences ro
                   JOIN recurring_payments rp ON ro.recurring_payment_id = rp.id
                   WHERE rp.account_id = a.id), 0)
       as current_balance
     FROM accounts a
     JOIN currencies c ON a.currency_id = c.id
     WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json(result.rows[0]);
});

router.put('/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < ids.length; i++) {
      await client.query(
        'UPDATE accounts SET sort_order = $1 WHERE id = $2 AND user_id = $3',
        [i, ids[i], req.userId]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, start_balance } = req.body;
  const result = await pool.query(
    'UPDATE accounts SET name = COALESCE($1, name), start_balance = COALESCE($2, start_balance) WHERE id = $3 AND user_id = $4 RETURNING *',
    [name, start_balance, req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    'DELETE FROM accounts WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
