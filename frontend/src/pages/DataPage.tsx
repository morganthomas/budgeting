import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface ImportResult {
  currencies: number;
  exchange_rates: number;
  categories: number;
  accounts: number;
  transactions: number;
}

async function downloadExport() {
  const res = await fetch('/api/data/export', { credentials: 'include' });
  if (!res.ok) throw new Error('Export failed');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budget-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportError, setExportError] = useState('');
  const [importError, setImportError] = useState('');

  const handleExport = async () => {
    setExportError('');
    setExporting(true);
    try {
      await downloadExport();
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
    setImportResult(null);
    setImportError('');
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    if (!confirm('This will permanently replace ALL your existing data with the contents of the file. Continue?')) return;

    setImportError('');
    setImportResult(null);
    setImporting(true);

    try {
      const text = await selectedFile.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('File is not valid JSON');
      }

      const res = await fetch('/api/data/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Import failed');

      setImportResult(body.imported);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Data</h1>

      {/* Export */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Export</h2>
        <p className="text-sm text-gray-500 mb-4">
          Download all your currencies, exchange rates, categories, accounts, and transactions
          as a single JSON file. Use it as a backup or to migrate to a new instance.
        </p>
        {exportError && <p className="text-red-600 text-sm mb-3">{exportError}</p>}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {exporting ? 'Preparing…' : 'Download JSON'}
        </button>
      </div>

      {/* Import */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Import</h2>
        <p className="text-sm text-gray-500 mb-3">
          Restore from a previously exported JSON file.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-4 text-sm text-amber-800">
          <strong>Warning:</strong> Importing will permanently delete all your current data and
          replace it with the contents of the file. This cannot be undone.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select file</label>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
            />
          </div>

          {selectedFile && (
            <p className="text-sm text-gray-600">
              Selected: <span className="font-medium">{selectedFile.name}</span>{' '}
              <span className="text-gray-400">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            </p>
          )}

          {importError && <p className="text-red-600 text-sm">{importError}</p>}

          {importResult && (
            <div className="bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm text-green-800">
              <p className="font-semibold mb-1">Import successful</p>
              <ul className="space-y-0.5 text-green-700">
                <li>{importResult.currencies} currencies</li>
                <li>{importResult.exchange_rates} exchange rates</li>
                <li>{importResult.categories} categories</li>
                <li>{importResult.accounts} accounts</li>
                <li>{importResult.transactions} transactions</li>
              </ul>
              <button
                onClick={() => navigate('/')}
                className="mt-3 text-indigo-600 hover:underline text-sm font-medium"
              >
                Go to Accounts →
              </button>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!selectedFile || importing}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import and replace all data'}
          </button>
        </div>
      </div>
    </div>
  );
}
