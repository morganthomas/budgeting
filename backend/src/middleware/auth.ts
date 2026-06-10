import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.session_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const result = await pool.query(
    `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );

  if (result.rows.length === 0) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.userId = result.rows[0].user_id;
  next();
}
