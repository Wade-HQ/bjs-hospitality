import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

const STATUS_TRANSITIONS = {
  provisional: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

const PAYMENT_METHODS = ['bank_transfer', 'card', 'cash', 'eft', 'other'];

export default function BookingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [addPaymentModal, setAddPaymentModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: '', method: 'bank_transfer', reference: '', paid_at: '', notes: '' });
  const [submittingPay, setSubmittingPay] = useState(false);

  const [generateInvModal, setGenerateInvModal] = useState(false);
  const [generatingInv, setGeneratingInv] = useState(false);

  const [changingStatus, setChangingStatus] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notes, setNotes] = useState('');

  const fetchBooking = async () => {
    try {
      const res = await api.get(`/api/bookings/${id}`);
      const data = res.data;
      setBooking(data);
      setNotes(data.internal_notes || '');
    } catch (err) {
      setError(err.response?.status === 404 ? 'Booking not found.' : 'Failed to load booking.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBooking(); }, [id]);

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const fmtShort = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtCurrency = (n, currency) => n != null ? `${currency || 'ZAR'} ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—';
  const timeAgo = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const handleStatusChange = async (newStatus) => {
    setChangingStatus(true);
    try {
      await api.put(`/api/bookings/${id}/status`, { status: newStatus });
      addToast(`Status updated to ${newStatus.replace(/_/g, ' ')}`, 'success');
      fetchBooking();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update status', 'error');
    } finally {
      setChangingStatus(false);
    }
  };

  const handleAddPayment = async () => {
    setSubmittingPay(true);
    try {
      await api.post(`/api/bookings/${id}/payments`, payForm);
      addToast('Payment recorded', 'success');
      setAddPaymentModal(false);
      setPayForm({ amount: '', method: 'bank_transfer', reference: '', paid_at: '', notes: '' });
      fetchBooking();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to record payment', 'error');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setGeneratingInv(true);
    try {
      await api.post(`/api/bookings/${id}/invoices`);
      addToast('Invoice generated', 'success');
      setGenerateInvModal(false);
      fetchBooking();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to generate invoice', 'error');
    } finally {
      setGeneratingInv(false);
    }
  };

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    try {
      await api.put(`/api/bookings/${id}/notes`, { internal_notes: notes });
      addToast('Notes saved', 'success');
    } catch (_) {
      addToast('Failed to save notes', 'error');
    } finally {
      setNotesSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-32 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-4 bg-gray-100 rounded w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-lg">
        <p className="text-red-700">{error || 'Booking not found'}</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-teal hover:underline text-sm block mx-auto">Go back</button>
      </div>
    );
  }

  const transitions = STATUS_TRANSITIONS[booking.status] || [];
  const nights = booking.check_in && booking.check_out
    ? Math.ceil((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000)
    : null;
  const totalPaid = booking.payments?.reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
  const balance = Number(booking.total_amount || 0) - totalPaid;

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/dashboard/bookings" className="hover:text-primary transition-colors">Bookings</Link>
        <span>/</span>
        <span className="text-primary font-medium">{booking.booking_ref}</span>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-primary px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-white/60 text-xs mb-1">Booking Reference</p>
            <p className="text-gold font-bold text-2xl">{booking.booking_ref}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={booking.status} />
            <StatusBadge status={booking.payment_status} />
          </div>
        </div>
        <div className="p-6 grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1">PROPERTY</p>
            <p className="font-semibold text-primary">{booking.property_name}</p>
            <p className="text-gray-500 text-sm">{booking.room_type_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1">STAY</p>
            <p className="text-primary text-sm">{fmt(booking.check_in)}</p>
            <p className="text-gray-400 text-xs">to</p>
            <p className="text-primary text-sm">{fmt(booking.check_out)}</p>
            {nights && <p className="text-gray-500 text-xs mt-0.5">{nights} night{nights !== 1 ? 's' : ''}</p>}
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1">SOURCE</p>
            <p className="text-primary capitalize">{booking.source || '—'}</p>
            <p className="text-gray-400 text-xs mt-1">Created {fmtShort(booking.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Guest Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-primary mb-4">Guest Information</h2>
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          {[
            ['Name', [booking.first_name, booking.last_name].filter(Boolean).join(' ')],
            ['Email', booking.email],
            ['Phone', booking.phone],
            ['Nationality', booking.nationality],
            ['Adults', booking.adults],
            ['Children', booking.children],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between border-b border-gray-50 pb-2">
              <span className="text-gray-400">{label}</span>
              <span className="font-medium text-primary">{val || '—'}</span>
            </div>
          ))}
        </div>
        {booking.special_requests && (
          <div className="mt-4 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
            <span className="font-medium">Special Requests: </span>{booking.special_requests}
          </div>
        )}
      </div>

      {/* Financial */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-primary mb-4">Financial Summary</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { label: 'Total Amount', value: fmtCurrency(booking.total_amount, booking.currency), color: 'text-primary' },
            { label: 'Total Paid', value: fmtCurrency(totalPaid, booking.currency), color: 'text-green-600' },
            { label: 'Balance Due', value: fmtCurrency(balance, booking.currency), color: balance > 0 ? 'text-red-600' : 'text-green-600' },
          ].map(card => (
            <div key={card.label} className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
        {booking.commission_rate && (
          <p className="text-xs text-gray-400 mt-3">Commission rate: {booking.commission_rate}%</p>
        )}
      </div>

      {/* Payments */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-primary">Payments</h2>
          <button
            onClick={() => setAddPaymentModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            + Add Payment
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {!booking.payments?.length ? (
            <div className="px-6 py-6 text-center text-gray-400 text-sm">No payments recorded</div>
          ) : (
            booking.payments.map(p => (
              <div key={p.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-primary">{fmtCurrency(p.amount, booking.currency)}</p>
                  <p className="text-xs text-gray-400">{(p.method || '').replace(/_/g, ' ')} · {fmtShort(p.paid_at || p.created_at)}</p>
                </div>
                <div className="text-right">
                  {p.reference && <p className="text-xs text-gray-500">Ref: {p.reference}</p>}
                  {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-primary">Invoices</h2>
          <button
            onClick={() => setGenerateInvModal(true)}
            className="bg-teal hover:bg-teal/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Generate Invoice
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {!booking.invoices?.length ? (
            <div className="px-6 py-6 text-center text-gray-400 text-sm">No invoices generated</div>
          ) : (
            booking.invoices.map(inv => (
              <div key={inv.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-primary">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-400">{fmtShort(inv.created_at)} · {fmtCurrency(inv.amount, booking.currency)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={inv.status} />
                  {inv.pdf_url && (
                    <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline text-xs">
                      Download PDF
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Commission */}
      {booking.commission && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-primary mb-4">Commission Record</h2>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            {[
              ['Amount', fmtCurrency(booking.commission.amount, booking.currency)],
              ['Rate', `${booking.commission.rate}%`],
              ['Due Date', fmtShort(booking.commission.due_date)],
              ['Status', null],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                {label === 'Status'
                  ? <StatusBadge status={booking.commission.status} />
                  : <p className="font-medium text-primary">{val}</p>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Change */}
      {transitions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-primary mb-3">Update Status</h2>
          <div className="flex flex-wrap gap-3">
            {transitions.map(status => {
              const colors = {
                confirmed: 'bg-blue-600 hover:bg-blue-700',
                checked_in: 'bg-green-600 hover:bg-green-700',
                checked_out: 'bg-gray-600 hover:bg-gray-700',
                cancelled: 'bg-red-600 hover:bg-red-700',
                no_show: 'bg-orange-600 hover:bg-orange-700',
              };
              return (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  disabled={changingStatus}
                  className={`${colors[status] || 'bg-primary hover:bg-primary/90'} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 capitalize`}
                >
                  {status.replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Internal Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-primary mb-3">Internal Notes</h2>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={handleSaveNotes}
          placeholder="Add internal notes about this booking..."
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal resize-none"
        />
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-gray-400">Notes auto-save when you click away</p>
          <button onClick={handleSaveNotes} disabled={notesSaving} className="text-xs text-teal hover:underline">
            {notesSaving ? 'Saving...' : 'Save now'}
          </button>
        </div>
      </div>

      {/* Audit Log */}
      {booking.audit_log?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-primary">Audit Log</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {booking.audit_log.map((entry, i) => (
              <div key={i} className="px-6 py-3 flex items-start gap-3 text-sm">
                <span className="text-gray-300 font-mono text-xs mt-0.5 w-20 flex-shrink-0">{timeAgo(entry.created_at)}</span>
                <div>
                  <p className="text-primary">{entry.action}</p>
                  {entry.user_name && <p className="text-xs text-gray-400">by {entry.user_name}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
      <Modal open={addPaymentModal} onClose={() => setAddPaymentModal(false)} title="Record Payment">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">AMOUNT ({booking.currency || 'ZAR'})</label>
            <input
              type="number" min="0" step="0.01"
              value={payForm.amount}
              onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">PAYMENT METHOD</label>
            <select
              value={payForm.method}
              onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            >
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">REFERENCE</label>
            <input
              type="text"
              value={payForm.reference}
              onChange={e => setPayForm(f => ({ ...f, reference: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              placeholder="Bank transfer ref..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">PAYMENT DATE</label>
            <input
              type="date"
              value={payForm.paid_at}
              onChange={e => setPayForm(f => ({ ...f, paid_at: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">NOTES</label>
            <textarea
              rows={2}
              value={payForm.notes}
              onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setAddPaymentModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={handleAddPayment}
              disabled={submittingPay || !payForm.amount}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {submittingPay ? 'Saving...' : 'Record Payment'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Generate Invoice Modal */}
      <Modal open={generateInvModal} onClose={() => setGenerateInvModal(false)} title="Generate Invoice">
        <div className="space-y-4">
          <p className="text-gray-600 text-sm">
            Generate an invoice for booking <strong className="text-primary">{booking.booking_ref}</strong> totalling{' '}
            <strong className="text-primary">{fmtCurrency(booking.total_amount, booking.currency)}</strong>.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setGenerateInvModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={handleGenerateInvoice}
              disabled={generatingInv}
              className="flex-1 bg-teal hover:bg-teal/90 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {generatingInv ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
