import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [pay, setPay] = useState({ amount:'', payment_method:'bank_transfer', payment_date: new Date().toISOString().slice(0,10), reference:'' });

  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editRoomTypes, setEditRoomTypes] = useState([]);
  const [editRooms, setEditRooms] = useState([]);
  const [editMealPackages, setEditMealPackages] = useState([]);
  const [editRatePlans, setEditRatePlans] = useState([]);
  const [editPreview, setEditPreview] = useState(null);
  const [editPreviewLoading, setEditPreviewLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');
  const [guestResults, setGuestResults] = useState([]);

  const load = () => { api.get(`/api/bookings/${id}`).then(r => setBooking(r.data)).finally(() => setLoading(false)); };
  useEffect(load, [id]);

  const updateStatus = async (status) => {
    setUpdating(true);
    try { await api.put(`/api/bookings/${id}`, { status }); addToast('Status updated'); load(); }
    catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
    finally { setUpdating(false); }
  };

  const addPayment = async () => {
    try {
      await api.post('/api/payments', { booking_id: id, ...pay });
      addToast('Payment recorded'); setPayModal(false); load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const downloadInvoice = async () => {
    try {
      const r = await api.post(`/api/invoices`, { booking_id: id, issued_to: 'guest' });
      const inv = r.data.invoice;
      const pdf = await api.get(`/api/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(pdf.data);
      const a = document.createElement('a'); a.href = url; a.download = `invoice-${inv.invoice_number}.pdf`; a.click();
    } catch (e) { addToast('Failed to generate invoice', 'error'); }
  };

  const openEditModal = () => {
    const b = booking.booking;
    setEditForm({
      check_in: b.check_in,
      check_out: b.check_out,
      room_type_id: String(b.room_type_id || ''),
      room_id: String(b.room_id || ''),
      adults: b.adults,
      children: b.children || 0,
      region: b.region || 'international',
      meal_package_id: b.meal_package_id ? String(b.meal_package_id) : '',
      rate_plan_id: b.rate_plan_id ? String(b.rate_plan_id) : '',
      guest_id: b.guest_id,
      guest_name: `${b.first_name} ${b.last_name}`,
      special_requests: b.special_requests || '',
      source: b.source || 'direct',
    });
    setGuestSearch('');
    setGuestResults([]);
    setEditPreview(null);
    setEditRatePlans([]);
    Promise.all([
      api.get('/api/room-types'),
      api.get('/api/meal-packages'),
    ]).then(([rtRes, mpRes]) => {
      setEditRoomTypes(rtRes.data?.room_types || []);
      setEditMealPackages(mpRes.data?.meal_packages || []);
    }).catch(() => addToast('Failed to load room options', 'error'));
    setEditModal(true);
  };

  const saveEdit = async () => {
    setUpdating(true);
    try {
      await api.put(`/api/bookings/${id}`, {
        check_in: editForm.check_in,
        check_out: editForm.check_out,
        room_type_id: editForm.room_type_id || null,
        room_id: editForm.room_id || null,
        adults: Number(editForm.adults),
        children: Number(editForm.children || 0),
        region: editForm.region,
        meal_package_id: editForm.meal_package_id || null,
        rate_plan_id: editForm.rate_plan_id || null,
        guest_id: editForm.guest_id,
        special_requests: editForm.special_requests || null,
        source: editForm.source,
      });
      addToast('Booking updated');
      setEditModal(false);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Error updating booking', 'error');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!editForm.room_type_id || !editModal) return;
    api.get('/api/rooms', { params: { room_type_id: editForm.room_type_id } })
      .then(r => setEditRooms(r.data?.rooms || []));
  }, [editForm.room_type_id, editModal]);

  // Load rate plans for edit modal when room_type + dates + pax are set
  useEffect(() => {
    if (!editModal || !editForm.room_type_id || !editForm.check_in || !editForm.check_out || !editForm.adults) {
      setEditRatePlans([]);
      return;
    }
    const ci = new Date(editForm.check_in), co = new Date(editForm.check_out);
    if (co <= ci) return;
    const nights = Math.max(1, Math.round((co - ci) / 86400000));
    const params = new URLSearchParams({
      room_type_id: editForm.room_type_id,
      check_in: editForm.check_in,
      adults: editForm.adults,
      children: editForm.children || 0,
      nights,
    });
    api.get(`/api/rates/calculate?${params}`)
      .then(r => setEditRatePlans(r.data?.rate_plans || []))
      .catch(() => setEditRatePlans([]));
  }, [editModal, editForm.room_type_id, editForm.check_in, editForm.check_out, editForm.adults, editForm.children]);

  useEffect(() => {
    if (!guestSearch.trim() || guestSearch.length < 2) { setGuestResults([]); return; }
    const timer = setTimeout(() => {
      api.get('/api/guests', { params: { search: guestSearch } })
        .then(r => setGuestResults((r.data?.guests || []).slice(0, 6)));
    }, 300);
    return () => clearTimeout(timer);
  }, [guestSearch]);

  useEffect(() => {
    const { rate_plan_id, room_type_id, region, check_in, check_out, adults, children, meal_package_id } = editForm;
    if (!check_in || !check_out || !adults || !editModal) { setEditPreview(null); return; }
    if (new Date(check_out) <= new Date(check_in)) { setEditPreview(null); return; }
    // Need either rate_plan_id or room_type_id for preview
    if (!rate_plan_id && !room_type_id) { setEditPreview(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setEditPreviewLoading(true);
      try {
        let params;
        if (rate_plan_id) {
          params = new URLSearchParams({ rate_plan_id, check_in, check_out, adults, children: children || 0 });
        } else {
          params = new URLSearchParams({ room_type_id, region: region || 'international', check_in, check_out, adults, children: children || 0 });
          if (meal_package_id) params.set('meal_package_id', meal_package_id);
        }
        const r = await api.get(`/api/bookings/price-preview?${params}`, { signal: controller.signal });
        setEditPreview(r.data);
      } catch (e) {
        if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') setEditPreview(null);
      } finally { setEditPreviewLoading(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [editForm.rate_plan_id, editForm.room_type_id, editForm.region, editForm.check_in, editForm.check_out, editForm.adults, editForm.children, editForm.meal_package_id, editModal]);

  if (loading) return <div className="p-12 text-center text-gray-400">Loading…</div>;
  if (!booking?.booking) return <div className="p-12 text-center text-gray-400">Not found</div>;

  // API returns { booking: {...}, payments: [...], invoices: [...], ... }
  const b = booking.booking;
  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <h1 className="text-2xl font-bold text-primary font-mono">{b.booking_ref}</h1>
        <StatusBadge status={b.status} />
        <StatusBadge status={b.payment_status} />
        <span className="text-xs text-gray-400 capitalize">{b.source}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-600 text-sm mb-3 uppercase tracking-wide">Stay</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Room', b.room_number ? `Room ${b.room_number}` : '—'],
              ['Type', b.room_type_name],
              ...(b.rate_plan_id ? [['Rate Plan', b.rate_plan_name || `#${b.rate_plan_id}`]] : [['Region', b.region ? (b.region === 'sadc' ? 'SADC' : 'International') : '—']]),
              ['Check-in', b.check_in],
              ['Check-out', b.check_out],
              ['Nights', b.nights],
              ['Guests', `${b.adults}A ${b.children}C`],
            ].map(([k,v]) => (
              <div key={k} className="flex justify-between"><dt className="text-gray-400">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-600 text-sm mb-3 uppercase tracking-wide">Guest</h2>
          <Link to={`/dashboard/guests/${b.guest_id}`} className="text-teal font-medium hover:underline block mb-2">{b.first_name} {b.last_name}</Link>
          <dl className="space-y-1 text-sm">
            {[['Email', b.guest_email||'—'],['Phone', b.guest_phone||'—']].map(([k,v]) => (
              <div key={k} className="flex justify-between"><dt className="text-gray-400">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-600 text-sm mb-3 uppercase tracking-wide">Financials</h2>
          <dl className="space-y-1 text-sm">
            {[
              ['Rate/night', `${b.currency} ${Number(b.room_rate).toLocaleString()}`],
              ['Subtotal (acc.)', `${b.currency} ${Number(b.subtotal - (b.meal_total || 0)).toLocaleString()}`],
              ...(b.meal_total > 0 ? [['Meals', `${b.currency} ${Number(b.meal_total).toLocaleString()}`]] : []),
              ['Tax', `${b.currency} ${Number(b.tax_amount).toLocaleString()}`],
              ['Total', `${b.currency} ${Number(b.total_amount).toLocaleString()}`],
            ].map(([k,v]) => (
              <div key={k} className="flex justify-between"><dt className="text-gray-400">{k}</dt><dd className="font-medium">{v}</dd></div>
            ))}
          </dl>
        </div>
      </div>

      {b.special_requests && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm">
          <strong className="text-amber-700">Requests: </strong>{b.special_requests}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        {b.status === 'provisional' && <button onClick={() => updateStatus('confirmed')} disabled={updating} className="bg-teal text-white px-4 py-2 rounded-lg text-sm font-medium">Confirm</button>}
        {b.status === 'confirmed' && <button onClick={() => updateStatus('checked_in')} disabled={updating} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Check In</button>}
        {b.status === 'checked_in' && <button onClick={() => updateStatus('checked_out')} disabled={updating} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium">Check Out</button>}
        {['provisional','confirmed'].includes(b.status) && <button onClick={() => updateStatus('cancelled')} disabled={updating} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium">Cancel</button>}
        <button onClick={() => setPayModal(true)} className="bg-gold text-white px-4 py-2 rounded-lg text-sm font-medium">+ Payment</button>
        <button onClick={downloadInvoice} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Invoice PDF</button>
        <button onClick={openEditModal} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Edit Booking</button>
      </div>

      {booking.payments?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <h2 className="font-semibold text-gray-700 p-4 border-b border-gray-100">Payments</h2>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>{['Date','Amount','Method','Reference'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {booking.payments.map(p => (
                <tr key={p.id}><td className="px-4 py-3">{p.payment_date}</td><td className="px-4 py-3 font-medium">{p.currency} {Number(p.amount).toLocaleString()}</td><td className="px-4 py-3">{p.payment_method}</td><td className="px-4 py-3 text-gray-500">{p.reference||'—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Record Payment">
        <div className="space-y-4">
          {[{label:'Amount',type:'number',key:'amount'},{label:'Date',type:'date',key:'payment_date'},{label:'Reference',type:'text',key:'reference'}].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
              <input type={f.type} value={pay[f.key]} onChange={e => setPay(p=>({...p,[f.key]:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
            <select value={pay.payment_method} onChange={e => setPay(p=>({...p,payment_method:e.target.value}))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['cash','card','bank_transfer','eft'].map(m => <option key={m} value={m}>{m.replace('_',' ')}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setPayModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={addPayment} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Booking">
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* Guest */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Guest</label>
            <div className="flex items-center gap-2 mb-1 text-sm">
              <span className="font-medium text-teal-600">{editForm.guest_name}</span>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={() => setGuestSearch('')} className="text-xs text-gray-400 hover:text-gray-600">Change guest</button>
            </div>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={guestSearch}
              onChange={e => setGuestSearch(e.target.value)}
              onBlur={() => setTimeout(() => setGuestResults([]), 150)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            {guestResults.length > 0 && (
              <div className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1">
                {guestResults.map(g => (
                  <div key={g.id}
                    className="px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm flex items-center justify-between"
                    onClick={() => {
                      setEditForm(p => ({ ...p, guest_id: g.id, guest_name: `${g.first_name} ${g.last_name}` }));
                      setGuestSearch('');
                      setGuestResults([]);
                    }}
                  >
                    <span>{g.first_name} {g.last_name}</span>
                    {g.email && <span className="text-gray-400 text-xs">{g.email}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            {[{k:'check_in',l:'Check-in'},{k:'check_out',l:'Check-out'}].map(f => (
              <div key={f.k}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label>
                <input type="date" value={editForm[f.k] || ''} onChange={e => setEditForm(p => ({...p, [f.k]: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
          </div>

          {/* Legacy pricing fields — shown only for bookings without a rate plan */}
          {!editForm.rate_plan_id && (
            <>
              {/* Region */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                <select value={editForm.region || 'international'} onChange={e => setEditForm(p => ({...p, region: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="international">International</option>
                  <option value="sadc">SADC</option>
                </select>
              </div>
            </>
          )}

          {/* Room Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room Type</label>
            <select value={editForm.room_type_id || ''} onChange={e => setEditForm(p => ({...p, room_type_id: e.target.value, room_id: ''}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select room type</option>
              {editRoomTypes.map(rt => <option key={rt.id} value={rt.id}>{rt.name}</option>)}
            </select>
          </div>

          {/* Room */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
            <select value={editForm.room_id || ''} onChange={e => setEditForm(p => ({...p, room_id: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Keep current / auto-assign</option>
              {editRooms.map(r => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
            </select>
          </div>

          {/* Adults + Children */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adults</label>
              <input type="number" min={1} value={editForm.adults || 1} onChange={e => setEditForm(p => ({...p, adults: parseInt(e.target.value)}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Children</label>
              <input type="number" min={0} value={editForm.children || 0} onChange={e => setEditForm(p => ({...p, children: parseInt(e.target.value)}))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Legacy pricing fields — meal package shown only for bookings without a rate plan */}
          {!editForm.rate_plan_id && (
            <>
              {/* Meal Package */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Meal Package</label>
                <select value={editForm.meal_package_id || ''} onChange={e => setEditForm(p => ({...p, meal_package_id: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Room Only</option>
                  {editMealPackages.map(mp => <option key={mp.id} value={mp.id}>{mp.name}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Rate Plan */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rate Plan</label>
            <select value={editForm.rate_plan_id || ''} onChange={e => setEditForm(p => ({...p, rate_plan_id: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">— Keep existing —</option>
              {editRatePlans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.rate_plan_name} — ZAR {Number(p.total_for_stay).toLocaleString()} total
                </option>
              ))}
            </select>
            {editForm.rate_plan_id && (
              <p className="text-xs text-gray-400 mt-1">Price recalculated from selected rate plan</p>
            )}
          </div>

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <select value={editForm.source || 'direct'} onChange={e => setEditForm(p => ({...p, source: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {[['direct','Direct'],['booking_com','Booking.com'],['airbnb','Airbnb'],['expedia','Expedia'],['google','Google'],['ota_internal','Other OTA']].map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Special Requests */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
            <textarea rows={2} value={editForm.special_requests || ''} onChange={e => setEditForm(p => ({...p, special_requests: e.target.value}))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Price Preview */}
          {(editPreview || editPreviewLoading) && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
              {editPreviewLoading ? (
                <div className="text-sm text-gray-400 text-center animate-pulse">Calculating…</div>
              ) : editPreview && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Accommodation</span><span>{editPreview.accommodation_subtotal?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  {editPreview.meal_total > 0 && <div className="flex justify-between"><span className="text-gray-500">Meals</span><span>{editPreview.meal_total?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{editPreview.tax_amount?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-primary">
                    <span>New Total</span>
                    <span>{editPreview.total_amount?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveEdit} disabled={updating} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {updating ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
