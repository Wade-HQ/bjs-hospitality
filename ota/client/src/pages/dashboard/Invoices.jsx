import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Table from '../../components/Table.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Invoices() {
  const { addToast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [filters, setFilters] = useState({ status: '', date_from: '', date_to: '' });
  const [generateModal, setGenerateModal] = useState(false);
  const [genForm, setGenForm] = useState({ booking_ref: '', notes: '' });
  const [generating, setGenerating] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const res = await api.get(`/api/invoices?${params}`);
      const data = res.data;
      setInvoices(data.invoices || data || []);
      setTotal(data.total || (data.invoices || data || []).length);
    } catch (_) {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api.post('/api/invoices/generate', genForm);
      addToast('Invoice generated successfully', 'success');
      setGenerateModal(false);
      setGenForm({ booking_ref: '', notes: '' });
      fetchInvoices();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to generate invoice', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkSent = async (id) => {
    setUpdatingId(id);
    try {
      await api.put(`/api/invoices/${id}/sent`);
      addToast('Invoice marked as sent', 'success');
      fetchInvoices();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update invoice', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMarkPaid = async (id) => {
    setUpdatingId(id);
    try {
      await api.put(`/api/invoices/${id}/paid`);
      addToast('Invoice marked as paid', 'success');
      fetchInvoices();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update invoice', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtCurrency = (n, currency) => n != null ? `${currency || 'ZAR'} ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : '—';

  const columns = [
    { key: 'invoice_number', label: 'Invoice #', render: (v) => <span className="font-mono font-medium text-primary">{v}</span> },
    { key: 'booking_ref', label: 'Booking Ref' },
    { key: 'property_name', label: 'Property' },
    { key: 'guest_name', label: 'Guest' },
    { key: 'amount', label: 'Amount', render: (v, row) => <span className="font-medium">{fmtCurrency(v, row.currency)}</span> },
    { key: 'created_at', label: 'Date', render: (v) => fmt(v) },
    { key: 'due_date', label: 'Due', render: (v) => fmt(v) },
    { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          {row.pdf_url && (
            <a
              href={row.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded font-medium transition-colors"
            >
              PDF
            </a>
          )}
          {row.status === 'draft' && (
            <button
              onClick={() => handleMarkSent(row.id)}
              disabled={updatingId === row.id}
              className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs px-2 py-1 rounded font-medium transition-colors disabled:opacity-50"
            >
              {updatingId === row.id ? '...' : 'Mark Sent'}
            </button>
          )}
          {(row.status === 'sent' || row.status === 'draft') && (
            <button
              onClick={() => handleMarkPaid(row.id)}
              disabled={updatingId === row.id}
              className="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-2 py-1 rounded font-medium transition-colors disabled:opacity-50"
            >
              {updatingId === row.id ? '...' : 'Mark Paid'}
            </button>
          )}
        </div>
      )
    },
  ];

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-3">
        <select
          value={filters.status}
          onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          type="date"
          value={filters.date_from}
          onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value })); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
        />
        <span className="text-gray-400 text-sm">to</span>
        <input
          type="date"
          value={filters.date_to}
          onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value })); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
        />
        <button
          onClick={() => { setFilters({ status: '', date_from: '', date_to: '' }); setPage(1); }}
          className="border border-gray-300 text-gray-600 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        <div className="ml-auto">
          <button
            onClick={() => setGenerateModal(true)}
            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Generate Invoice
          </button>
        </div>
      </div>

      <Table columns={columns} data={invoices} loading={loading} />
      <Pagination page={page} total={total} limit={limit} onPageChange={setPage} />

      {/* Generate Invoice Modal */}
      <Modal open={generateModal} onClose={() => setGenerateModal(false)} title="Generate Invoice">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">BOOKING REFERENCE</label>
            <input
              type="text"
              value={genForm.booking_ref}
              onChange={e => setGenForm(f => ({ ...f, booking_ref: e.target.value.toUpperCase() }))}
              placeholder="e.g. SSD-2024-001"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal uppercase"
            />
            <p className="text-xs text-gray-400 mt-1">The invoice will be generated using booking data</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">NOTES (optional)</label>
            <textarea
              rows={3}
              value={genForm.notes}
              onChange={e => setGenForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional notes to include on the invoice..."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal resize-none"
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setGenerateModal(false)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !genForm.booking_ref}
              className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {generating ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
