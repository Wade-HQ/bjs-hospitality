import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Table from '../../components/Table.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

const SOURCES = ['', 'direct', 'airbnb', 'booking.com', 'expedia', 'google', 'agent', 'other'];
const STATUSES = ['', 'provisional', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
const PAY_STATUSES = ['', 'unpaid', 'deposit_paid', 'fully_paid'];

function exportCSV(data) {
  const headers = ['Ref', 'Guest', 'Property', 'Room', 'Check-in', 'Check-out', 'Status', 'Payment', 'Amount', 'Source'];
  const rows = data.map(b => [
    b.booking_ref,
    `${b.first_name || ''} ${b.last_name || ''}`.trim(),
    b.property_name,
    b.room_type_name,
    b.check_in,
    b.check_out,
    b.status,
    b.payment_status,
    b.total_amount,
    b.source,
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Bookings() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [bookings, setBookings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [filters, setFilters] = useState({
    property_id: '', status: '', payment_status: '', source: '',
    date_from: '', date_to: '', search: '',
  });
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api.get('/api/properties').then(res => setProperties(res.data || [])).catch(() => {});
  }, []);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await api.get(`/api/bookings?${params}`);
      const data = res.data;
      setBookings(data.bookings || data || []);
      setTotal(data.total || (data.bookings || data || []).length);
    } catch (_) {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleFilterChange = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  const handleCancel = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      await api.put(`/api/bookings/${cancelModal.id}/cancel`);
      addToast('Booking cancelled', 'success');
      setCancelModal(null);
      fetchBookings();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to cancel booking', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtCurrency = (n, currency) => n != null ? `${currency || 'ZAR'} ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—';

  const columns = [
    { key: 'booking_ref', label: 'Reference' },
    { key: 'guest', label: 'Guest', render: (_, row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—' },
    { key: 'property_name', label: 'Property' },
    { key: 'room_type_name', label: 'Room' },
    { key: 'check_in', label: 'Check-in', render: (v) => fmt(v) },
    { key: 'check_out', label: 'Check-out', render: (v) => fmt(v) },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'payment_status', label: 'Payment', render: (v) => <StatusBadge status={v} /> },
    { key: 'total_amount', label: 'Amount', render: (v, row) => fmtCurrency(v, row.currency) },
    { key: 'source', label: 'Source', render: (v) => v ? <span className="capitalize text-xs bg-slate-100 px-2 py-0.5 rounded">{v}</span> : '—' },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/dashboard/bookings/${row.id}`)}
            className="bg-teal/10 hover:bg-teal/20 text-teal text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
          >
            View
          </button>
          {row.status !== 'cancelled' && row.status !== 'checked_out' && (
            <button
              onClick={() => setCancelModal(row)}
              className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <input
            type="text"
            placeholder="Search guest, ref..."
            value={filters.search}
            onChange={e => handleFilterChange('search', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
          <select
            value={filters.property_id}
            onChange={e => handleFilterChange('property_id', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          >
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filters.status}
            onChange={e => handleFilterChange('status', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          >
            {STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All Statuses'}</option>)}
          </select>
          <select
            value={filters.payment_status}
            onChange={e => handleFilterChange('payment_status', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          >
            {PAY_STATUSES.map(s => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All Payment'}</option>)}
          </select>
          <select
            value={filters.source}
            onChange={e => handleFilterChange('source', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          >
            {SOURCES.map(s => <option key={s} value={s}>{s || 'All Sources'}</option>)}
          </select>
          <div className="flex gap-2">
            <button
              onClick={() => { setFilters({ property_id: '', status: '', payment_status: '', source: '', date_from: '', date_to: '', search: '' }); setPage(1); }}
              className="flex-1 border border-gray-300 text-gray-600 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => exportCSV(bookings)}
              className="flex-1 bg-primary text-white rounded-lg px-3 py-2 text-sm hover:bg-primary/90 transition-colors"
            >
              Export
            </button>
          </div>
        </div>
        <div className="flex gap-3 mt-3">
          <input
            type="date"
            value={filters.date_from}
            onChange={e => handleFilterChange('date_from', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
          <span className="flex items-center text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={filters.date_to}
            onChange={e => handleFilterChange('date_to', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{total} booking{total !== 1 ? 's' : ''} found</p>
      </div>

      <Table columns={columns} data={bookings} loading={loading} />
      <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />

      <Modal open={!!cancelModal} onClose={() => setCancelModal(null)} title="Cancel Booking">
        {cancelModal && (
          <div className="space-y-4">
            <p className="text-gray-600 text-sm">
              Are you sure you want to cancel booking <strong className="text-primary">{cancelModal.booking_ref}</strong> for{' '}
              <strong className="text-primary">{[cancelModal.first_name, cancelModal.last_name].filter(Boolean).join(' ')}</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
              This action cannot be undone. The guest will need to be notified manually.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCancelModal(null)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Keep Booking
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
