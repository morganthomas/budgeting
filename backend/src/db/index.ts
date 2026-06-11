import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS currencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(10) NOT NULL,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, code)
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
      to_currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
      rate NUMERIC(20, 8) NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(from_currency_id, to_currency_id)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      currency_id UUID NOT NULL REFERENCES currencies(id),
      start_balance NUMERIC(20, 4) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      timestamp TIMESTAMPTZ NOT NULL,
      counterparty VARCHAR(255) NOT NULL,
      amount NUMERIC(20, 4) NOT NULL,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Migration: add category_id to existing transactions tables that lack it
  await pool.query(`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL
  `);

  // Migration: add email to users
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email VARCHAR(255)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
      ON users (email)
      WHERE email IS NOT NULL
  `);

  // Migration: add password_reset_tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migration: add sort_order to accounts for user-defined ordering
  await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sort_order INTEGER`);
  await pool.query(`
    UPDATE accounts SET sort_order = sub.rn
    FROM (
      SELECT id, (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1)::INTEGER AS rn
      FROM accounts WHERE sort_order IS NULL
    ) sub
    WHERE accounts.id = sub.id
  `);

  // Migration: add transfer_id to link the two legs of a transfer
  await pool.query(`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS transfer_id UUID
  `);

  // Migration: recurring payments and their generated occurrences
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      counterparty VARCHAR(255) NOT NULL,
      amount NUMERIC(20, 4) NOT NULL,
      category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
      frequency VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS recurring_occurrences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      recurring_payment_id UUID NOT NULL REFERENCES recurring_payments(id) ON DELETE CASCADE,
      due_date DATE NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(recurring_payment_id, due_date)
    )
  `);

  // Migration: per-category monthly budget targets (append-only log)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS category_budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      monthly_amount NUMERIC(14,4) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Drop unique constraint if it exists from a prior schema version
  await pool.query(`
    ALTER TABLE category_budgets
      DROP CONSTRAINT IF EXISTS category_budgets_user_id_category_id_key
  `);
  // Add created_at if missing (existing installs)
  await pool.query(`
    ALTER TABLE category_budgets
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
  `);

  console.log('Database initialized');
}
