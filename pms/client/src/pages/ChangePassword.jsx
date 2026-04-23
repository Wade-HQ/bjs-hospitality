import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/index.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function ChangePassword() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      navigate('/dashboard');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to change password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-4xl font-bold text-primary mb-1">BJS</div>
          <div className="text-gold font-semibold text-sm tracking-widest uppercase">Hospitality</div>
          <div className="text-gray-600 text-sm mt-3 font-medium">Change Your Password</div>
          <div className="text-gray-400 text-xs mt-1">A new password is required before you can continue</div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving…' : 'Set New Password'}
          </button>
        </form>

        <button
          onClick={logout}
          className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
