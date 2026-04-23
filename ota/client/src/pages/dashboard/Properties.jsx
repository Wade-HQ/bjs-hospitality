import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

const PROPERTY_TYPES = ['lodge', 'camp', 'resort', 'villa', 'boutique_hotel', 'guesthouse', 'other'];
const CURRENCIES = ['ZAR', 'USD', 'EUR', 'GBP', 'MZN'];

const EMPTY_FORM = {
  name: '', slug: '', country: '', property_type: 'lodge', description: '',
  commission_rate: '', currency: 'ZAR', contact_email: '', contact_phone: '',
};

export default function PropertiesDash() {
  const { addToast } = useToast();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editProp, setEditProp] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editCommission, setEditCommission] = useState(null);
  const [commissionValue, setCommissionValue] = useState('');
  const [savingCommission, setSavingCommission] = useState(false);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/properties');
      setProperties(res.data || []);
    } catch (_) {
      setProperties([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const openAdd = () => {
    setEditProp(null);
    setForm(EMPTY_FORM);
    setModal(true);
  };

  const openEdit = (p) => {
    setEditProp(p);
    setForm({
      name: p.name || '',
      slug: p.slug || '',
      country: p.country || '',
      property_type: p.property_type || 'lodge',
      description: p.description || '',
      commission_rate: p.commission_rate ?? '',
      currency: p.currency || 'ZAR',
      contact_email: p.contact_email || '',
      contact_phone: p.contact_phone || '',
    });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editProp) {
        await api.put(`/api/properties/${editProp.id}`, form);
        addToast('Property updated', 'success');
      } else {
        await api.post('/api/properties', form);
        addToast('Property created', 'success');
      }
      setModal(false);
      fetch();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save property', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCommission = async (propertyId) => {
    setSavingCommission(true);
    try {
      await api.put(`/api/properties/${propertyId}`, { commission_rate: Number(commissionValue) });
      addToast('Commission rate updated', 'success');
      setEditCommission(null);
      fetch();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update commission', 'error');
    } finally {
      setSavingCommission(false);
    }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}</p>
        <button
          onClick={openAdd}
          className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Add Property
        </button>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-40 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">🏨</div>
          <p className="font-medium">No properties yet</p>
          <p className="text-sm mt-1">Add your first property to get started</p>
          <button onClick={openAdd} className="mt-4 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            Add Property
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {properties.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-primary">{p.name}</h3>
                  <p className="text-gray-400 text-xs mt-0.5">{p.country} · {p.property_type}</p>
                </div>
                <button
                  onClick={() => openEdit(p)}
                  className="text-xs text-teal hover:underline flex-shrink-0"
                >
                  Edit
                </button>
              </div>

              {p.description && (
                <p className="text-gray-500 text-sm line-clamp-2 mb-3">{p.description}</p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Commission:</span>
                  {editCommission === p.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={commissionValue}
                        onChange={e => setCommissionValue(e.target.value)}
                        className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none"
                        autoFocus
                      />
                      <span className="text-xs text-gray-400">%</span>
                      <button
                        onClick={() => handleSaveCommission(p.id)}
                        disabled={savingCommission}
                        className="text-xs bg-green-600 text-white px-2 py-0.5 rounded"
                      >
                        {savingCommission ? '...' : 'Save'}
                      </button>
                      <button onClick={() => setEditCommission(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditCommission(p.id); setCommissionValue(p.commission_rate ?? ''); }}
                      className="text-xs font-medium text-primary hover:text-teal transition-colors"
                    >
                      {p.commission_rate != null ? `${p.commission_rate}%` : 'Set rate'}
                      <span className="text-gray-300 ml-1">✎</span>
                    </button>
                  )}
                </div>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{p.currency || 'ZAR'}</span>
              </div>

              {(p.room_types?.length > 0 || p._count?.room_types > 0) && (
                <p className="text-xs text-gray-400 mt-2">
                  {p.room_types?.length || p._count?.room_types} room type{(p.room_types?.length || p._count?.room_types) !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editProp ? 'Edit Property' : 'Add Property'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">PROPERTY NAME</label>
            <input
              type="text"
              value={form.name}
              onChange={e => {
                setField('name', e.target.value);
                if (!editProp) setField('slug', autoSlug(e.target.value));
              }}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">SLUG (URL identifier)</label>
            <input
              type="text"
              value={form.slug}
              onChange={e => setField('slug', e.target.value)}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">COUNTRY</label>
              <input
                type="text"
                value={form.country}
                onChange={e => setField('country', e.target.value)}
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">TYPE</label>
              <select
                value={form.property_type}
                onChange={e => setField('property_type', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              >
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">CURRENCY</label>
              <select
                value={form.currency}
                onChange={e => setField('currency', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">COMMISSION RATE (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={form.commission_rate}
                onChange={e => setField('commission_rate', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                placeholder="e.g. 15"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">DESCRIPTION</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">CONTACT EMAIL</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={e => setField('contact_email', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">CONTACT PHONE</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={e => setField('contact_phone', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {saving ? 'Saving...' : editProp ? 'Save Changes' : 'Add Property'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
