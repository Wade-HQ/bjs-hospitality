import React, { useState, useEffect } from 'react';
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

  if (loading) return <div className="p-12 text-center text-gray-400">Loading…</div>;
  if (!booking) return <div className="p-12 text-center text-gray-400">Not found</div>;

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
            {[['Room', b.room_number ? `Room ${b.room_number}` : '—'], ['Type', b.room_type_name],['Check-in', b.check_in],['Check-out', b.check_out],['Nights', b.nights],['Guests', `${b.adults}A ${b.children}C`]].map(([k,v]) => (
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
              ['Subtotal', `${b.currency} ${Number(b.subtotal).toLocaleString()}`],
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
    </div>
  );
}
