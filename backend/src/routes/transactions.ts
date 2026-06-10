import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const TX_SELECT = `
  SELECT t.*, cat.name AS category_name
  FROM transactions t
  LEFT JOIN categories cat ON t.category_id = cat.id
`;

router.get('/account/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const accountCheck = await pool.query(
    'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
    [req.params.accountId, req.userId]
  );
  if (accountCheck.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const result = await pool.query(
    `${TX_SELECT} WHERE t.account_id = $1 ORDER BY t.timestamp DESC`,
    [req.params.accountId]
  );
  res.json(result.rows);
});

router.post('/account/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { timestamp, counterparty, amount, category_id } = req.body;

  if (!timestamp || !counterparty || amount == null) {
    res.status(400).json({ error: 'timestamp, counterparty, and amount are required' });
    return;
  }

  const accountCheck = await pool.query(
    'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
    [req.params.accountId, req.userId]
  );
  if (accountCheck.rows.length === 0) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  if (category_id) {
    const catCheck = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [category_id, req.userId]
    );
    if (catCheck.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
  }

  const inserted = await pool.query(
    'INSERT INTO transactions (account_id, timestamp, counterparty, amount, category_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.params.accountId, timestamp, counterparty, amount, category_id ?? null]
  );
  const result = await pool.query(
    `${TX_SELECT} WHERE t.id = $1`,
    [inserted.rows[0].id]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { timestamp, counterparty, amount } = req.body;
  const hasCategoryId = 'category_id' in req.body;
  const category_id: string | null = req.body.category_id ?? null;

  const txCheck = await pool.query(
    `SELECT t.id FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE t.id = $1 AND a.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (txCheck.rows.length === 0) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  if (category_id) {
    const catCheck = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [category_id, req.userId]
    );
    if (catCheck.rows.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
  }

  await pool.query(
    `UPDATE transactions
     SET timestamp    = COALESCE($1, timestamp),
         counterparty = COALESCE($2, counterparty),
         amount       = COALESCE($3, amount),
         category_id  = CASE WHEN $4 THEN $5 ELSE category_id END
     WHERE id = $6`,
    [timestamp ?? null, counterparty ?? null, amount ?? null, hasCategoryId, category_id, req.params.id]
  );
  const result = await pool.query(`${TX_SELECT} WHERE t.id = $1`, [req.params.id]);
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const txCheck = await pool.query(
    `SELECT t.id FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE t.id = $1 AND a.user_id = $2`,
    [req.params.id, req.userId]
  );
  if (txCheck.rows.length === 0) {
    res.status(404).json({ error: 'Transaction not found' });
    return;
  }

  await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
