import { useState, useEffect } from 'react';
import { api, Category } from '../api';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories.list()
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const cat = await api.categories.create(newName);
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setShowForm(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleSaveEdit = async (id: string) => {
    setError('');
    try {
      const updated = await api.categories.update(id, editName);
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Transactions will become uncategorized.')) return;
    await api.categories.delete(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          + New Category
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <form onSubmit={handleCreate} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Groceries"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
                required
              />
            </div>
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
              Create
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="text-gray-500 text-sm hover:text-gray-700">
              Cancel
            </button>
          </form>
        </div>
      )}

      {categories.length === 0 ? (
        <p className="text-gray-500 text-sm">No categories yet. Create one to start tagging transactions.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editId === cat.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(cat.id);
                            if (e.key === 'Escape') setEditId(null);
                          }}
                        />
                        <button onClick={() => handleSaveEdit(cat.id)} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Save</button>
                        <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
                        {error && <span className="text-red-600 text-xs">{error}</span>}
                      </div>
                    ) : (
                      <span className="text-gray-900 font-medium">{cat.name}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editId !== cat.id && (
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => { setEditId(cat.id); setEditName(cat.name); setError(''); }}
                          className="text-indigo-500 hover:text-indigo-700 text-sm"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    )}
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
