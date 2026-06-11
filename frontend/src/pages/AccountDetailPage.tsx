import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, Account, Transaction, Category, RecurringOccurrence } from '../api';

function fmt(amount: string) {
  const n = parseFloat(amount);
  return (n >= 0 ? '+' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtDatetime(ts: string) {
  return new Date(ts).toLocaleString();
}

function fmtDate(d: string) {
  return new Date(d.split('T')[0] + 'T12:00:00').toLocaleDateString();
}

type Row =
  | { kind: 'tx';  tx:  Transaction }
  | { kind: 'occ'; occ: RecurringOccurrence };

function rowDate(r: Row): number {
  return r.kind === 'tx'
    ? new Date(r.tx.timestamp).getTime()
    : new Date(r.occ.due_date.split('T')[0] + 'T12:00:00').getTime();
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [occurrences, setOccurrences] = useState<RecurringOccurrence[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Transaction form
  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString().slice(0, 16));
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [error, setError] = useState('');

  // Transfer form
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferToId, setTransferToId] = useState('');
  const [transferFromAmt, setTransferFromAmt] = useState('');
  const [transferToAmt, setTransferToAmt] = useState('');
  const [transferTimestamp, setTransferTimestamp] = useState(() => new Date().toISOString().slice(0, 16));
  const [transferError, setTransferError] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.accounts.get(id),
      api.transactions.list(id),
      api.categories.list(),
      api.accounts.list(),
      api.recurring.occurrences(id),
    ])
      .then(([acc, txs, cats, accs, occs]) => {
        setAccount(acc);
        setTransactions(txs);
        setCategories(cats);
        setAllAccounts(accs);
        setOccurrences(occs);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const otherAccounts = allAccounts.filter((a) => a.id !== id);
  const toAccount = allAccounts.find((a) => a.id === transferToId);
  const currenciesDiffer = !!(toAccount && account && toAccount.currency_id !== account.currency_id);

  const rows: Row[] = [
    ...transactions.map(tx => ({ kind: 'tx' as const, tx })),
    ...occurrences.map(occ => ({ kind: 'occ' as const, occ })),
  ].sort((a, b) => rowDate(b) - rowDate(a));

  const resetForm = () => {
    setTimestamp(new Date().toISOString().slice(0, 16));
    setCounterparty('');
    setAmount('');
    setCategoryId('');
    setEditTx(null);
    setShowForm(false);
    setError('');
  };

  const resetTransferForm = () => {
    setTransferTimestamp(new Date().toISOString().slice(0, 16));
    setTransferToId(otherAccounts[0]?.id ?? '');
    setTransferFromAmt('');
    setTransferToAmt('');
    setTransferError('');
    setTransferLoading(false);
  };

  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setTimestamp(new Date(tx.timestamp).toISOString().slice(0, 16));
    setCounterparty(tx.counterparty);
    setAmount(tx.amount);
    setCategoryId(tx.category_id ?? '');
    setShowForm(true);
    setShowTransferForm(false);
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

  const handleDelete = async (tx: Transaction) => {
    const msg = tx.transfer_id
      ? 'Delete this transfer? Both legs will be removed.'
      : 'Delete this transaction?';
    if (!confirm(msg)) return;
    await api.transactions.delete(tx.id);
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    if (id) {
      const acc = await api.accounts.get(id);
      setAccount(acc);
    }
  };

  const handleVerify = async (occ: RecurringOccurrence) => {
    const newVerified = !occ.verified;
    setOccurrences(prev => prev.map(o => o.id === occ.id ? { ...o, verified: newVerified } : o));
    try {
      await api.recurring.verify(occ.id);
    } catch {
      setOccurrences(prev => prev.map(o => o.id === occ.id ? { ...o, verified: occ.verified } : o));
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');
    const fromAmt = parseFloat(transferFromAmt);
    const toAmt = currenciesDiffer ? parseFloat(transferToAmt) : fromAmt;
    if (isNaN(fromAmt) || fromAmt <= 0 || isNaN(toAmt) || toAmt <= 0) {
      setTransferError('Amounts must be positive numbers');
      return;
    }
    setTransferLoading(true);
    try {
      await api.transfers.create({
        from_account_id: id!,
        to_account_id: transferToId,
        from_amount: fromAmt,
        to_amount: toAmt,
        timestamp: new Date(transferTimestamp).toISOString(),
      });
      const [txs, acc] = await Promise.all([api.transactions.list(id!), api.accounts.get(id!)]);
      setTransactions(txs);
      setAccount(acc);
      resetTransferForm();
      setShowTransferForm(false);
    } catch (err: unknown) {
      setTransferError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setTransferLoading(false);
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
        <div className="flex gap-2">
          {otherAccounts.length > 0 && (
            <button
              onClick={() => { resetTransferForm(); setShowForm(false); setShowTransferForm(true); }}
              className="border border-indigo-500 text-indigo-600 px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-50"
            >
              Transfer
            </button>
          )}
          <button
            onClick={() => { resetForm(); setShowTransferForm(false); setShowForm(true); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {showTransferForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          <h3 className="font-medium text-gray-900 mb-4">New Transfer</h3>
          {transferError && <p className="text-red-600 text-sm mb-3">{transferError}</p>}
          <form onSubmit={handleTransfer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                <input type="datetime-local" value={transferTimestamp} onChange={(e) => setTransferTimestamp(e.target.value)} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To Account</label>
                <select value={transferToId} onChange={(e) => setTransferToId(e.target.value)} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Select account —</option>
                  {otherAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount sent ({account.currency_code})</label>
                <input type="text" inputMode="decimal" value={transferFromAmt} onChange={(e) => setTransferFromAmt(e.target.value)} placeholder="0.00" required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {currenciesDiffer && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount received ({toAccount?.currency_code})</label>
                  <input type="text" inputMode="decimal" value={transferToAmt} onChange={(e) => setTransferToAmt(e.target.value)} placeholder="0.00" required
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={transferLoading}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {transferLoading ? 'Transferring...' : 'Transfer'}
              </button>
              <button type="button" onClick={() => { resetTransferForm(); setShowTransferForm(false); }}
                className="text-gray-500 px-4 py-2 rounded-md text-sm hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          <h3 className="font-medium text-gray-900 mb-4">{editTx ? 'Edit Transaction' : 'New Transaction'}</h3>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty</label>
                <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="e.g. Grocery Store" required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount <span className="text-gray-400 font-normal">(negative for expenses)</span>
                </label>
                <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— None —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No transactions yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
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
              {rows.map(row => {
                if (row.kind === 'occ') {
                  const occ = row.occ;
                  return (
                    <tr key={`occ-${occ.id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(occ.due_date)}</td>
                      <td className="px-4 py-3 text-gray-900">{occ.counterparty}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 mr-1">Recurring</span>
                        {occ.category_name && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{occ.category_name}</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${parseFloat(occ.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(occ.amount)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={occ.verified}
                            onChange={() => handleVerify(occ)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 cursor-pointer"
                          />
                          Verified
                        </label>
                      </td>
                    </tr>
                  );
                }

                const tx = row.tx;
                return (
                  <tr key={`tx-${tx.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDatetime(tx.timestamp)}</td>
                    <td className="px-4 py-3 text-gray-900">{tx.counterparty}</td>
                    <td className="px-4 py-3">
                      {tx.transfer_id ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">Transfer</span>
                      ) : tx.category_name ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{tx.category_name}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${parseFloat(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmt(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {!tx.transfer_id && (
                        <button onClick={() => openEdit(tx)} className="text-indigo-500 hover:text-indigo-700 mr-3">Edit</button>
                      )}
                      <button onClick={() => handleDelete(tx)} className="text-red-500 hover:text-red-700">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
