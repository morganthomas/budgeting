import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT a.*, c.code as currency_code, c.name as currency_name,
       COALESCE(a.start_balance + SUM(t.amount), a.start_balance) as current_balance
     FROM accounts a
     JOIN currencies c ON a.currency_id = c.id
     LEFT JOIN transactions t ON t.account_id = a.id
     WHERE a.user_id = $1
     GROUP BY a.id, c.code, c.name
     ORDER BY a.created_at`,
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
    'INSERT INTO accounts (user_id, name, currency_id, start_balance) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.userId, name, currency_id, start_balance ?? 0]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    `SELECT a.*, c.code as currency_code, c.name as currency_name,
       COALESCE(a.start_balance + SUM(t.amount), a.start_balance) as current_balance
     FROM accounts a
     JOIN currencies c ON a.currency_id = c.id
     LEFT JOIN transactions t ON t.account_id = a.id
     WHERE a.id = $1 AND a.user_id = $2
     GROUP BY a.id, c.code, c.name`,
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json(result.rows[0]);
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
