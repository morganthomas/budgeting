import { useState, useEffect } from 'react';
import { api, Currency, ExchangeRate } from '../api';

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCurrencyForm, setShowCurrencyForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [rate, setRate] = useState('');
  const [error, setError] = useState('');

  const reload = () =>
    api.currencies.list().then(({ currencies: c, exchange_rates: r }) => {
      setCurrencies(c);
      setRates(r);
      if (c.length > 0) {
        setFromId(c[0].id);
        setToId(c.length > 1 ? c[1].id : c[0].id);
      }
    });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const handleCreateCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.currencies.create({ code, name });
      setCode('');
      setName('');
      setShowCurrencyForm(false);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDeleteCurrency = async (id: string) => {
    if (!confirm('Delete this currency? Accounts using it will be affected.')) return;
    try {
      await api.currencies.delete(id);
      await reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleSetRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (fromId === toId) {
      setError('From and To currencies must be different');
      return;
    }
    try {
      await api.currencies.setRate(fromId, toId, parseFloat(rate));
      setRate('');
      setShowRateForm(false);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDeleteRate = async (fromCurrencyId: string, toCurrencyId: string) => {
    await api.currencies.deleteRate(fromCurrencyId, toCurrencyId);
    await reload();
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Currencies</h1>
          <button
            onClick={() => setShowCurrencyForm(!showCurrencyForm)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            + New Currency
          </button>
        </div>

        {showCurrencyForm && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h3 className="font-medium text-gray-900 mb-4">New Currency</h3>
            {error && !showRateForm && <p className="text-red-600 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreateCurrency} className="flex gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="USD"
                  className="w-28 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={10}
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="US Dollar"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                Create
              </button>
              <button type="button" onClick={() => setShowCurrencyForm(false)} className="text-gray-500 text-sm hover:text-gray-700">
                Cancel
              </button>
            </form>
          </div>
        )}

        {currencies.length === 0 ? (
          <p className="text-gray-500 text-sm">No currencies yet. Add one to get started.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currencies.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 text-gray-700">{c.name}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDeleteCurrency(c.id)} className="text-red-500 hover:text-red-700 text-sm">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Exchange Rates</h2>
          {currencies.length >= 2 && (
            <button
              onClick={() => setShowRateForm(!showRateForm)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
            >
              + Set Rate
            </button>
          )}
        </div>

        {showRateForm && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h3 className="font-medium text-gray-900 mb-4">Set Exchange Rate</h3>
            {error && showRateForm && <p className="text-red-600 text-sm mb-3">{error}</p>}
            <form onSubmit={handleSetRate} className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate</label>
                <input
                  type="number"
                  step="0.00000001"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="1.25"
                  className="w-36 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                Save
              </button>
              <button type="button" onClick={() => setShowRateForm(false)} className="text-gray-500 text-sm hover:text-gray-700">
                Cancel
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-2">
              1 [From] = [Rate] [To]
            </p>
          </div>
        )}

        {rates.length === 0 ? (
          <p className="text-gray-500 text-sm">No exchange rates defined.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Rate</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Updated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{r.from_code}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{r.to_code}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{parseFloat(r.rate).toFixed(6)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {new Date(r.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeleteRate(r.from_currency_id, r.to_currency_id)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
