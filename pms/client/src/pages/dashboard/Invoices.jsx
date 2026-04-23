import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Pagination from '../../components/Pagination.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { addToast } = useToast();

  const load = () => api.get('/api/invoices', { params: { page, limit: 25, status } }).then(r => { setInvoices(r.data.invoices || []); setTotal(r.data.pagination?.total || 0); });
  useEffect(load, [page, status]);

  const download = async (inv) => {
    try {
      const r = await api.get(`/api/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = `${inv.invoice_number}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { addToast('Failed to download', 'error'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Invoices</h1>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['draft','sent','paid','overdue','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>{['Number','Type','Recipient','Total','Due','Status','PDF'].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-teal">{inv.invoice_number}</td>
                  <td className="px-4 py-3 capitalize text-gray-600">{inv.issued_to}</td>
                  <td className="px-4 py-3">{inv.recipient_name || '—'}</td>
                  <td className="px-4 py-3 font-medium">{inv.currency} {Number(inv.total_amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{inv.due_date || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3"><button onClick={() => download(inv)} className="text-xs text-teal hover:underline">PDF</button></td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No invoices</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={25} onPage={setPage} />
      </div>
    </div>
  );
}
