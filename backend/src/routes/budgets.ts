import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

// Return the latest budget entry per category (current state)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (category_id) category_id, monthly_amount
     FROM category_budgets
     WHERE user_id = $1
     ORDER BY category_id, created_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

// Append a new budget entry (never updates in place)
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
     RETURNING category_id, monthly_amount`,
    [req.userId, req.params.categoryId, amt]
  );
  res.json(rows[0]);
});

// Delete all budget history for a category (full clear)
router.delete('/:categoryId', async (req: AuthRequest, res: Response): Promise<void> => {
  await pool.query(
    'DELETE FROM category_budgets WHERE user_id = $1 AND category_id = $2',
    [req.userId, req.params.categoryId]
  );
  res.json({ ok: true });
});

export default router;
