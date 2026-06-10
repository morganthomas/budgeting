import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reset password</h1>
        {submitted ? (
          <>
            <p className="text-sm text-gray-600 mt-4">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </p>
            <p className="mt-6 text-sm text-center">
              <Link to="/login" className="text-indigo-600 hover:underline">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Enter your email and we'll send you a link to reset your password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>
            <p className="mt-4 text-sm text-gray-500 text-center">
              <Link to="/login" className="text-indigo-600 hover:underline">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
