import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    'SELECT category_id, monthly_amount FROM category_budgets WHERE user_id = $1',
    [req.userId]
  );
  res.json(rows);
});

router.put('/:categoryId', async (req: AuthRequest, res: Response): Promise<void> => {
  const { monthly_amount } = req.body;
  const amt = parseFloat(monthly_amount);
  if (isNaN(amt) || amt <= 0) {
    res.status(400).json({ error: 'monthly_amount must be a positive number' });
    return;
  }
  const catCheck = await pool.query(
    'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
    [req.params.categoryId, req.userId]
  );
  if (catCheck.rows.length === 0) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO category_budgets (user_id, category_id, monthly_amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, category_id) DO UPDATE SET monthly_amount = EXCLUDED.monthly_amount
     RETURNING category_id, monthly_amount`,
    [req.userId, req.params.categoryId, amt]
  );
  res.json(rows[0]);
});

router.delete('/:categoryId', async (req: AuthRequest, res: Response): Promise<void> => {
  await pool.query(
    'DELETE FROM category_budgets WHERE user_id = $1 AND category_id = $2',
    [req.userId, req.params.categoryId]
  );
  res.json({ ok: true });
});

export default router;
