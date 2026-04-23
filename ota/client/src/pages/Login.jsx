import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #0D1B2A 0%, #1B5E7B 100%)' }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12">
        <div>
          <div className="text-gold font-bold text-2xl mb-1">Sun Safari</div>
          <div className="text-white/50 text-sm font-medium tracking-widest uppercase">Destinations</div>
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            OTA Management<br />Portal
          </h1>
          <p className="text-white/60 text-lg">
            Manage bookings, commissions, and properties across all channels.
          </p>
        </div>
        <div className="text-white/30 text-sm">
          © {new Date().getFullYear()} Sun Safari Destinations
        </div>
      </div>

      {/* Right login panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="text-primary font-bold text-xl">
              <span className="text-gold">Sun Safari</span> Destinations
            </div>
          </div>

          <h2 className="text-2xl font-bold text-primary mb-2">Staff Login</h2>
          <p className="text-gray-500 text-sm mb-8">Sign in to access the management portal</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="your@email.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <Link to="/" className="text-teal hover:underline text-sm">
              ← Back to Public Site
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
