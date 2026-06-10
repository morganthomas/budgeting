import { useState, useEffect } from 'react';
import { api, CategoryReport } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtAmount(n: number) {
  return (n >= 0 ? '+' : '') + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function CategoryRow({ cat }: { cat: CategoryReport }) {
  const [expanded, setExpanded] = useState(false);
  const netSign = (cat.total_usd ?? 0) >= 0;

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer select-none"
        onClick={() => setExpanded((x) => !x)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-xs w-3">{expanded ? '▾' : '▸'}</span>
            <span className={`font-medium ${cat.category_id ? 'text-gray-900' : 'text-gray-400 italic'}`}>
              {cat.category_name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-gray-500 text-sm">{cat.transaction_count}</td>
        <td className="px-4 py-3 text-right">
          <div className="space-y-0.5">
            {cat.totals_by_currency.map(({ currency_code, total }) => (
              <div key={currency_code} className={`text-sm font-mono ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmtAmount(total)} {currency_code}
              </div>
            ))}
          </div>
        </td>
        <td className={`px-4 py-3 text-right font-mono font-semibold ${netSign ? 'text-green-600' : 'text-red-600'}`}>
          {cat.total_usd !== null
            ? `${fmtAmount(cat.total_usd)} USD`
            : <span className="text-amber-500 font-normal text-xs">no rate</span>}
        </td>
      </tr>
      {expanded && cat.transactions.map((tx) => (
        <tr key={tx.id} className="bg-gray-50 border-t border-gray-100">
          <td className="px-4 py-2 pl-10 text-sm text-gray-600">
            <span className="text-gray-400 mr-3">{fmtDate(tx.timestamp)}</span>
            {tx.counterparty}
          </td>
          <td />
          <td className="px-4 py-2 text-right font-mono text-sm">
            <span className={parseFloat(tx.amount) >= 0 ? 'text-green-600' : 'text-red-600'}>
              {fmtAmount(parseFloat(tx.amount))}
            </span>
            <span className="text-gray-400 ml-1 text-xs">{(tx as { currency_code?: string }).currency_code ?? ''}</span>
          </td>
          <td />
        </tr>
      ))}
    </>
  );
}

export default function MonthlyReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [categories, setCategories] = useState<CategoryReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.reports.monthly(year, month)
      .then((r) => setCategories(r.categories))
      .finally(() => setLoading(false));
  }, [year, month]);

  const prev = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  const allConvertible = categories.every((c) => c.total_usd !== null);
  const totalUsd = allConvertible
    ? categories.reduce((sum, c) => sum + (c.total_usd ?? 0), 0)
    : null;
  const totalTxCount = categories.reduce((sum, c) => sum + c.transaction_count, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Monthly Report</h1>
        <div className="flex items-center gap-3">
          <button onClick={prev} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">‹</button>
          <span className="text-base font-semibold text-gray-800 w-40 text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={next} className="p-1.5 rounded hover:bg-gray-100 text-gray-600">›</button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : categories.length === 0 ? (
        <p className="text-gray-500 text-sm">No transactions in {MONTH_NAMES[month - 1]} {year}.</p>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Categories active</p>
              <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{totalTxCount}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Net (USD)</p>
              {totalUsd !== null ? (
                <p className={`text-2xl font-bold ${totalUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtAmount(totalUsd)}
                </p>
              ) : (
                <p className="text-base text-amber-500">— missing rates</p>
              )}
            </div>
          </div>

          {/* Breakdown table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Txns</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Native</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((cat) => (
                  <CategoryRow key={cat.category_id ?? '__uncategorized__'} cat={cat} />
                ))}
              </tbody>
              {allConvertible && totalUsd !== null && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                    <td className="px-4 py-3 text-center text-gray-500">{totalTxCount}</td>
                    <td />
                    <td className={`px-4 py-3 text-right font-mono font-bold ${totalUsd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {fmtAmount(totalUsd)} USD
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
