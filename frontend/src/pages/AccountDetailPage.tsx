import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Account, Transaction, Category } from '../api';

function fmt(amount: string) {
  const n = parseFloat(amount);
  return (n >= 0 ? '+' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString();
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString().slice(0, 16));
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([api.accounts.get(id), api.transactions.list(id), api.categories.list()])
      .then(([acc, txs, cats]) => {
        setAccount(acc);
        setTransactions(txs);
        setCategories(cats);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const resetForm = () => {
    setTimestamp(new Date().toISOString().slice(0, 16));
    setCounterparty('');
    setAmount('');
    setCategoryId('');
    setEditTx(null);
    setShowForm(false);
    setError('');
  };

  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setTimestamp(new Date(tx.timestamp).toISOString().slice(0, 16));
    setCounterparty(tx.counterparty);
    setAmount(tx.amount);
    setCategoryId(tx.category_id ?? '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const data = {
      timestamp: new Date(timestamp).toISOString(),
      counterparty,
      amount: parseFloat(amount),
      category_id: categoryId || null,
    };
    try {
      if (editTx) {
        const updated = await api.transactions.update(editTx.id, data);
        setTransactions((prev) => prev.map((t) => (t.id === editTx.id ? updated : t)));
      } else {
        const created = await api.transactions.create(id!, data);
        setTransactions((prev) => [created, ...prev]);
      }
      if (id) {
        const acc = await api.accounts.get(id);
        setAccount(acc);
      }
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDelete = async (txId: string) => {
    if (!confirm('Delete this transaction?')) return;
    await api.transactions.delete(txId);
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
    if (id) {
      const acc = await api.accounts.get(id);
      setAccount(acc);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!account) return <p className="text-red-500">Account not found.</p>;

  return (
    <div>
      <div className="mb-2">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">← Accounts</Link>
      </div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {account.currency_code} · {account.currency_name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            {parseFloat(account.current_balance ?? account.start_balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </p>
          <p className="text-xs text-gray-500">Current balance</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Transactions</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          + Add Transaction
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          <h3 className="font-medium text-gray-900 mb-4">{editTx ? 'Edit Transaction' : 'New Transaction'}</h3>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty</label>
                <input
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Grocery Store"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-gray-400 font-normal">(negative for expenses)</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    <Link to="/categories" className="underline">Create categories</Link> to tag transactions.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                {editTx ? 'Save' : 'Add'}
              </button>
              <button type="button" onClick={resetForm} className="text-gray-500 px-4 py-2 rounded-md text-sm hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {transactions.length === 0 ? (
        <p className="text-gray-500 text-sm">No transactions yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Counterparty</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(tx.timestamp)}</td>
                  <td className="px-4 py-3 text-gray-900">{tx.counterparty}</td>
                  <td className="px-4 py-3">
                    {tx.category_name
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{tx.category_name}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${parseFloat(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt(tx.amount)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(tx)} className="text-indigo-500 hover:text-indigo-700 mr-3">Edit</button>
                    <button onClick={() => handleDelete(tx.id)} className="text-red-500 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
