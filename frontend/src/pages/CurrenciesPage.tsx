import { useState, useEffect } from 'react';
import { api, Currency, ExchangeRate } from '../api';

interface CurrencyWithRate extends Currency {
  usdRate: string | null;
}

export default function CurrenciesPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCurrencyForm, setShowCurrencyForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editRateForId, setEditRateForId] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState('');
  const [error, setError] = useState('');

  const reload = async () => {
    const { currencies: c, exchange_rates: r } = await api.currencies.list();
    setCurrencies(c);
    setRates(r);
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const usdCurrency = currencies.find((c) => c.code === 'USD');

  const enriched: CurrencyWithRate[] = currencies.map((c) => {
    if (c.code === 'USD') return { ...c, usdRate: '1.000000' };
    const rate = rates.find((r) => r.from_currency_id === c.id && r.to_code === 'USD');
    return { ...c, usdRate: rate ? parseFloat(rate.rate).toFixed(6) : null };
  });

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
    if (!confirm('Delete this currency? Accounts using it may be affected.')) return;
    try {
      await api.currencies.delete(id);
      await reload();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const openRateEdit = (currency: CurrencyWithRate) => {
    setEditRateForId(currency.id);
    setRateInput(currency.usdRate ?? '');
    setError('');
  };

  const handleSaveRate = async (currencyId: string) => {
    if (!usdCurrency) return;
    setError('');
    const r = parseFloat(rateInput);
    if (isNaN(r) || r <= 0) {
      setError('Rate must be a positive number');
      return;
    }
    try {
      await api.currencies.setRate(currencyId, usdCurrency.id, r);
      setEditRateForId(null);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save rate');
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Currencies</h1>
          <button
            onClick={() => { setShowCurrencyForm(!showCurrencyForm); setError(''); }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            + New Currency
          </button>
        </div>

        {showCurrencyForm && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
            <h3 className="font-medium text-gray-900 mb-4">New Currency</h3>
            {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
            <form onSubmit={handleCreateCurrency} className="flex gap-4 items-end flex-wrap">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="EUR"
                  className="w-28 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  maxLength={10}
                  required
                />
              </div>
              <div className="flex-1 min-w-40">
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Euro"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
                Create
              </button>
              <button type="button" onClick={() => { setShowCurrencyForm(false); setError(''); }} className="text-gray-500 text-sm hover:text-gray-700">
                Cancel
              </button>
            </form>
          </div>
        )}

        {enriched.length === 0 ? (
          <p className="text-gray-500 text-sm">No currencies yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[36rem]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">
                    Rate (1 unit = X USD)
                  </th>
                  <th className="px-4 py-3 w-40"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {enriched.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 text-gray-700">{c.name}</td>
                    <td className="px-4 py-3 text-right">
                      {c.code === 'USD' ? (
                        <span className="font-mono text-gray-500">1.000000 (base)</span>
                      ) : editRateForId === c.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            step="0.000001"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            className="w-32 border border-gray-300 rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRate(c.id);
                              if (e.key === 'Escape') setEditRateForId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSaveRate(c.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditRateForId(null)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : c.usdRate ? (
                        <span className="font-mono text-gray-700">{c.usdRate}</span>
                      ) : (
                        <span className="text-amber-600 text-xs">No rate set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {c.code !== 'USD' && editRateForId !== c.id && (
                          <button
                            onClick={() => openRateEdit(c)}
                            className="text-indigo-500 hover:text-indigo-700 text-sm"
                          >
                            {c.usdRate ? 'Edit rate' : 'Set rate'}
                          </button>
                        )}
                        {c.code !== 'USD' && (
                          <button
                            onClick={() => handleDeleteCurrency(c.id)}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && editRateForId && (
          <p className="text-red-600 text-sm mt-2">{error}</p>
        )}
      </div>
    </div>
  );
}
