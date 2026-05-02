import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';

export default function Quotations() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { property } = useProperty();
  const [roomTypes, setRoomTypes] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    check_in: '', check_out: '', room_type_id: '', adults: 1, children: 0,
    rate_plan_id: '',
    guest_name: '', guest_email: '', guest_phone: '', special_requests: '',
  });

  useEffect(() => {
    api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || []));
  }, []);

  useEffect(() => {
    const { room_type_id, check_in, check_out, adults, children } = form;
    if (!room_type_id || !check_in || !check_out || !adults) {
      setRatePlans([]);
      setForm(p => ({ ...p, rate_plan_id: '' }));
      return;
    }
    const ci = new Date(check_in), co = new Date(check_out);
    if (co <= ci) return;
    const nights = Math.max(1, Math.round((co - ci) / 86400000));
    const params = new URLSearchParams({ room_type_id, check_in, adults, children: children || 0, nights });
    api.get(`/api/rates/calculate?${params}`)
      .then(r => {
        const plans = r.data?.rate_plans || [];
        setRatePlans(plans);
        if (plans.length === 1) setForm(p => ({ ...p, rate_plan_id: String(plans[0].id) }));
      })
      .catch(() => setRatePlans([]));
  }, [form.room_type_id, form.check_in, form.check_out, form.adults, form.children]);

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

  const generatePdf = async () => {
    if (!form.rate_plan_id || !form.check_in || !form.check_out) {
      addToast('Please complete stay details and select a rate plan', 'error');
      return;
    }
    setGenerating(true);
    try {
      const ci = new Date(form.check_in), co = new Date(form.check_out);
      const nights = Math.max(1, Math.round((co - ci) / 86400000));
      const response = await api.post('/api/quotations/pdf', {
        rate_plan_id: form.rate_plan_id,
        check_in: form.check_in,
        check_out: form.check_out,
        adults: form.adults,
        children: form.children || 0,
        guest_name: form.guest_name || null,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        special_requests: form.special_requests || null,
      }, { responseType: 'blob' });

      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation-${form.check_in}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Quotation PDF downloaded');
    } catch (e) {
      addToast(e.response?.data?.error || 'Error generating quotation', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const nights = (() => {
    if (!form.check_in || !form.check_out) return 0;
    const ci = new Date(form.check_in), co = new Date(form.check_out);
    return co > ci ? Math.round((co - ci) / 86400000) : 0;
  })();

  const currency = property?.currency || 'ZAR';

  return (
    <div className="max-w-3xl p-6">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-primary">New Quotation</h1>
        <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">No booking created</span>
      </div>

      <div className="space-y-6">
        {/* Stay Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Stay Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
              <input type="date" value={form.check_in} onChange={e => setField('check_in', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
              <input type="date" value={form.check_out} onChange={e => setField('check_out', e.target.value)}
                min={form.check_in || undefined}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
              <select value={form.room_type_id} onChange={e => setField('room_type_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select room type</option>
                {roomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
                <input type="number" min={1} value={form.adults} onChange={e => setField('adults', parseInt(e.target.value) || 1)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
                <input type="number" min={0} value={form.children} onChange={e => setField('children', parseInt(e.target.value) || 0)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rate Plan</label>
              <select value={form.rate_plan_id} onChange={e => setField('rate_plan_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">
                  {!form.room_type_id || !form.check_in || !form.check_out
                    ? 'Select room type and dates first'
                    : ratePlans.length === 0 ? 'No rate plans available' : 'Select rate plan'}
                </option>
                {ratePlans.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.rate_plan_name} — {currency} {Number(p.total_for_stay).toLocaleString()} total
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Price Preview */}
        {(preview || previewLoading) && (
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
            {previewLoading ? (
              <div className="text-sm text-gray-400 text-center">Calculating…</div>
            ) : preview && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-700 text-sm">Price Breakdown</h2>
                  {nights > 0 && <span className="text-xs text-gray-500">{nights} night{nights !== 1 ? 's' : ''}</span>}
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Accommodation</span>
                    <span className="font-medium">{currency} {Number(preview.total_for_stay).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {preview.meal_total > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Meals</span>
                      <span className="font-medium">{currency} {Number(preview.meal_total).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {preview.tax_amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">{property?.tax_label || 'Tax'}</span>
                      <span>{currency} {Number(preview.tax_amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-emerald-200 pt-1.5">
                    <span className="font-semibold text-primary">Total</span>
                    <span className="font-bold text-primary text-lg">{currency} {Number(preview.total_amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {preview.season_name && (
                    <div className="text-xs text-amber-600 mt-1">* {preview.season_name} pricing applied</div>
                  )}
                  {property?.quote_validity_days && (
                    <div className="text-xs text-gray-400 mt-1">Quote valid for {property.quote_validity_days} days</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Guest Info (optional) */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-1">Guest Information</h2>
          <p className="text-xs text-gray-400 mb-4">Optional — shown on the quotation PDF.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Name</label>
              <input type="text" value={form.guest_name} onChange={e => setField('guest_name', e.target.value)}
                placeholder="e.g. John Smith"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.guest_email} onChange={e => setField('guest_email', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" value={form.guest_phone} onChange={e => setField('guest_phone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
              <input type="text" value={form.special_requests} onChange={e => setField('special_requests', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)}
            className="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={generatePdf}
            disabled={generating || !form.rate_plan_id || !form.check_in || !form.check_out}
            className="px-6 py-2 bg-gold text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {generating ? 'Generating…' : '⬇ Download Quotation PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
