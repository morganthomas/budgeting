import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDb } from './db';
import authRouter from './routes/auth';
import accountsRouter from './routes/accounts';
import currenciesRouter from './routes/currencies';
import transactionsRouter from './routes/transactions';
import categoriesRouter from './routes/categories';
import reportsRouter from './routes/reports';
import dataRouter from './routes/data';
import transfersRouter from './routes/transfers';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Caddy / any single reverse-proxy layer in production
app.set('trust proxy', 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/currencies', currenciesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/data', dataRouter);
app.use('/api/transfers', transfersRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
