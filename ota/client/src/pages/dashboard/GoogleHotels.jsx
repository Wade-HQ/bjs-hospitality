import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function GoogleHotels() {
  const { addToast } = useToast();
  const [rateOverrides, setRateOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rateModal, setRateModal] = useState(false);
  const [editRate, setEditRate] = useState(null);
  const [rateForm, setRateForm] = useState({ property_id: '', room_type_id: '', rate: '', start_date: '', end_date: '' });
  const [savingRate, setSavingRate] = useState(false);
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    api.get('/api/google-hotels/rate-overrides')
      .then(r => setRateOverrides(r.data || []))
      .catch(() => setRateOverrides([]))
      .finally(() => setLoading(false));

    api.get('/api/properties')
      .then(r => setProperties(r.data || []))
      .catch(() => {});
  }, []);

  const handleSaveRate = async () => {
    setSavingRate(true);
    try {
      if (editRate) {
        await api.put(`/api/google-hotels/rate-overrides/${editRate.id}`, rateForm);
        addToast('Rate override updated', 'success');
      } else {
        await api.post('/api/google-hotels/rate-overrides', rateForm);
        addToast('Rate override added', 'success');
      }
      setRateModal(false);
      setEditRate(null);
      api.get('/api/google-hotels/rate-overrides').then(r => setRateOverrides(r.data || [])).catch(() => {});
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save rate', 'error');
    } finally {
      setSavingRate(false);
    }
  };

  const openAddRate = () => {
    setEditRate(null);
    setRateForm({ property_id: '', room_type_id: '', rate: '', start_date: '', end_date: '' });
    setRateModal(true);
  };

  const openEditRate = (r) => {
    setEditRate(r);
    setRateForm({ property_id: r.property_id, room_type_id: r.room_type_id, rate: r.rate, start_date: r.start_date, end_date: r.end_date });
    setRateModal(true);
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-primary text-lg mb-1">Google Hotel Center</h2>
            <p className="text-gray-500 text-sm">Connect to Google Hotel Center to display your properties in Google Search and Maps.</p>
          </div>
          <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1.5 rounded-full">Not Connected</span>
        </div>
        <div className="mt-5">
          <div className="relative inline-block">
            <button
              disabled
              className="bg-primary/40 text-white/60 cursor-not-allowed px-5 py-2.5 rounded-xl text-sm font-medium"
            >
              Connect Google Hotel Center
            </button>
            <div className="absolute -top-8 left-0 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              Coming in Phase 2
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
          <span>ℹ</span> Setup Instructions
        </h3>
        <ol className="text-amber-700 text-sm space-y-2 list-decimal list-inside">
          <li>Create a Google Hotel Center account at hotel center.google.com</li>
          <li>Submit your property feed (ARI data) to Google</li>
          <li>Link your Hotel Center account with your Google Ads account</li>
          <li>Configure your booking engine redirect URL</li>
          <li>Use the rate overrides below to set specific rates for Google</li>
        </ol>
      </div>

      {/* Rate Overrides */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-primary">Google Rate Overrides</h2>
            <p className="text-xs text-gray-400 mt-0.5">Override rates specifically for Google Hotel pricing</p>
          </div>
          <button
            onClick={openAddRate}
            className="bg-teal hover:bg-teal/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            + Add Override
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : rateOverrides.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            <div className="text-3xl mb-2">🔍</div>
            <p>No rate overrides configured</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-primary">
                <tr>
                  {['Property', 'Room Type', 'Rate', 'Start Date', 'End Date', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-50">
                {rateOverrides.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-primary">{r.property_name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.room_type_name}</td>
                    <td className="px-4 py-3 font-medium">{r.currency || 'ZAR'} {Number(r.rate).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(r.start_date)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(r.end_date)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEditRate(r)} className="text-teal hover:underline text-xs">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rate Modal */}
      <Modal open={rateModal} onClose={() => setRateModal(false)} title={editRate ? 'Edit Rate Override' : 'Add Rate Override'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">PROPERTY</label>
            <select
              value={rateForm.property_id}
              onChange={e => setRateForm(f => ({ ...f, property_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            >
              <option value="">Select property...</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">RATE (ZAR)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={rateForm.rate}
              onChange={e => setRateForm(f => ({ ...f, rate: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">START DATE</label>
              <input
                type="date"
                value={rateForm.start_date}
                onChange={e => setRateForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">END DATE</label>
              <input
                type="date"
                value={rateForm.end_date}
                onChange={e => setRateForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setRateModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={handleSaveRate}
              disabled={savingRate}
              className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {savingRate ? 'Saving...' : 'Save Override'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
