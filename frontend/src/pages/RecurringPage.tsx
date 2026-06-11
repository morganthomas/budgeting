import { useState, useEffect, FormEvent } from 'react';
import { api, RecurringPayment, Account, Category } from '../api';

const FREQUENCIES = [
  { value: 'daily',    label: 'Daily' },
  { value: 'weekly',   label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly',  label: 'Monthly' },
  { value: 'yearly',   label: 'Yearly' },
];

function fmtDate(d: string) {
  return new Date(d.split('T')[0] + 'T12:00:00').toLocaleDateString();
}

function fmtAmount(amount: string) {
  const n = parseFloat(amount);
  return (n >= 0 ? '+' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function isActive(rp: RecurringPayment) {
  if (!rp.end_date) return true;
  return rp.end_date.split('T')[0] >= new Date().toISOString().split('T')[0];
}

interface FormState {
  account_id: string;
  counterparty: string;
  amount: string;
  category_id: string;
  frequency: string;
  start_date: string;
  end_date: string;
}

const emptyForm = (): FormState => ({
  account_id: '',
  counterparty: '',
  amount: '',
  category_id: '',
  frequency: 'monthly',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
});

export default function RecurringPage() {
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [recs, accs, cats] = await Promise.all([
      api.recurring.list(),
      api.accounts.list(),
      api.categories.list(),
    ]);
    setRecurring(recs);
    setAccounts(accs);
    setCategories(cats);
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm(), account_id: accounts[0]?.id ?? '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (rp: RecurringPayment) => {
    setEditId(rp.id);
    setForm({
      account_id: rp.account_id,
      counterparty: rp.counterparty,
      amount: rp.amount,
      category_id: rp.category_id ?? '',
      frequency: rp.frequency,
      start_date: rp.start_date.split('T')[0],
      end_date: rp.end_date ? rp.end_date.split('T')[0] : '',
    });
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormError('');
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    const amt = parseFloat(form.amount);
    if (isNaN(amt)) { setFormError('Amount must be a number'); return; }
    setSaving(true);
    const payload = {
      account_id: form.account_id,
      counterparty: form.counterparty,
      amount: amt,
      category_id: form.category_id || null,
      frequency: form.frequency,
      start_date: form.start_date,
      end_date: form.end_date || null,
    };
    try {
      if (editId) {
        const updated = await api.recurring.update(editId, payload);
        setRecurring(prev => prev.map(r => r.id === editId ? updated : r));
      } else {
        const created = await api.recurring.create(payload);
        setRecurring(prev => [...prev, created]);
      }
      closeForm();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async (rp: RecurringPayment) => {
    await api.recurring.end(rp.id);
    const today = new Date().toISOString().split('T')[0];
    setRecurring(prev => prev.map(r => r.id === rp.id ? { ...r, end_date: today } : r));
  };

  const handleDelete = async (rp: RecurringPayment) => {
    if (!confirm(`Delete all occurrences of "${rp.counterparty}"? This cannot be undone.`)) return;
    await api.recurring.delete(rp.id);
    setRecurring(prev => prev.filter(r => r.id !== rp.id));
    if (editId === rp.id) closeForm();
  };

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Recurring Payments</h1>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          + New
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-4">{editId ? 'Edit Recurring Payment' : 'New Recurring Payment'}</h2>
          {formError && <p className="text-red-600 text-sm mb-3">{formError}</p>}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                <select value={form.account_id} onChange={set('account_id')} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— Select account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency_code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input value={form.counterparty} onChange={set('counterparty')} required
                  placeholder="e.g. Netflix"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount <span className="text-gray-400 font-normal">(negative for expenses)</span></label>
                <input type="text" value={form.amount} onChange={set('amount')} required
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category_id} onChange={set('category_id')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">— None —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                <select value={form.frequency} onChange={set('frequency')} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={form.start_date} onChange={set('start_date')} required
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" value={form.end_date} onChange={set('end_date')}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={closeForm}
                className="text-gray-500 px-4 py-2 rounded-md text-sm hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {recurring.length === 0 ? (
        <p className="text-gray-500 text-sm">No recurring payments yet.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[48rem]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Frequency</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recurring.map(rp => {
                const active = isActive(rp);
                return (
                  <tr key={rp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {rp.counterparty}
                      {active
                        ? <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Active</span>
                        : <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">Ended</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {rp.account_name}
                      <span className="ml-1 text-xs text-gray-400 font-mono">{rp.currency_code}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-medium whitespace-nowrap ${parseFloat(rp.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtAmount(rp.amount)}
                    </td>
                    <td className="px-4 py-3">
                      {rp.category_name
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700">{rp.category_name}</span>
                        : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 capitalize">
                      {FREQUENCIES.find(f => f.value === rp.frequency)?.label ?? rp.frequency}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {fmtDate(rp.start_date)} — {rp.end_date ? fmtDate(rp.end_date) : '∞'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(rp)} className="text-indigo-500 hover:text-indigo-700 mr-3">Edit</button>
                      {active && (
                        <button onClick={() => handleEnd(rp)} className="text-amber-500 hover:text-amber-700 mr-3">End Now</button>
                      )}
                      <button onClick={() => handleDelete(rp)} className="text-red-500 hover:text-red-700">Delete</button>
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
