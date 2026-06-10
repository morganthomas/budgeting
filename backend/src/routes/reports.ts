import { Router, Response } from 'express';
import { pool } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/monthly', async (req: AuthRequest, res: Response): Promise<void> => {
  const now = new Date();
  const year = parseInt(req.query.year as string) || now.getFullYear();
  const month = parseInt(req.query.month as string) || now.getMonth() + 1;

  const txResult = await pool.query(
    `SELECT
       t.id, t.timestamp, t.counterparty, t.amount, t.category_id,
       cat.name AS category_name,
       a.id AS account_id, a.name AS account_name,
       cur.id AS currency_id, cur.code AS currency_code
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     JOIN currencies cur ON a.currency_id = cur.id
     LEFT JOIN categories cat ON t.category_id = cat.id
     WHERE a.user_id = $1
       AND EXTRACT(YEAR FROM t.timestamp) = $2
       AND EXTRACT(MONTH FROM t.timestamp) = $3
     ORDER BY t.timestamp DESC`,
    [req.userId, year, month]
  );

  const rateResult = await pool.query(
    `SELECT er.from_currency_id, cur.code AS from_code, er.rate
     FROM exchange_rates er
     JOIN currencies usd ON er.to_currency_id = usd.id AND usd.code = 'USD' AND usd.user_id = $1
     JOIN currencies cur ON er.from_currency_id = cur.id
     WHERE er.user_id = $1`,
    [req.userId]
  );

  const ratesByCode: Record<string, number> = { USD: 1 };
  for (const r of rateResult.rows) {
    ratesByCode[r.from_code] = parseFloat(r.rate);
  }

  type CategoryEntry = {
    category_id: string | null;
    category_name: string;
    transactions: typeof txResult.rows;
    totals_by_currency: Record<string, number>;
    total_usd: number;
    all_convertible: boolean;
  };

  const categoryMap = new Map<string, CategoryEntry>();

  for (const tx of txResult.rows) {
    const key = tx.category_id ?? '__uncategorized__';
    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        category_id: tx.category_id,
        category_name: tx.category_name ?? 'Uncategorized',
        transactions: [],
        totals_by_currency: {},
        total_usd: 0,
        all_convertible: true,
      });
    }
    const entry = categoryMap.get(key)!;
    entry.transactions.push(tx);

    const amount = parseFloat(tx.amount);
    entry.totals_by_currency[tx.currency_code] =
      (entry.totals_by_currency[tx.currency_code] ?? 0) + amount;

    if (entry.all_convertible) {
      const rate = ratesByCode[tx.currency_code];
      if (rate != null) {
        entry.total_usd += amount * rate;
      } else {
        entry.all_convertible = false;
      }
    }
  }

  const categories = Array.from(categoryMap.values())
    .map((e) => ({
      category_id: e.category_id,
      category_name: e.category_name,
      transaction_count: e.transactions.length,
      totals_by_currency: Object.entries(e.totals_by_currency).map(([currency_code, total]) => ({
        currency_code,
        total,
      })),
      total_usd: e.all_convertible ? e.total_usd : null,
      transactions: e.transactions,
    }))
    .sort((a, b) => {
      if (a.category_id === null) return 1;
      if (b.category_id === null) return -1;
      return a.category_name.localeCompare(b.category_name);
    });

  res.json({ year, month, categories });
});

export default router;
