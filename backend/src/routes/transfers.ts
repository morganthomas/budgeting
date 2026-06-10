import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { from_account_id, to_account_id, from_amount, to_amount, timestamp } = req.body;

  if (!from_account_id || !to_account_id || from_amount == null || !timestamp) {
    res.status(400).json({ error: 'from_account_id, to_account_id, from_amount, and timestamp are required' });
    return;
  }
  if (from_account_id === to_account_id) {
    res.status(400).json({ error: 'Cannot transfer to the same account' });
    return;
  }

  const fromAmt = parseFloat(from_amount);
  const toAmt = to_amount != null ? parseFloat(to_amount) : fromAmt;

  if (isNaN(fromAmt) || fromAmt <= 0 || isNaN(toAmt) || toAmt <= 0) {
    res.status(400).json({ error: 'Amounts must be positive numbers' });
    return;
  }

  const accountCheck = await pool.query(
    'SELECT id, name FROM accounts WHERE id = ANY($1::uuid[]) AND user_id = $2',
    [[from_account_id, to_account_id], req.userId]
  );
  if (accountCheck.rows.length !== 2) {
    res.status(404).json({ error: 'One or both accounts not found' });
    return;
  }

  const fromAccount = accountCheck.rows.find((a: { id: string; name: string }) => a.id === from_account_id);
  const toAccount = accountCheck.rows.find((a: { id: string; name: string }) => a.id === to_account_id);

  const transferId = uuidv4();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO transactions (account_id, timestamp, counterparty, amount, transfer_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [from_account_id, timestamp, `Transfer to ${toAccount.name}`, -fromAmt, transferId]
    );
    await client.query(
      `INSERT INTO transactions (account_id, timestamp, counterparty, amount, transfer_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [to_account_id, timestamp, `Transfer from ${fromAccount.name}`, toAmt, transferId]
    );
    await client.query('COMMIT');
    res.status(201).json({ transfer_id: transferId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
