import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    'SELECT * FROM categories WHERE user_id = $1 ORDER BY name',
    [req.userId]
  );
  res.json(result.rows);
});

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const result = await pool.query(
    'INSERT INTO categories (user_id, name) VALUES ($1, $2) RETURNING *',
    [req.userId, name.trim()]
  );
  res.status(201).json(result.rows[0]);
});

router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const result = await pool.query(
    'UPDATE categories SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [name.trim(), req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  res.json(result.rows[0]);
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query(
    'DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
