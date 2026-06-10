import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, Account, Currency } from '../api';

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [startBalance, setStartBalance] = useState('0');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.accounts.list(), api.currencies.list()])
      .then(([accs, currs]) => {
        setAccounts(accs);
        setCurrencies(currs.currencies);
        if (currs.currencies.length > 0) setCurrencyId(currs.currencies[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const acc = await api.accounts.create({ name, currency_id: currencyId, start_balance: parseFloat(startBalance) });
      setAccounts((prev) => [...prev, acc]);
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

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
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
                    type="number"
                    step="0.01"
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
          {accounts.map((account) => (
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
                {parseFloat(account.current_balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </p>
              <p className="text-xs text-gray-500 mt-1">
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
          ))}
        </div>
      )}
    </div>
  );
}
