import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/index.js';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function fmt(x, currency = 'ZAR') {
  return `${currency} ${Number(x || 0).toLocaleString()}`;
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-teal' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  );
}

function Badge({ label, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    teal: 'bg-teal/10 text-teal',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[color] || colors.gray}`}>
      {label}
    </span>
  );
}

function Skeleton({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

// ─── Tab 1: Base Rates ────────────────────────────────────────────────────────

function BaseRatesTab() {
  const { addToast } = useToast();
  const { property } = useProperty();
  const [increaseModal, setIncreaseModal] = useState(false);
  const [increasePct, setIncreasePct] = useState('');
  const [increaseDate, setIncreaseDate] = useState('');
  const [baseRates, setBaseRates] = useState([]);
  const [intlSettings, setIntlSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editRate, setEditRate] = useState(null);
  const [editIntl, setEditIntl] = useState(false);
  const [rateForm, setRateForm] = useState({});
  const [intlForm, setIntlForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [br, intl] = await Promise.all([
        api.get('/api/rates/base'),
        api.get('/api/rates/international'),
      ]);
      setBaseRates(br.data?.base_rates || []);
      setIntlSettings(intl.data?.international_settings || null);
    } catch {
      addToast('Failed to load base rates', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openEditRate = (r) => {
    setRateForm({ rate_per_person: r.rate_per_person, notes: r.notes || '' });
    setEditRate(r);
  };

  const saveRate = async () => {
    try {
      await api.put(`/api/rates/base/${editRate.id}`, rateForm);
      addToast('Base rate updated');
      setEditRate(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error saving rate', 'error');
    }
  };

  const openEditIntl = () => {
    if (!intlSettings) return;
    setIntlForm({
      markup_percent: intlSettings.markup_percent,
      children_meal_pct: intlSettings.children_meal_pct,
      children_room_pct: intlSettings.children_room_pct,
    });
    setEditIntl(true);
  };

  const saveIntl = async () => {
    try {
      await api.put(`/api/rates/international/${intlSettings.id}`, intlForm);
      addToast('International settings updated');
      setEditIntl(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error saving settings', 'error');
    }
  };

  const applyIncrease = async () => {
    try {
      await api.post('/api/rates/base/bulk-increase', { pct: parseFloat(increasePct) });
      addToast(`Rates increased by ${increasePct}%`);
      setIncreaseModal(false);
      setIncreasePct('');
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error applying increase', 'error');
    }
  };

  const exampleSadc = baseRates.length > 0 ? baseRates[0].rate_per_person : 3000;
  const exampleIntl = intlForm.markup_percent
    ? Math.round(exampleSadc * (1 + Number(intlForm.markup_percent) / 100))
    : intlSettings
    ? Math.round(exampleSadc * (1 + intlSettings.markup_percent / 100))
    : 0;

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Base Rates ({property?.currency || 'ZAR'})</span>
          <button onClick={() => setIncreaseModal(true)} className="text-sm border border-amber-300 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50">
            Increase All Rates
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {['Room Type', 'Max Occupancy', 'SADC Rate/person/night', 'International Rate/person/night', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {baseRates.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-primary">{r.room_type_name}</td>
                <td className="px-4 py-3 text-gray-600">{r.max_occupancy}</td>
                <td className="px-4 py-3 font-medium">{fmt(r.rate_per_person, property?.currency)}</td>
                <td className="px-4 py-3 font-medium text-teal">{fmt(r.international_rate, property?.currency)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEditRate(r)} className="text-teal text-xs hover:underline font-medium">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {baseRates.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No base rates configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {intlSettings && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-primary">International Markup</h3>
              <p className="text-sm text-gray-500 mt-1">
                Applied to all SADC rates for international guests
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-2xl font-bold text-teal">{intlSettings.markup_percent}%</span>
              <button onClick={openEditIntl} className="text-teal text-sm hover:underline font-medium">Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Base Rate Modal */}
      <Modal open={!!editRate} onClose={() => setEditRate(null)} title={`Edit Rate — ${editRate?.room_type_name}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SADC Rate / person / night</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{property?.currency || 'ZAR'}</span>
              <input
                type="number"
                value={rateForm.rate_per_person || ''}
                onChange={e => setRateForm(p => ({ ...p, rate_per_person: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={rateForm.notes || ''}
              onChange={e => setRateForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditRate(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveRate} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>

      {/* Edit International Modal */}
      <Modal open={editIntl} onClose={() => setEditIntl(false)} title="International Settings" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Markup Percentage (%)</label>
            <input
              type="number"
              value={intlForm.markup_percent || ''}
              onChange={e => setIntlForm(p => ({ ...p, markup_percent: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {intlSettings && intlForm.markup_percent !== '' && (
            <div className="bg-teal/5 border border-teal/20 rounded-lg p-3 text-sm">
              <span className="text-gray-600">International rate = SADC × {(1 + Number(intlForm.markup_percent) / 100).toFixed(2)} </span>
              <span className="text-gray-400">(e.g. {fmt(exampleSadc, property?.currency)} → <strong className="text-teal">{fmt(exampleIntl, property?.currency)}</strong>)</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Children meal rate (%)</label>
            <input
              type="number"
              value={intlForm.children_meal_pct || ''}
              onChange={e => setIntlForm(p => ({ ...p, children_meal_pct: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Children room rate (%)</label>
            <input
              type="number"
              value={intlForm.children_room_pct || ''}
              onChange={e => setIntlForm(p => ({ ...p, children_room_pct: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditIntl(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveIntl} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>

      {/* Increase All Rates Modal */}
      <Modal open={increaseModal} onClose={() => setIncreaseModal(false)} title="Increase Base Rates" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">% Increase <span className="text-red-500">*</span></label>
            <input
              type="number"
              min="0.1"
              max="500"
              step="0.1"
              value={increasePct}
              onChange={e => setIncreasePct(e.target.value)}
              placeholder="e.g. 10"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Effective From (informational)</label>
            <input
              type="date"
              value={increaseDate}
              onChange={e => setIncreaseDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            This will update all room base rates immediately. Existing bookings are unaffected.
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setIncreaseModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={applyIncrease} disabled={!increasePct || parseFloat(increasePct) <= 0} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">Apply Increase</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab 2: Meal Components ────────────────────────────────────────────────────

function MealsTab() {
  const { addToast } = useToast();
  const { property } = useProperty();
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/rates/meals');
      setMeals(r.data?.meal_components || []);
    } catch {
      addToast('Failed to load meals', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', cost_per_person: '', notes: '', active: 1 });
    setModal(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({ name: m.name, cost_per_person: m.cost_per_person, notes: m.notes || '', active: m.active });
    setModal(true);
  };

  const save = async () => {
    if (!form.name || !form.cost_per_person) {
      addToast('Name and cost are required', 'error');
      return;
    }
    try {
      if (editing) {
        await api.put(`/api/rates/meals/${editing.id}`, form);
      } else {
        await api.post('/api/rates/meals', form);
      }
      addToast(editing ? 'Meal component updated' : 'Meal component created');
      setModal(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error saving', 'error');
    }
  };

  const deactivate = async (m) => {
    try {
      await api.delete(`/api/rates/meals/${m.id}`);
      addToast('Deactivated');
      load();
    } catch {
      addToast('Error', 'error');
    }
  };

  const reactivate = async (m) => {
    try {
      await api.put(`/api/rates/meals/${m.id}`, { active: 1 });
      addToast('Reactivated');
      load();
    } catch {
      addToast('Error', 'error');
    }
  };

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openNew} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Add Meal Component
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {['Name', 'Cost/person/night', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {meals.map(m => (
              <tr key={m.id} className={`hover:bg-gray-50 ${!m.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-primary">{m.name}</td>
                <td className="px-4 py-3">{fmt(m.cost_per_person, property?.currency)}</td>
                <td className="px-4 py-3">
                  {m.active
                    ? <Badge label="Active" color="green" />
                    : <Badge label="Inactive" color="gray" />
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(m)} className="text-teal text-xs hover:underline font-medium">Edit</button>
                    {m.active
                      ? <button onClick={() => deactivate(m)} className="text-red-500 text-xs hover:underline">Deactivate</button>
                      : <button onClick={() => reactivate(m)} className="text-green-600 text-xs hover:underline">Reactivate</button>
                    }
                  </div>
                </td>
              </tr>
            ))}
            {meals.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">No meal components configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Meal Component' : 'New Meal Component'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              value={form.name || ''}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Full Board, Breakfast Only"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cost per person / night ({property?.currency || 'ZAR'}) <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={form.cost_per_person || ''}
              onChange={e => setForm(p => ({ ...p, cost_per_person: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
          {editing && (
            <Toggle
              checked={!!form.active}
              onChange={v => setForm(p => ({ ...p, active: v ? 1 : 0 }))}
              label="Active"
            />
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={save} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab 3: Rate Plans ─────────────────────────────────────────────────────────

function PlansTab() {
  const { addToast } = useToast();
  const { property } = useProperty();
  const [plans, setPlans] = useState([]);
  const [meals, setMeals] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [calcData, setCalcData] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const debouncedRoomType = useDebounce(form.room_type_id, 400);
  const debouncedMeals = useDebounce(form.meal_components_json, 400);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m, rt] = await Promise.all([
        api.get('/api/rates/plans'),
        api.get('/api/rates/meals'),
        api.get('/api/room-types'),
      ]);
      const plansData = p.data?.rate_plans || [];
      setPlans(plansData);
      setMeals((m.data?.meal_components || []).filter(x => x.active));
      setRoomTypes(rt.data?.room_types || []);

      // Fetch calc for all room types
      const uniqueRoomTypes = [...new Set(plansData.map(pl => pl.room_type_id).filter(Boolean))];
      const calcResults = {};
      await Promise.all(
        uniqueRoomTypes.map(async (rtId) => {
          try {
            const r = await api.get('/api/rates/calculate', {
              params: { room_type_id: rtId, check_in: tomorrow(), adults: 2, nights: 1 },
            });
            (r.data?.rate_plans || []).forEach(rp => {
              calcResults[rp.id] = rp;
            });
          } catch { /* ignore */ }
        })
      );
      setCalcData(calcResults);
    } catch {
      addToast('Failed to load rate plans', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  // Preview in modal
  useEffect(() => {
    if (!modal || !debouncedRoomType) { setPreview(null); return; }
    setPreviewLoading(true);
    api.get('/api/rates/calculate', {
      params: { room_type_id: debouncedRoomType, check_in: tomorrow(), adults: 2, nights: 1 },
    }).then(r => {
      const selectedMeals = JSON.parse(debouncedMeals || '[]');
      // Find matching plan or compute approximate
      const matchingPlan = (r.data?.rate_plans || []).find(rp => {
        const planMeals = Array.isArray(rp.meal_components_json)
          ? rp.meal_components_json
          : JSON.parse(rp.meal_components_json || '[]');
        const planMealIds = planMeals.map(m => m.id || m);
        return JSON.stringify(planMealIds.sort()) === JSON.stringify([...selectedMeals].sort());
      });
      setPreview(matchingPlan || (r.data?.rate_plans || [])[0] || null);
    }).catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [modal, debouncedRoomType, debouncedMeals]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '',
      room_type_id: '',
      meal_components_json: '[]',
      description: '',
      visible_on_website: 1,
      visible_on_backoffice: 1,
      active: 1,
    });
    setModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name,
      room_type_id: p.room_type_id || '',
      meal_components_json: typeof p.meal_components_json === 'string'
        ? p.meal_components_json
        : JSON.stringify(p.meal_components_json || []),
      description: p.description || '',
      visible_on_website: p.visible_on_website,
      visible_on_backoffice: p.visible_on_backoffice,
      active: p.active,
    });
    setModal(true);
  };

  const toggleMealInForm = (mealId) => {
    const current = JSON.parse(form.meal_components_json || '[]');
    const next = current.includes(mealId) ? current.filter(id => id !== mealId) : [...current, mealId];
    setForm(p => ({ ...p, meal_components_json: JSON.stringify(next) }));
  };

  const save = async () => {
    if (!form.name) { addToast('Plan name is required', 'error'); return; }
    if (!form.room_type_id) { addToast('Room type is required', 'error'); return; }
    try {
      if (editing) {
        await api.put(`/api/rates/plans/${editing.id}`, form);
      } else {
        await api.post('/api/rates/plans', form);
      }
      addToast(editing ? 'Rate plan updated' : 'Rate plan created');
      setModal(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error saving', 'error');
    }
  };

  const deletePlan = async (p) => {
    if (!confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.delete(`/api/rates/plans/${p.id}`);
      addToast('Plan deleted');
      load();
    } catch {
      addToast('Error deleting plan', 'error');
    }
  };

  const getMealNames = (mealJson) => {
    try {
      const ids = typeof mealJson === 'string' ? JSON.parse(mealJson) : mealJson;
      if (!ids || ids.length === 0) return 'Room Only';
      return ids.map(id => {
        const m = meals.find(x => x.id === id);
        return m ? m.name : `#${id}`;
      }).join(', ');
    } catch { return 'Room Only'; }
  };

  // Group by room type
  const grouped = roomTypes.map(rt => ({
    roomType: rt,
    plans: plans.filter(p => p.room_type_id === rt.id),
  })).filter(g => g.plans.length > 0);

  const selectedMealIds = JSON.parse(form.meal_components_json || '[]');

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={openNew} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">
          + New Rate Plan
        </button>
      </div>

      {grouped.map(({ roomType, plans: rtPlans }) => (
        <div key={roomType.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-primary/5 px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-primary">{roomType.name}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  {['Plan Name', 'Included Meals', 'Preview (2 adults, 1 night)', 'Website', 'Back Office', 'Active', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rtPlans.map(p => {
                  const calc = calcData[p.id];
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50 ${!p.active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium text-primary">{p.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">{getMealNames(p.meal_components_json)}</td>
                      <td className="px-4 py-3 font-medium">{calc ? fmt(calc.total_per_night, property?.currency) : '—'}</td>
                      <td className="px-4 py-3">{p.visible_on_website ? '✓' : '—'}</td>
                      <td className="px-4 py-3">{p.visible_on_backoffice ? '✓' : '—'}</td>
                      <td className="px-4 py-3">
                        <Badge label={p.active ? 'Active' : 'Off'} color={p.active ? 'green' : 'gray'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openEdit(p)} className="text-teal text-xs hover:underline">Edit</button>
                          <button onClick={() => deletePlan(p)} className="text-red-400 text-xs hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {grouped.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No rate plans configured
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Rate Plan' : 'New Rate Plan'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Name <span className="text-red-500">*</span></label>
              <input
                value={form.name || ''}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Full Board, Bed & Breakfast"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Type <span className="text-red-500">*</span></label>
              <select
                value={form.room_type_id || ''}
                onChange={e => setForm(p => ({ ...p, room_type_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select room type…</option>
                {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Included Meal Components</label>
            <div className="border border-gray-200 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
              {meals.length === 0 && <p className="text-xs text-gray-400">No active meal components</p>}
              {meals.map(m => (
                <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMealIds.includes(m.id)}
                    onChange={() => toggleMealInForm(m.id)}
                    className="rounded border-gray-300 text-teal"
                  />
                  <span className="text-sm">{m.name}</span>
                  <span className="text-xs text-gray-400">{fmt(m.cost_per_person, property?.currency)}/person</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description || ''}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex gap-6">
            <Toggle
              checked={!!form.visible_on_website}
              onChange={v => setForm(p => ({ ...p, visible_on_website: v ? 1 : 0 }))}
              label="Visible on Website"
            />
            <Toggle
              checked={!!form.visible_on_backoffice}
              onChange={v => setForm(p => ({ ...p, visible_on_backoffice: v ? 1 : 0 }))}
              label="Visible in Back Office"
            />
            {editing && (
              <Toggle
                checked={!!form.active}
                onChange={v => setForm(p => ({ ...p, active: v ? 1 : 0 }))}
                label="Active"
              />
            )}
          </div>

          {/* Live preview */}
          {form.room_type_id && (
            <div className="bg-teal/5 border border-teal/20 rounded-lg p-3">
              <p className="text-xs font-medium text-teal mb-1">Live Preview (2 adults, 1 night)</p>
              {previewLoading ? (
                <div className="h-4 bg-teal/10 rounded animate-pulse w-48" />
              ) : preview ? (
                <p className="text-sm text-gray-700">
                  Rate: <strong>{fmt(preview.total_per_night, property?.currency)}</strong>
                  {preview.total_for_stay ? <span className="text-gray-500 text-xs ml-1">/ {fmt(preview.total_for_stay, property?.currency)} for stay</span> : null}
                  <span className="text-gray-400 text-xs ml-1">(2 adults, 1 night)</span>
                </p>
              ) : (
                <p className="text-xs text-gray-400">No preview available</p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={save} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab 4: Seasons ────────────────────────────────────────────────────────────

const SEASON_COLORS = ['#0D4F8B', '#1B5E7B', '#2d6a4f', '#C8922A', '#8B4513', '#6B3FA0', '#B22222', '#2E8B57'];

function SeasonCalendar({ seasons }) {
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01`).getTime();
  const yearEnd = new Date(`${year}-12-31`).getTime();
  const yearDuration = yearEnd - yearStart;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const seasonBands = seasons.filter(s => s.active).map((s, i) => {
    const start = Math.max(new Date(s.start_date).getTime(), yearStart);
    const end = Math.min(new Date(s.end_date).getTime(), yearEnd);
    if (end < yearStart || start > yearEnd) return null;
    const left = ((start - yearStart) / yearDuration) * 100;
    const width = ((end - start) / yearDuration) * 100;
    return { ...s, left, width, color: SEASON_COLORS[i % SEASON_COLORS.length] };
  }).filter(Boolean);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <h3 className="text-sm font-semibold text-primary mb-3">{year} Season Overview</h3>
      <div className="relative">
        {/* Month grid */}
        <div className="flex text-xs text-gray-400 mb-1">
          {MONTHS.map(m => (
            <div key={m} className="flex-1 text-center">{m}</div>
          ))}
        </div>
        {/* Base bar */}
        <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
          {/* Month dividers */}
          {MONTHS.map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-px bg-gray-200"
              style={{ left: `${(i / 12) * 100}%` }}
            />
          ))}
          {/* Season bands */}
          {seasonBands.map(s => (
            <div
              key={s.id}
              className="absolute top-1 bottom-1 rounded group cursor-default"
              style={{ left: `${s.left}%`, width: `${Math.max(s.width, 0.5)}%`, backgroundColor: s.color + 'cc' }}
              title={`${s.name} (${s.start_date} – ${s.end_date}, ${s.uplift_percent > 0 ? '+' : ''}${s.uplift_percent}%)`}
            >
              {s.width > 5 && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium truncate px-1">
                  {s.name}
                </span>
              )}
            </div>
          ))}
          {seasonBands.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
              No active seasons in {year}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SeasonsTab() {
  const { addToast } = useToast();
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/rates/seasons');
      setSeasons(r.data?.seasons || []);
    } catch {
      addToast('Failed to load seasons', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({
      name: '',
      start_date: '',
      end_date: '',
      uplift_percent: 0,
      applies_to_sadc: 1,
      applies_to_international: 1,
      applies_to_channels: 0,
      active: 1,
      notes: '',
    });
    setModal(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ ...s, notes: s.notes || '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name || !form.start_date || !form.end_date) {
      addToast('Name, start date and end date are required', 'error');
      return;
    }
    if (form.end_date < form.start_date) {
      addToast('End date must be after start date', 'error');
      return;
    }
    try {
      if (editing) {
        await api.put(`/api/rates/seasons/${editing.id}`, form);
      } else {
        await api.post('/api/rates/seasons', form);
      }
      addToast(editing ? 'Season updated' : 'Season created');
      setModal(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error saving', 'error');
    }
  };

  const deleteSeason = async (s) => {
    if (!confirm(`Delete "${s.name}"?`)) return;
    try {
      await api.delete(`/api/rates/seasons/${s.id}`);
      addToast('Season deleted');
      load();
    } catch {
      addToast('Error', 'error');
    }
  };

  // Overlap detection
  const overlappingSeasons = form.start_date && form.end_date
    ? seasons.filter(s => {
        if (editing && s.id === editing.id) return false;
        if (!s.active) return false;
        return s.start_date <= form.end_date && s.end_date >= form.start_date;
      })
    : [];

  const dateError = form.end_date && form.start_date && form.end_date < form.start_date;

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-4">
      <SeasonCalendar seasons={seasons} />

      <div className="flex justify-end">
        <button onClick={openNew} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">
          + New Season
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
            <tr>
              {['Name', 'Start', 'End', 'Uplift %', 'SADC', 'Intl', 'Channels', 'Active', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {seasons.map(s => (
              <tr key={s.id} className={`hover:bg-gray-50 ${!s.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-primary">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.start_date}</td>
                <td className="px-4 py-3 text-gray-600">{s.end_date}</td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${Number(s.uplift_percent) > 0 ? 'text-green-600' : Number(s.uplift_percent) < 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                    {Number(s.uplift_percent) > 0 ? '+' : ''}{s.uplift_percent}%
                  </span>
                </td>
                <td className="px-4 py-3 text-center">{s.applies_to_sadc ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-center">{s.applies_to_international ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-center">{s.applies_to_channels ? '✓' : '—'}</td>
                <td className="px-4 py-3">
                  <Badge label={s.active ? 'Active' : 'Off'} color={s.active ? 'green' : 'gray'} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(s)} className="text-teal text-xs hover:underline">Edit</button>
                    <button onClick={() => deleteSeason(s)} className="text-red-400 text-xs hover:underline">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {seasons.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No seasons configured</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Season' : 'New Season'} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season Name <span className="text-red-500">*</span></label>
            <input
              value={form.name || ''}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. Peak Season, Low Season"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.start_date || ''}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={form.end_date || ''}
                onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm ${dateError ? 'border-red-300' : 'border-gray-300'}`}
              />
            </div>
          </div>

          {dateError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              End date must be after start date
            </div>
          )}

          {overlappingSeasons.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              Overlaps with: {overlappingSeasons.map(s => s.name).join(', ')}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Uplift % (can be negative)</label>
            <input
              type="number"
              value={form.uplift_percent ?? 0}
              onChange={e => setForm(p => ({ ...p, uplift_percent: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Applies To</label>
            <div className="flex gap-4 flex-wrap">
              <Toggle
                checked={!!form.applies_to_sadc}
                onChange={v => setForm(p => ({ ...p, applies_to_sadc: v ? 1 : 0 }))}
                label="SADC guests"
              />
              <Toggle
                checked={!!form.applies_to_international}
                onChange={v => setForm(p => ({ ...p, applies_to_international: v ? 1 : 0 }))}
                label="International guests"
              />
              <Toggle
                checked={!!form.applies_to_channels}
                onChange={v => setForm(p => ({ ...p, applies_to_channels: v ? 1 : 0 }))}
                label="Channels"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {editing && (
            <Toggle
              checked={!!form.active}
              onChange={v => setForm(p => ({ ...p, active: v ? 1 : 0 }))}
              label="Active"
            />
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={!!dateError}
            className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab 5: Channels ───────────────────────────────────────────────────────────

const CHANNEL_TYPE_COLORS = {
  ota: 'blue',
  agent: 'amber',
  seo: 'teal',
  direct: 'green',
};

function ChannelsTab() {
  const { addToast } = useToast();
  const [channels, setChannels] = useState([]);
  const [allPlans, setAllPlans] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [assignModal, setAssignModal] = useState(null); // channel object
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [assignSelected, setAssignSelected] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ch, pl, rt] = await Promise.all([
        api.get('/api/rates/channels'),
        api.get('/api/rates/plans'),
        api.get('/api/room-types'),
      ]);
      setChannels(ch.data?.channels || []);
      setAllPlans((pl.data?.rate_plans || []).filter(p => p.active));
      setRoomTypes(rt.data?.room_types || []);
    } catch {
      addToast('Failed to load channels', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', type: 'ota', markup_percent: 0, base_region: 'SADC', currency: 'ZAR', notes: '' });
    setModal(true);
  };

  const openEdit = (ch) => {
    setEditing(ch);
    setForm({ name: ch.name, type: ch.type, markup_percent: ch.markup_percent, base_region: ch.base_region, currency: ch.currency, notes: ch.notes || '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name) { addToast('Channel name is required', 'error'); return; }
    try {
      if (editing) {
        await api.put(`/api/rates/channels/${editing.id}`, form);
      } else {
        await api.post('/api/rates/channels', form);
      }
      addToast(editing ? 'Channel updated' : 'Channel created');
      setModal(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error saving', 'error');
    }
  };

  const togglePlanEnabled = async (channel, planId, enabled) => {
    try {
      await api.put(`/api/rates/channels/${channel.id}/plans/${planId}`, { enabled });
      load();
    } catch {
      addToast('Error updating plan', 'error');
    }
  };

  const openAssign = (ch) => {
    const enabledIds = (ch.rate_plans || []).filter(p => p.enabled).map(p => p.id);
    setAssignSelected(enabledIds);
    setAssignModal(ch);
  };

  const saveAssign = async () => {
    try {
      await api.post(`/api/rates/channels/${assignModal.id}/plans`, { rate_plan_ids: assignSelected });
      addToast('Plans assigned');
      setAssignModal(null);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error', 'error');
    }
  };

  const getPlanName = (planId) => {
    const p = allPlans.find(x => x.id === planId);
    return p ? p.name : `Plan #${planId}`;
  };

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openNew} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Add New Channel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map(ch => (
          <div key={ch.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">{ch.name}</span>
                <Badge label={ch.type?.toUpperCase()} color={CHANNEL_TYPE_COLORS[ch.type] || 'gray'} />
                {ch.markup_percent !== 0 && (
                  <span className="text-xs text-gray-500">+{ch.markup_percent}%</span>
                )}
              </div>
              <button onClick={() => openEdit(ch)} className="text-teal text-xs hover:underline">Edit</button>
            </div>
            <div className="p-4">
              <div className="space-y-2 mb-3">
                {(ch.rate_plans || []).length === 0 ? (
                  <p className="text-xs text-gray-400">No plans assigned</p>
                ) : (
                  (ch.rate_plans || []).map(plan => (
                    <div key={plan.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{plan.plan_name}</span>
                      <Toggle
                        checked={!!plan.enabled}
                        onChange={v => togglePlanEnabled(ch, plan.id, v ? 1 : 0)}
                      />
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => openAssign(ch)}
                className="text-xs text-teal hover:underline border border-teal/30 rounded px-2 py-1 hover:bg-teal/5"
              >
                Assign Plans
              </button>
            </div>
          </div>
        ))}
        {channels.length === 0 && (
          <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            No channels configured
          </div>
        )}
      </div>

      {/* Create/Edit Channel Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Channel' : 'New Channel'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel Name <span className="text-red-500">*</span></label>
            <input
              value={form.name || ''}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type || 'ota'}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {['ota', 'agent', 'seo', 'direct'].map(t => (
                  <option key={t} value={t}>{t.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Markup %</label>
              <input
                type="number"
                value={form.markup_percent ?? 0}
                onChange={e => setForm(p => ({ ...p, markup_percent: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Region</label>
              <select
                value={form.base_region || 'SADC'}
                onChange={e => setForm(p => ({ ...p, base_region: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="SADC">SADC</option>
                <option value="International">International</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input
                value={form.currency || ''}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={save} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>

      {/* Assign Plans Modal */}
      <Modal
        open={!!assignModal}
        onClose={() => setAssignModal(null)}
        title={`Assign Plans — ${assignModal?.name}`}
        size="md"
      >
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {roomTypes.map(rt => {
            const rtPlans = allPlans.filter(p => p.room_type_id === rt.id);
            if (rtPlans.length === 0) return null;
            return (
              <div key={rt.id}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{rt.name}</p>
                {rtPlans.map(plan => (
                  <label key={plan.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 rounded px-2">
                    <input
                      type="checkbox"
                      checked={assignSelected.includes(plan.id)}
                      onChange={() => {
                        setAssignSelected(prev =>
                          prev.includes(plan.id)
                            ? prev.filter(id => id !== plan.id)
                            : [...prev, plan.id]
                        );
                      }}
                      className="rounded border-gray-300 text-teal"
                    />
                    <span className="text-sm">{plan.name}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setAssignModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveAssign} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Tab 6: Rate Preview (Staff Calculator) ────────────────────────────────────

function PreviewTab() {
  const { addToast } = useToast();
  const [roomTypes, setRoomTypes] = useState([]);
  const [channels, setChannels] = useState([]);
  const [inputs, setInputs] = useState({
    room_type_id: '',
    check_in: tomorrow(),
    nights: 3,
    adults: 2,
    children: 0,
    channel_id: '',
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const debouncedInputs = useDebounce(inputs, 500);

  useEffect(() => {
    Promise.all([api.get('/api/room-types'), api.get('/api/rates/channels')])
      .then(([rt, ch]) => {
        setRoomTypes(rt.data?.room_types || []);
        setChannels(ch.data?.channels || []);
      })
      .catch(() => addToast('Failed to load calculator data', 'error'));
  }, [addToast]);

  useEffect(() => {
    if (!debouncedInputs.room_type_id || !debouncedInputs.check_in) {
      setResults(null);
      return;
    }
    setLoading(true);
    const params = {
      room_type_id: debouncedInputs.room_type_id,
      check_in: debouncedInputs.check_in,
      nights: debouncedInputs.nights || 1,
      adults: debouncedInputs.adults || 1,
      children: debouncedInputs.children || 0,
    };
    if (debouncedInputs.channel_id) params.channel_id = debouncedInputs.channel_id;
    api.get('/api/rates/calculate', { params })
      .then(r => setResults(r.data?.rate_plans || []))
      .catch(() => addToast('Failed to calculate rates', 'error'))
      .finally(() => setLoading(false));
  }, [debouncedInputs, addToast]);

  const setInput = (key, value) => setInputs(p => ({ ...p, [key]: value }));

  const nights = Number(inputs.nights) || 1;

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-primary mb-4">Rate Calculator</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select
              value={inputs.room_type_id}
              onChange={e => setInput('room_type_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select room type…</option>
              {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Date</label>
            <input
              type="date"
              value={inputs.check_in}
              onChange={e => setInput('check_in', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nights</label>
            <input
              type="number"
              min="1"
              value={inputs.nights}
              onChange={e => setInput('nights', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
            <input
              type="number"
              min="1"
              value={inputs.adults}
              onChange={e => setInput('adults', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
            <input
              type="number"
              min="0"
              value={inputs.children}
              onChange={e => setInput('children', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel (optional)</label>
            <select
              value={inputs.channel_id}
              onChange={e => setInput('channel_id', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Direct / SADC</option>
              {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {!inputs.room_type_id || !inputs.check_in ? (
        <div className="text-center text-gray-400 py-8 text-sm">
          Select a room type and check-in date to see rates
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
              <div className="h-8 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : results && results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map(plan => {
            const isHidden = !plan.visible_on_backoffice;
            const season = plan.season_applied;
            const hasSeasonUplift = season && Number(season.uplift_percent) !== 0;

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-xl border p-5 ${isHidden ? 'opacity-50 border-gray-100' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-primary text-sm">{plan.name}</h4>
                  {isHidden && <Badge label="Hidden" color="gray" />}
                </div>
                {plan.total_per_night ? (
                  <>
                    <p className="text-2xl font-bold text-primary">{fmt(plan.total_per_night)}</p>
                    <p className="text-sm text-gray-500">per night</p>
                    {nights > 1 && plan.total_for_stay && (
                      <p className="text-sm font-medium text-gray-700 mt-1">{fmt(plan.total_for_stay)} for {nights} nights</p>
                    )}
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">Rate not available</p>
                )}
                {hasSeasonUplift && (
                  <p className="text-xs text-amber-600 mt-2">
                    ↑ {season.name} {Number(season.uplift_percent) > 0 ? '+' : ''}{season.uplift_percent}%
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-2">VAT included</p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8 text-sm">
          No rate plans available for this selection
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const TABS = [
  { key: 'base', label: 'Base Rates' },
  { key: 'meals', label: 'Meal Components' },
  { key: 'plans', label: 'Rate Plans' },
  { key: 'seasons', label: 'Seasons' },
  { key: 'channels', label: 'Channels' },
  { key: 'preview', label: 'Rate Preview' },
];

export default function Rates() {
  const [tab, setTab] = useState('base');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Rates Management</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'base' && <BaseRatesTab />}
      {tab === 'meals' && <MealsTab />}
      {tab === 'plans' && <PlansTab />}
      {tab === 'seasons' && <SeasonsTab />}
      {tab === 'channels' && <ChannelsTab />}
      {tab === 'preview' && <PreviewTab />}
    </div>
  );
}
