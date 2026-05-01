import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Table from '../../components/Table.jsx';

const STATUS_OPTIONS = ['', 'provisional', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
const PAYMENT_OPTIONS = ['', 'unpaid', 'deposit_paid', 'fully_paid'];
const SOURCE_OPTIONS = ['', 'direct', 'ota_internal', 'booking_com', 'airbnb', 'expedia', 'google'];

export default function Bookings() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { property } = useProperty();

  const [bookings, setBookings] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const [filters, setFilters] = useState({
    status: '',
    payment_status: '',
    room_type: '',
    source: '',
    from: '',
    to: '',
    search: '',
  });

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await api.get(`/api/bookings?${params.toString()}`);
      setBookings(res.data?.bookings || []);
    } catch (err) {
      addToast('Failed to load bookings', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    api.get('/api/room-types').then(res => setRoomTypes(res.data?.room_types || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ status: '', payment_status: '', room_type: '', source: '', from: '', to: '', search: '' });
  };

  const handleCheckIn = async (id, e) => {
    e.stopPropagation();
    setActionLoading(prev => ({ ...prev, [id]: 'checkin' }));
    try {
      await api.post(`/api/bookings/${id}/check-in`);
      addToast('Checked in');
      fetchBookings();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }));
    }
  };

  const handleCheckOut = async (id, e) => {
    e.stopPropagation();
    setActionLoading(prev => ({ ...prev, [id]: 'checkout' }));
    try {
      await api.post(`/api/bookings/${id}/check-out`);
      addToast('Checked out');
      fetchBookings();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }));
    }
  };

  const handleCancel = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Cancel this booking?')) return;
    setActionLoading(prev => ({ ...prev, [id]: 'cancel' }));
    try {
      await api.post(`/api/bookings/${id}/cancel`);
      addToast('Booking cancelled');
      fetchBookings();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: null }));
    }
  };

  const exportCSV = () => {
    const headers = ['ID', 'Guest', 'Room', 'Check In', 'Check Out', 'Nights', 'Status', 'Payment', 'Total', 'Balance'];
    const rows = bookings.map(b => [
      b.id, b.guest_name, b.room_number || b.room_name,
      b.check_in?.slice(0, 10), b.check_out?.slice(0, 10),
      b.nights, b.status, b.payment_status,
      b.total_amount, b.balance_due,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currency = property?.currency || 'ZAR';
  const fmt = (n) => Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const columns = [
    { key: 'id', label: 'Ref', render: (v) => <span className="font-mono text-xs text-gray-500">#{v}</span> },
    { key: 'guest_name', label: 'Guest', render: (v) => <span className="font-medium text-primary">{v}</span> },
    { key: 'room_number', label: 'Room', render: (v, row) => v || row.room_name || '—' },
    { key: 'check_in', label: 'Check In', render: (v) => v?.slice(0, 10) || '—' },
    { key: 'check_out', label: 'Check Out', render: (v) => v?.slice(0, 10) || '—' },
    { key: 'nights', label: 'Nights' },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'payment_status', label: 'Payment', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'total_amount', label: 'Total',
      render: (v) => <span className="font-medium">{currency} {fmt(v)}</span>
    },
    {
      key: 'balance_due', label: 'Balance',
      render: (v) => (
        <span className={Number(v) > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
          {currency} {fmt(v)}
        </span>
      )
    },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/dashboard/bookings/${row.id}`)}
            className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/80 transition-colors"
          >
            View
          </button>
          {(row.status === 'confirmed' || row.status === 'provisional') && (
            <button
              onClick={(e) => handleCheckIn(row.id, e)}
              disabled={actionLoading[row.id] === 'checkin'}
              className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              CI
            </button>
          )}
          {row.status === 'checked_in' && (
            <button
              onClick={(e) => handleCheckOut(row.id, e)}
              disabled={actionLoading[row.id] === 'checkout'}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              CO
            </button>
          )}
          {row.status !== 'cancelled' && row.status !== 'checked_out' && (
            <button
              onClick={(e) => handleCancel(row.id, e)}
              disabled={actionLoading[row.id] === 'cancel'}
              className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">Bookings</h1>
          <p className="text-sm text-gray-500">{bookings.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => navigate('/dashboard/bookings/new')}
            className="px-4 py-2 text-sm bg-gold text-white rounded-lg font-medium hover:bg-gold/90 transition-colors"
          >
            + New Booking
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <input
            type="text"
            placeholder="Search guest, room..."
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
            className="col-span-2 sm:col-span-3 lg:col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          />
          <select
            value={filters.status}
            onChange={e => setFilter('status', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            value={filters.payment_status}
            onChange={e => setFilter('payment_status', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          >
            <option value="">All Payments</option>
            {PAYMENT_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            value={filters.room_type}
            onChange={e => setFilter('room_type', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          >
            <option value="">All Room Types</option>
            {roomTypes.map(rt => (
              <option key={rt.id} value={rt.id}>{rt.name}</option>
            ))}
          </select>
          <select
            value={filters.source}
            onChange={e => setFilter('source', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          >
            <option value="">All Sources</option>
            {SOURCE_OPTIONS.filter(Boolean).map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={e => setFilter('from', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          />
          <input
            type="date"
            value={filters.to}
            onChange={e => setFilter('to', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
          />
          <button
            onClick={clearFilters}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={bookings}
        loading={loading}
        onRowClick={(row) => navigate(`/dashboard/bookings/${row.id}`)}
      />
    </div>
  );
}
