import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { sendPasswordResetEmail } from '../email';

const router = Router();

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { username, password, email } = req.body;

  if (!username || !password || username.length < 3 || password.length < 6) {
    res.status(400).json({ error: 'Username must be 3+ chars, password 6+ chars' });
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  if (email) {
    const emailTaken = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailTaken.rows.length > 0) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
  }

  const password_hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username, email',
    [username, password_hash, email || null]
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
  res.json({ user: { id: user.id, username: user.username, email: user.email }, token });
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
  res.json({ user: { id: user.id, username: user.username, email: user.email }, token });
});

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const token = req.cookies?.session_token || req.headers.authorization?.replace('Bearer ', '');
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  res.clearCookie('session_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await pool.query('SELECT id, username, email FROM users WHERE id = $1', [req.userId]);
  res.json({ user: result.rows[0] });
});

router.put('/profile', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email } = req.body;

  if (email !== null && email !== undefined && email !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }
    const emailTaken = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.userId]);
    if (emailTaken.rows.length > 0) {
      res.status(409).json({ error: 'Email already in use' });
      return;
    }
  }

  const newEmail = (email === '' || email === null) ? null : email;
  const result = await pool.query(
    'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, username, email',
    [newEmail, req.userId]
  );
  res.json({ user: result.rows[0] });
});

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  // Always respond OK to avoid user enumeration
  res.json({ ok: true });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) return;

  const userId = result.rows[0].id;

  // Invalidate any existing tokens for this user
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

  const token = uuidv4();
  const expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expires_at]
  );

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

  sendPasswordResetEmail(email, resetUrl).catch((err) => {
    console.error('Failed to send password reset email:', err);
  });
});

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body;

  if (!token || !password || password.length < 6) {
    res.status(400).json({ error: 'Password must be 6+ chars' });
    return;
  }

  const result = await pool.query(
    'SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  if (result.rows.length === 0) {
    res.status(400).json({ error: 'Invalid or expired reset link' });
    return;
  }

  const userId = result.rows[0].user_id;
  const password_hash = await bcrypt.hash(password, 10);

  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, userId]);
  await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  // Invalidate all existing sessions so old sessions can't be reused
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);

  res.json({ ok: true });
});

router.put('/password', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be 6+ chars' });
    return;
  }

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, req.userId]);
  res.json({ ok: true });
});

export default router;
