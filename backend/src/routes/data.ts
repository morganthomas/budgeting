import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/export', async (req: AuthRequest, res: Response): Promise<void> => {
  const [currencies, exchange_rates, categories, accounts, transactions] = await Promise.all([
    pool.query(
      'SELECT id, code, name FROM currencies WHERE user_id = $1 ORDER BY code',
      [req.userId]
    ),
    pool.query(
      'SELECT from_currency_id, to_currency_id, rate FROM exchange_rates WHERE user_id = $1',
      [req.userId]
    ),
    pool.query(
      'SELECT id, name FROM categories WHERE user_id = $1 ORDER BY name',
      [req.userId]
    ),
    pool.query(
      'SELECT id, name, currency_id, start_balance FROM accounts WHERE user_id = $1 ORDER BY created_at',
      [req.userId]
    ),
    pool.query(
      `SELECT t.id, t.account_id, t.timestamp, t.counterparty, t.amount, t.category_id, t.transfer_id
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE a.user_id = $1
       ORDER BY t.timestamp`,
      [req.userId]
    ),
  ]);

  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    currencies: currencies.rows,
    exchange_rates: exchange_rates.rows,
    categories: categories.rows,
    accounts: accounts.rows,
    transactions: transactions.rows,
  });
});

router.post('/import', async (req: AuthRequest, res: Response): Promise<void> => {
  const data = req.body;

  if (!data || data.version !== 1) {
    res.status(400).json({ error: 'Invalid import file: missing or unsupported version' });
    return;
  }

  const currencies: unknown[] = Array.isArray(data.currencies) ? data.currencies : [];
  const exchange_rates: unknown[] = Array.isArray(data.exchange_rates) ? data.exchange_rates : [];
  const categories: unknown[] = Array.isArray(data.categories) ? data.categories : [];
  const accounts: unknown[] = Array.isArray(data.accounts) ? data.accounts : [];
  const transactions: unknown[] = Array.isArray(data.transactions) ? data.transactions : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Wipe existing user data in FK-safe order
    await client.query(
      'DELETE FROM transactions WHERE account_id IN (SELECT id FROM accounts WHERE user_id = $1)',
      [req.userId]
    );
    await client.query('DELETE FROM exchange_rates WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM accounts WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM categories WHERE user_id = $1', [req.userId]);
    await client.query('DELETE FROM currencies WHERE user_id = $1', [req.userId]);

    const currencyIdMap = new Map<string, string>();
    const categoryIdMap = new Map<string, string>();
    const accountIdMap = new Map<string, string>();

    for (const c of currencies as { id: string; code: string; name: string }[]) {
      const r = await client.query(
        'INSERT INTO currencies (user_id, code, name) VALUES ($1, $2, $3) RETURNING id',
        [req.userId, c.code, c.name]
      );
      currencyIdMap.set(c.id, r.rows[0].id);
    }

    for (const c of categories as { id: string; name: string }[]) {
      const r = await client.query(
        'INSERT INTO categories (user_id, name) VALUES ($1, $2) RETURNING id',
        [req.userId, c.name]
      );
      categoryIdMap.set(c.id, r.rows[0].id);
    }

    let ratesImported = 0;
    for (const er of exchange_rates as { from_currency_id: string; to_currency_id: string; rate: string }[]) {
      const fromId = currencyIdMap.get(er.from_currency_id);
      const toId = currencyIdMap.get(er.to_currency_id);
      if (!fromId || !toId) continue;
      await client.query(
        'INSERT INTO exchange_rates (user_id, from_currency_id, to_currency_id, rate) VALUES ($1, $2, $3, $4)',
        [req.userId, fromId, toId, er.rate]
      );
      ratesImported++;
    }

    for (const a of accounts as { id: string; name: string; currency_id: string; start_balance: string }[]) {
      const currencyId = currencyIdMap.get(a.currency_id);
      if (!currencyId) continue;
      const r = await client.query(
        'INSERT INTO accounts (user_id, name, currency_id, start_balance) VALUES ($1, $2, $3, $4) RETURNING id',
        [req.userId, a.name, currencyId, a.start_balance]
      );
      accountIdMap.set(a.id, r.rows[0].id);
    }

    const transferIdMap = new Map<string, string>();
    let txImported = 0;
    for (const t of transactions as { id: string; account_id: string; timestamp: string; counterparty: string; amount: string; category_id: string | null; transfer_id: string | null }[]) {
      const accountId = accountIdMap.get(t.account_id);
      if (!accountId) continue;
      const categoryId = t.category_id ? (categoryIdMap.get(t.category_id) ?? null) : null;
      let transferId: string | null = null;
      if (t.transfer_id) {
        if (!transferIdMap.has(t.transfer_id)) transferIdMap.set(t.transfer_id, uuidv4());
        transferId = transferIdMap.get(t.transfer_id)!;
      }
      await client.query(
        'INSERT INTO transactions (account_id, timestamp, counterparty, amount, category_id, transfer_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [accountId, t.timestamp, t.counterparty, t.amount, categoryId, transferId]
      );
      txImported++;
    }

    await client.query('COMMIT');
    res.json({
      ok: true,
      imported: {
        currencies: currencyIdMap.size,
        exchange_rates: ratesImported,
        categories: categoryIdMap.size,
        accounts: accountIdMap.size,
        transactions: txImported,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
