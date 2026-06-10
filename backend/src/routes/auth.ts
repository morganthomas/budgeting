import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password || username.length < 3 || password.length < 6) {
    res.status(400).json({ error: 'Username must be 3+ chars, password 6+ chars' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
    [username, password_hash]
  );

  const user = result.rows[0];

  await pool.query(
    'INSERT INTO currencies (user_id, code, name) VALUES ($1, $2, $3)',
    [user.id, 'USD', 'US Dollar']
  );

  const token = uuidv4();
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expires_at]
  );

  res.cookie('session_token', token, { httpOnly: true, expires: expires_at, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ user: { id: user.id, username: user.username }, token });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = uuidv4();
  const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expires_at]
  );

  res.cookie('session_token', token, { httpOnly: true, expires: expires_at, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  res.json({ user: { id: user.id, username: user.username }, token });
});

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const token = req.cookies?.session_token || req.headers.authorization?.replace('Bearer ', '');
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  res.clearCookie('session_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query('SELECT id, username FROM users WHERE id = $1', [req.userId]);
  res.json({ user: result.rows[0] });
});

export default router;
