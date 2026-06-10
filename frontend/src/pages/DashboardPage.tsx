import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Account, Currency, ExchangeRate } from '../api';

function getUsdEquivalent(account: Account, rates: ExchangeRate[]): number | null {
  const balance = parseFloat(account.current_balance ?? account.start_balance);
  if (account.currency_code === 'USD') return balance;
  const rate = rates.find((r) => r.from_currency_id === account.currency_id && r.to_code === 'USD');
  if (!rate) return null;
  return balance * parseFloat(rate.rate);
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [startBalance, setStartBalance] = useState('0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const [accs, { currencies: currs, exchange_rates: rs }] = await Promise.all([
      api.accounts.list(),
      api.currencies.list(),
    ]);
    setAccounts(accs);
    setCurrencies(currs);
    setRates(rs);
    if (currs.length > 0 && !currencyId) setCurrencyId(currs[0].id);
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.accounts.create({ name, currency_id: currencyId, start_balance: parseFloat(startBalance) });
      const accs = await api.accounts.list();
      setAccounts(accs);
      setName('');
      setStartBalance('0');
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this account and all its transactions?')) return;
    await api.accounts.delete(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  const usdEquivalents = accounts.map((a) => getUsdEquivalent(a, rates));
  const allConvertible = usdEquivalents.every((v) => v !== null);
  const netUsd = allConvertible ? usdEquivalents.reduce((sum, v) => sum! + v!, 0) : null;

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          {accounts.length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              Net USD balance:{' '}
              {netUsd !== null ? (
                <span className={`font-semibold ${netUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {netUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              ) : (
                <span className="text-amber-600">
                  — set USD rates for all currencies on the{' '}
                  <Link to="/currencies" className="underline">Currencies</Link> page
                </span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          + New Account
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Account</h2>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {currencies.length === 0 ? (
            <p className="text-sm text-amber-600">
              You need to <Link to="/currencies" className="underline">create a currency</Link> first.
            </p>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={currencyId}
                    onChange={(e) => setCurrencyId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {currencies.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starting Balance</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={startBalance}
                    onChange={(e) => setStartBalance(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                  Create
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 px-4 py-2 rounded-md text-sm hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-gray-500 text-sm">No accounts yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account, i) => {
            const balance = parseFloat(account.current_balance ?? account.start_balance);
            const usd = usdEquivalents[i];
            return (
              <div key={account.id} className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <Link to={`/accounts/${account.id}`} className="font-semibold text-gray-900 hover:text-indigo-600">
                    {account.name}
                  </Link>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                    {account.currency_code}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </p>
                {account.currency_code !== 'USD' && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {usd !== null
                      ? `≈ ${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                      : '— no USD rate set'}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Opening: {parseFloat(account.start_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <div className="mt-4 flex gap-3 text-sm">
                  <Link to={`/accounts/${account.id}`} className="text-indigo-600 hover:underline">
                    Transactions
                  </Link>
                  <button onClick={() => handleDelete(account.id)} className="text-red-500 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
