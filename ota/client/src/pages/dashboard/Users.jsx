import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

const ROLES = ['viewer', 'agent', 'manager', 'admin', 'super_admin'];

const EMPTY_FORM = {
  name: '', email: '', password: '', role: 'agent', property_ids: []
};

export default function Users() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, propsRes] = await Promise.allSettled([
        api.get('/api/users'),
        api.get('/api/properties'),
      ]);
      if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data || []);
      if (propsRes.status === 'fulfilled') setProperties(propsRes.value.data || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/users', form);
      addToast('User created successfully', 'success');
      setCreateModal(false);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to create user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (userId) => {
    if (!window.confirm('Deactivate this user? They will no longer be able to log in.')) return;
    setDeactivating(userId);
    try {
      await api.put(`/api/users/${userId}/deactivate`);
      addToast('User deactivated', 'success');
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to deactivate user', 'error');
    } finally {
      setDeactivating(null);
    }
  };

  const toggleProperty = (propId) => {
    setForm(f => ({
      ...f,
      property_ids: f.property_ids.includes(propId)
        ? f.property_ids.filter(id => id !== propId)
        : [...f.property_ids, propId]
    }));
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const roleColor = (role) => {
    const colors = {
      super_admin: 'bg-red-100 text-red-700',
      admin: 'bg-purple-100 text-purple-700',
      manager: 'bg-blue-100 text-blue-700',
      agent: 'bg-teal/10 text-teal',
      viewer: 'bg-gray-100 text-gray-600',
    };
    return colors[role] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setForm(EMPTY_FORM); setCreateModal(true); }}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Create User
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <div className="text-4xl mb-2">👥</div>
            <p>No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-primary">
                  {['Name', 'Email', 'Role', 'Properties', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                          {user.name ? user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                        </div>
                        <span className="font-medium text-primary text-sm">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleColor(user.role)}`}>
                        {user.role?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {user.properties?.length > 0
                        ? user.properties.map(p => p.name).join(', ')
                        : <span className="text-gray-300">All</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {user.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{fmt(user.created_at)}</td>
                    <td className="px-4 py-3">
                      {user.active !== false && (
                        <button
                          onClick={() => handleDeactivate(user.id)}
                          disabled={deactivating === user.id}
                          className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {deactivating === user.id ? '...' : 'Deactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create New User">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">FULL NAME</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">EMAIL ADDRESS</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">TEMPORARY PASSWORD</label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">ROLE</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            >
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          {properties.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">PROPERTY ACCESS</label>
              <p className="text-xs text-gray-400 mb-2">Leave empty for access to all properties</p>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3">
                {properties.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.property_ids.includes(p.id)}
                      onChange={() => toggleProperty(p.id)}
                      className="w-4 h-4 text-teal border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setCreateModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
