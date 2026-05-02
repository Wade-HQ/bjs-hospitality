import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';

function fmt(n, curr) {
  return `${curr || ''} ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`.trim();
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + (s.length === 10 ? 'T00:00:00Z' : ''));
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function Quotations() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { property } = useProperty();
  const [roomTypes, setRoomTypes] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quotations, setQuotations] = useState([]);
  const [converting, setConverting] = useState(null);
  const [form, setForm] = useState({
    check_in: '', check_out: '', room_type_id: '', adults: 1, children: 0,
    rate_plan_id: '', region: 'sadc',
    guest_name: '', guest_email: '', guest_phone: '', special_requests: '',
  });
  const [rateErrors, setRateErrors] = useState([]);

  const currency = property?.currency || 'ZAR';

  const loadQuotations = useCallback(() => {
    api.get('/api/quotations').then(r => setQuotations(r.data?.quotations || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || []));
    loadQuotations();
  }, [loadQuotations]);

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
    const params = new URLSearchParams({ room_type_id, check_in, adults, children: children || 0, nights, region: form.region || 'sadc' });
    api.get(`/api/rates/calculate?${params}`)
      .then(r => {
        const plans = r.data?.rate_plans || [];
        setRatePlans(plans);
        setRateErrors(r.data?.calc_errors || []);
        if (plans.length === 1) setForm(p => ({ ...p, rate_plan_id: String(plans[0].id) }));
      })
      .catch(() => { setRatePlans([]); setRateErrors([]); });
  }, [form.room_type_id, form.check_in, form.check_out, form.adults, form.children, form.region]);

  useEffect(() => {
    const { rate_plan_id, check_in, check_out, adults, children } = form;
    if (!rate_plan_id || !check_in || !check_out || !adults) { setPreview(null); return; }
    const ci = new Date(check_in), co = new Date(check_out);
    if (co <= ci) { setPreview(null); return; }
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({ rate_plan_id, check_in, check_out, adults, children: children || 0, region: form.region || 'sadc' });
        const r = await api.get(`/api/bookings/price-preview?${params}`);
        setPreview(r.data);
      } catch { setPreview(null); }
      finally { setPreviewLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [form.rate_plan_id, form.check_in, form.check_out, form.adults, form.children]);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const saveAndDownload = async () => {
    if (!form.rate_plan_id || !form.check_in || !form.check_out) {
      addToast('Please complete stay details and select a rate plan', 'error');
      return;
    }
    setSaving(true);
    try {
      // Save quotation
      const saved = await api.post('/api/quotations', {
        rate_plan_id: form.rate_plan_id,
        check_in: form.check_in,
        check_out: form.check_out,
        adults: form.adults,
        children: form.children || 0,
        region: form.region || 'sadc',
        guest_name: form.guest_name || null,
        guest_email: form.guest_email || null,
        guest_phone: form.guest_phone || null,
        special_requests: form.special_requests || null,
      });

      // Download PDF
      const pdfResp = await api.get(`/api/quotations/${saved.data.quotation.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([pdfResp.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation-${saved.data.quotation.quote_ref}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      addToast(`Quotation ${saved.data.quotation.quote_ref} saved & downloaded`);
      loadQuotations();
      // Reset form
      setForm({ check_in: '', check_out: '', room_type_id: '', adults: 1, children: 0, rate_plan_id: '', guest_name: '', guest_email: '', guest_phone: '', special_requests: '' });
      setPreview(null);
    } catch (e) {
      addToast(e.response?.data?.error || 'Error generating quotation', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadExisting = async (q) => {
    try {
      const resp = await api.get(`/api/quotations/${q.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotation-${q.quote_ref}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      addToast('Error downloading PDF', 'error');
    }
  };

  const convertToBooking = async (q) => {
    setConverting(q.id);
    try {
      const r = await api.post(`/api/quotations/${q.id}/convert`);
      addToast(`Booking created: ${r.data.booking_ref}`);
      loadQuotations();
      navigate(`/dashboard/bookings/${r.data.booking_id}`);
    } catch (e) {
      addToast(e.response?.data?.error || 'Error converting quotation', 'error');
      setConverting(null);
    }
  };

  const cancelQuote = async (q) => {
    try {
      await api.delete(`/api/quotations/${q.id}`);
      addToast('Quotation cancelled');
      loadQuotations();
    } catch {
      addToast('Error cancelling quotation', 'error');
    }
  };

  const nights = (() => {
    if (!form.check_in || !form.check_out) return 0;
    const ci = new Date(form.check_in), co = new Date(form.check_out);
    return co > ci ? Math.round((co - ci) / 86400000) : 0;
  })();

  const isExpired = (q) => q.valid_until && new Date(q.valid_until) < new Date();

  return (
    <div className="p-6 max-w-4xl space-y-8">
      {/* ── New Quotation Form ── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <h1 className="text-2xl font-bold text-primary">Quotations</h1>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">No booking created</span>
        </div>

        <div className="space-y-5">
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
                  <input type="number" min={1} value={form.adults}
                    onChange={e => setField('adults', parseInt(e.target.value) || 1)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
                  <input type="number" min={0} value={form.children}
                    onChange={e => setField('children', parseInt(e.target.value) || 0)}
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
                      <span className="font-medium">{fmt(preview.subtotal, currency)}</span>
                    </div>
                    {preview.meal_total > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Meals</span>
                        <span className="font-medium">{fmt(preview.meal_total, currency)}</span>
                      </div>
                    )}
                    {preview.tax_inclusive === 0 && preview.tax_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">+ {property?.tax_label || 'VAT'}</span>
                        <span>{fmt(preview.tax_amount, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-emerald-200 pt-1.5">
                      <span className="font-semibold text-primary">Total</span>
                      <span className="font-bold text-primary text-lg">{fmt(preview.total_amount, currency)}</span>
                    </div>
                    {preview.tax_inclusive === 1 && preview.tax_amount > 0 && (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>of which {property?.tax_label || 'VAT'}</span>
                        <span>{fmt(preview.tax_amount, currency)}</span>
                      </div>
                    )}
                    {preview.season_name && (
                      <div className="text-xs text-amber-600">* {preview.season_name} pricing applied</div>
                    )}
                    {property?.quote_validity_days && (
                      <div className="text-xs text-gray-400">Quote valid for {property.quote_validity_days} days</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Guest Info */}
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
              onClick={saveAndDownload}
              disabled={saving || !form.rate_plan_id || !form.check_in || !form.check_out}
              className="px-6 py-2 bg-gold text-white rounded-lg font-medium text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving ? 'Saving…' : '⬇ Save & Download PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Saved Quotations List ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-primary">Open Quotations</h2>
          <button onClick={loadQuotations} className="text-xs text-gray-400 hover:text-gray-600">↻ Refresh</button>
        </div>

        {quotations.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-6 py-10 text-center text-gray-400 text-sm">
            No open quotations. Create one above.
          </div>
        ) : (
          <div className="space-y-3">
            {quotations.map(q => {
              const expired = isExpired(q);
              return (
                <div key={q.id} className={`bg-white rounded-xl border p-4 ${expired ? 'border-red-200 bg-red-50/30' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800 text-sm">{q.quote_ref}</span>
                        {q.guest_name && (
                          <span className="text-sm text-gray-600">— {q.guest_name}</span>
                        )}
                        {expired && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">Expired</span>
                        )}
                        {!expired && q.valid_until && (
                          <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Valid until {fmtDate(q.valid_until)}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mt-1.5">
                        <span>📅 {fmtDate(q.check_in)} → {fmtDate(q.check_out)} ({q.nights} night{q.nights !== 1 ? 's' : ''})</span>
                        <span>🛏 {q.room_type_name}</span>
                        <span>👥 {q.adults} adult{q.adults !== 1 ? 's' : ''}{q.children > 0 ? ` + ${q.children} children` : ''}</span>
                        <span className="font-medium text-primary">{fmt(q.total_amount, q.currency)}</span>
                      </div>
                      {q.rate_plan_name && (
                        <div className="text-xs text-gray-400 mt-0.5">{q.rate_plan_name}</div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => downloadExisting(q)}
                        className="text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                        PDF
                      </button>
                      <button
                        onClick={() => convertToBooking(q)}
                        disabled={converting === q.id}
                        className="text-xs border border-emerald-200 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 disabled:opacity-50">
                        {converting === q.id ? 'Converting…' : '✓ Accept → Booking'}
                      </button>
                      <button
                        onClick={() => cancelQuote(q)}
                        className="text-xs border border-red-200 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
