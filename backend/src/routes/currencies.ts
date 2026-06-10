import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const currencies = await pool.query(
    'SELECT * FROM currencies WHERE user_id = $1 ORDER BY code',
    [req.userId]
  );
  const rates = await pool.query(
    `SELECT er.*, fc.code as from_code, tc.code as to_code
     FROM exchange_rates er
     JOIN currencies fc ON er.from_currency_id = fc.id
     JOIN currencies tc ON er.to_currency_id = tc.id
     WHERE er.user_id = $1`,
    [req.userId]
  );
  res.json({ currencies: currencies.rows, exchange_rates: rates.rows });
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { code, name } = req.body;
  if (!code || !name) {
    res.status(400).json({ error: 'code and name are required' });
    return;
  }
  const result = await pool.query(
    'INSERT INTO currencies (user_id, code, name) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, code.toUpperCase(), name]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { code, name } = req.body;
  const result = await pool.query(
    'UPDATE currencies SET code = COALESCE($1, code), name = COALESCE($2, name) WHERE id = $3 AND user_id = $4 RETURNING *',
    [code?.toUpperCase(), name, req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Currency not found' });
    return;
  }
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    'DELETE FROM currencies WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Currency not found' });
    return;
  }
  res.json({ ok: true });
});

router.put('/rates/:fromId/:toId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { rate } = req.body;
  if (rate == null || isNaN(Number(rate)) || Number(rate) <= 0) {
    res.status(400).json({ error: 'Valid positive rate is required' });
    return;
  }

  const fromCheck = await pool.query(
    'SELECT id FROM currencies WHERE id = $1 AND user_id = $2',
    [req.params.fromId, req.userId]
  );
  const toCheck = await pool.query(
    'SELECT id FROM currencies WHERE id = $1 AND user_id = $2',
    [req.params.toId, req.userId]
  );

  if (fromCheck.rows.length === 0 || toCheck.rows.length === 0) {
    res.status(404).json({ error: 'Currency not found' });
    return;
  }

  const result = await pool.query(
    `INSERT INTO exchange_rates (user_id, from_currency_id, to_currency_id, rate, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (from_currency_id, to_currency_id)
     DO UPDATE SET rate = $4, updated_at = NOW()
     RETURNING *`,
    [req.userId, req.params.fromId, req.params.toId, rate]
  );
  res.json(result.rows[0]);
});

router.delete('/rates/:fromId/:toId', async (req: AuthRequest, res: Response): Promise<void> => {
  await pool.query(
    'DELETE FROM exchange_rates WHERE from_currency_id = $1 AND to_currency_id = $2 AND user_id = $3',
    [req.params.fromId, req.params.toId, req.userId]
  );
  res.json({ ok: true });
});

export default router;
