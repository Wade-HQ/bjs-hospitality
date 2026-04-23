import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Table from '../../components/Table.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

function exportCSV(data) {
  const headers = ['Booking Ref', 'Property', 'Amount', 'Rate', 'Due Date', 'Status', 'Paid At'];
  const rows = data.map(c => [c.booking_ref, c.property_name, c.amount, c.rate, c.due_date, c.status, c.paid_at]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v ?? ''}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commissions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Commissions() {
  const { addToast } = useToast();
  const [commissions, setCommissions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [filters, setFilters] = useState({ property_id: '', status: '', date_from: '', date_to: '' });
  const [markPaidModal, setMarkPaidModal] = useState(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => {
    api.get('/api/properties').then(r => setProperties(r.data || [])).catch(() => {});
    api.get('/api/commissions/summary').then(r => setSummary(r.data)).catch(() => {});
    api.get('/api/commissions/monthly').then(r => setMonthly(r.data || [])).catch(() => {});
  }, []);

  const fetchCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await api.get(`/api/commissions?${params}`);
      const data = res.data;
      setCommissions(data.commissions || data || []);
      setTotal(data.total || (data.commissions || data || []).length);
    } catch (_) {
      setCommissions([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  const handleMarkPaid = async () => {
    if (!markPaidModal) return;
    setMarkingPaid(true);
    try {
      await api.put(`/api/commissions/${markPaidModal.id}/paid`, { payment_ref: paymentRef });
      addToast('Commission marked as paid', 'success');
      setMarkPaidModal(null);
      setPaymentRef('');
      fetchCommissions();
      api.get('/api/commissions/summary').then(r => setSummary(r.data)).catch(() => {});
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update commission', 'error');
    } finally {
      setMarkingPaid(false);
    }
  };

  const fmtCurrency = (n, currency) => n != null ? `${currency || 'ZAR'} ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—';
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const daysUntil = (d) => {
    if (!d) return null;
    return Math.ceil((new Date(d) - new Date()) / 86400000);
  };

  const columns = [
    { key: 'booking_ref', label: 'Booking Ref' },
    { key: 'property_name', label: 'Property' },
    { key: 'amount', label: 'Amount', render: (v, row) => fmtCurrency(v, row.currency) },
    { key: 'rate', label: 'Rate', render: (v) => v ? `${v}%` : '—' },
    {
      key: 'due_date', label: 'Due Date',
      render: (v, row) => {
        const days = daysUntil(v);
        const isOverdue = days !== null && days < 0;
        return (
          <div>
            <div>{fmt(v)}</div>
            {days !== null && row.status !== 'paid' && (
              <div className={`text-xs ${isOverdue ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-gray-400'}`}>
                {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'due today' : `${days}d remaining`}
              </div>
            )}
          </div>
        );
      }
    },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    { key: 'paid_at', label: 'Paid At', render: (v) => fmt(v) },
    {
      key: 'actions', label: '',
      render: (_, row) => row.status !== 'paid' ? (
        <button
          onClick={() => { setMarkPaidModal(row); setPaymentRef(''); }}
          className="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
        >
          Mark Paid
        </button>
      ) : null
    },
  ];

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Earned', value: fmtCurrency(summary.total_earned, summary.currency), color: 'text-primary' },
            { label: 'Pending', value: fmtCurrency(summary.pending, summary.currency), color: 'text-amber-600' },
            { label: 'Overdue', value: fmtCurrency(summary.overdue, summary.currency), color: 'text-red-600', highlight: summary.overdue > 0 },
            { label: 'Paid (All Time)', value: fmtCurrency(summary.paid, summary.currency), color: 'text-green-600' },
          ].map(card => (
            <div key={card.label} className={`bg-white rounded-xl border p-5 ${card.highlight ? 'border-red-300' : 'border-gray-200'}`}>
              <p className="text-xs text-gray-400 mb-1">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filters.property_id}
            onChange={e => { setFilters(f => ({ ...f, property_id: e.target.value })); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          >
            <option value="">All Properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filters.status}
            onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="due">Due</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
          <input
            type="date"
            value={filters.date_from}
            onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value })); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
          <span className="flex items-center text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={filters.date_to}
            onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value })); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
          />
          <button
            onClick={() => exportCSV(commissions)}
            className="bg-primary text-white rounded-lg px-4 py-2 text-sm hover:bg-primary/90 transition-colors"
          >
            Export CSV
          </button>
          <button
            onClick={() => { setFilters({ property_id: '', status: '', date_from: '', date_to: '' }); setPage(1); }}
            className="border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <Table columns={columns} data={commissions} loading={loading} />
      <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />

      {/* Monthly Summary */}
      {monthly.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-primary">Monthly Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead>
                <tr className="bg-slate-50">
                  {['Month', 'Bookings', 'Total Amount', 'Paid', 'Pending'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthly.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{row.month}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.count}</td>
                    <td className="px-4 py-3 text-sm font-medium">{fmtCurrency(row.total, row.currency)}</td>
                    <td className="px-4 py-3 text-sm text-green-600">{fmtCurrency(row.paid, row.currency)}</td>
                    <td className="px-4 py-3 text-sm text-amber-600">{fmtCurrency(row.pending, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mark Paid Modal */}
      <Modal open={!!markPaidModal} onClose={() => setMarkPaidModal(null)} title="Mark Commission as Paid">
        {markPaidModal && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Booking</span>
                <span className="font-medium text-primary">{markPaidModal.booking_ref}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Property</span>
                <span className="font-medium text-primary">{markPaidModal.property_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Commission</span>
                <span className="font-bold text-primary">{fmtCurrency(markPaidModal.amount, markPaidModal.currency)}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">PAYMENT REFERENCE</label>
              <input
                type="text"
                value={paymentRef}
                onChange={e => setPaymentRef(e.target.value)}
                placeholder="EFT ref, bank confirmation..."
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={markingPaid}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {markingPaid ? 'Saving...' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
