import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';

export default function NewBooking() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { property } = useProperty();
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [ratePlans, setRatePlans] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [form, setForm] = useState({
    check_in: '', check_out: '', room_type_id: '', room_id: '',
    adults: 1, children: 0, special_requests: '',
    source: 'direct', status: 'confirmed', rate_plan_id: '',
    guest: { first_name:'', last_name:'', email:'', phone:'', nationality:'', id_type:'passport', id_number:'' }
  });

  useEffect(() => {
    api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || []));
  }, []);

  useEffect(() => {
    if (!form.room_type_id) return;
    api.get('/api/rooms', { params: { room_type_id: form.room_type_id } }).then(r => setRooms(r.data?.rooms || []));
  }, [form.room_type_id]);

  // Load rate plans when room_type + dates + pax are all set
  useEffect(() => {
    if (!form.room_type_id || !form.check_in || !form.check_out || !form.adults) {
      setRatePlans([]);
      setForm(p => ({ ...p, rate_plan_id: '' }));
      return;
    }
    const ci = new Date(form.check_in), co = new Date(form.check_out);
    if (co <= ci) return;
    const nights = Math.max(1, Math.round((co - ci) / 86400000));
    const params = new URLSearchParams({
      room_type_id: form.room_type_id,
      check_in: form.check_in,
      adults: form.adults,
      children: form.children || 0,
      nights,
    });
    api.get(`/api/rates/calculate?${params}`)
      .then(r => {
        const plans = r.data?.rate_plans || [];
        setRatePlans(plans);
        if (plans.length === 1) setForm(p => ({ ...p, rate_plan_id: String(plans[0].id) }));
      })
      .catch(() => setRatePlans([]));
  }, [form.room_type_id, form.check_in, form.check_out, form.adults, form.children]);

  // Price preview when rate_plan_id is set
  useEffect(() => {
    const { rate_plan_id, check_in, check_out, adults, children } = form;
    if (!rate_plan_id || !check_in || !check_out || !adults) { setPreview(null); return; }
    const ci = new Date(check_in), co = new Date(check_out);
    if (co <= ci) { setPreview(null); return; }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({ rate_plan_id, check_in, check_out, adults, children: children || 0 });
        const r = await api.get(`/api/bookings/price-preview?${params}`);
        setPreview(r.data);
      } catch { setPreview(null); }
      finally { setPreviewLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [form.rate_plan_id, form.check_in, form.check_out, form.adults, form.children]);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setGuest = (k, v) => setForm(p => ({ ...p, guest: { ...p.guest, [k]: v } }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Flatten guest fields to root level — backend expects them at root, not nested
      const { guest, ...rest } = form;
      const r = await api.post('/api/bookings', { ...rest, ...guest });
      addToast('Booking created');
      navigate(`/dashboard/bookings/${r.data.booking.id}`);
    } catch (e) {
      addToast(e.response?.data?.error || 'Error creating booking', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h1 className="text-2xl font-bold text-primary">New Booking</h1>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Stay Details</h2>
          <div className="grid grid-cols-2 gap-4">
            {[{k:'check_in',l:'Check-in',t:'date'},{k:'check_out',l:'Check-out',t:'date'}].map(f => (
              <div key={f.k}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                <input type={f.t} value={form[f.k]} onChange={e => setField(f.k, e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
              <select value={form.room_type_id} onChange={e => setField('room_type_id', e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select room type</option>
                {roomTypes.map(rt => (
                  <option key={rt.id} value={rt.id}>{rt.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
              <select value={form.room_id} onChange={e => setField('room_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Auto-assign</option>
                {rooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number} (Floor {r.floor||'?'})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
              <input type="number" min={1} value={form.adults} onChange={e => setField('adults', parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
              <input type="number" min={0} value={form.children} onChange={e => setField('children', parseInt(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rate Plan</label>
              <select value={form.rate_plan_id} onChange={e => setField('rate_plan_id', e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">
                  {!form.room_type_id || !form.check_in || !form.check_out
                    ? 'Select room type and dates first'
                    : ratePlans.length === 0
                    ? 'No rate plans available'
                    : 'Select rate plan'}
                </option>
                {ratePlans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.rate_plan_name} — {property?.currency || 'ZAR'} {Number(p.total_for_stay).toLocaleString()} total
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select value={form.source} onChange={e => setField('source', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {[
                ['direct', 'Direct'], ['booking_com', 'Booking.com'], ['airbnb', 'Airbnb'],
                ['expedia', 'Expedia'], ['google', 'Google'], ['ota_internal', 'Other OTA'],
              ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Initial Status</label>
              <select value={form.status} onChange={e => setField('status', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {['provisional','confirmed'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
            <textarea value={form.special_requests} onChange={e => setField('special_requests', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        {/* Price Preview */}
        {(preview || previewLoading) && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
            {previewLoading ? (
              <div className="text-sm text-gray-400 text-center">Calculating…</div>
            ) : preview && (
              <>
                <h2 className="font-semibold text-gray-700 mb-3 text-sm">Price Breakdown</h2>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Accommodation</span>
                    <span className="font-medium">{Number(preview.total_for_stay).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {preview.meal_total > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Meals</span>
                      <span className="font-medium">{Number(preview.meal_total).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tax</span>
                    <span>{Number(preview.tax_amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="font-semibold text-primary">Total</span>
                    <span className="font-bold text-primary text-base">{Number(preview.total_amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {preview.season_name && (
                    <div className="text-xs text-amber-600 mt-1">* {preview.season_name} adjustment applied</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Guest Information</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              {k:'first_name',l:'First Name'},{k:'last_name',l:'Last Name'},
              {k:'email',l:'Email',t:'email'},{k:'phone',l:'Phone'},
              {k:'nationality',l:'Nationality'},{k:'id_number',l:'ID Number'},
            ].map(f => (
              <div key={f.k}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                <input type={f.t||'text'} value={form.guest[f.k]} onChange={e => setGuest(f.k, e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Type</label>
              <select value={form.guest.id_type} onChange={e => setGuest('id_type', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                {['passport','id_card','drivers_license'].map(t => <option key={t} value={t}>{t.replace('_',' ')}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="px-6 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-gold text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Booking'}
          </button>
        </div>
      </form>
    </div>
  );
}
