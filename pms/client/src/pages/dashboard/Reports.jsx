import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useProperty } from '../../contexts/PropertyContext.jsx';

const TABS = [
  { id: 'revenue',             label: 'Revenue' },
  { id: 'occupancy',           label: 'Occupancy' },
  { id: 'arrivals-departures', label: 'Arrivals & Departures' },
  { id: 'payments',            label: 'Payments' },
  { id: 'commissions',         label: 'Commissions' },
  { id: 'guests',              label: 'Guests' },
];

function SummaryCard({ label, value }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xl font-bold text-primary">{value ?? '—'}</div>
    </div>
  );
}

function DataTable({ rows, columns }) {
  if (!rows || rows.length === 0) {
    return <div className="p-8 text-center text-gray-400 text-sm">No data for this period</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
          <tr>
            {columns.map(c => (
              <th key={c.key} className="px-4 py-3 text-left whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map(c => (
                <td key={c.key} className="px-4 py-3">
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevenueReport({ data, currency }) {
  const fmt = n => Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
  const annual = (data.annual || [])[0] || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <SummaryCard label="Total Bookings" value={annual.booking_count ?? 0} />
        <SummaryCard label="Gross Revenue" value={`${currency} ${fmt(annual.gross_revenue)}`} />
        <SummaryCard label="Net to Property" value={`${currency} ${fmt(annual.net_revenue)}`} />
        <SummaryCard label="Total Nights" value={annual.total_nights ?? 0} />
      </div>
      <div className="border-t border-gray-100 px-4 pb-2 pt-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Monthly Breakdown</h3>
        <DataTable
          rows={data.monthly || []}
          columns={[
            { key: 'month', label: 'Month', render: v => new Date(2000, parseInt(v)-1).toLocaleString('default', { month: 'long' }) },
            { key: 'booking_count', label: 'Bookings' },
            { key: 'total_nights', label: 'Nights' },
            { key: 'gross_revenue', label: 'Gross Revenue', render: v => `${currency} ${fmt(v)}` },
            { key: 'net_revenue', label: 'Net Revenue', render: v => `${currency} ${fmt(v)}` },
            { key: 'total_commissions', label: 'Commissions', render: v => `${currency} ${fmt(v)}` },
          ]}
        />
      </div>
      {(data.by_source || []).length > 0 && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">By Source</h3>
          <DataTable
            rows={data.by_source}
            columns={[
              { key: 'source', label: 'Source' },
              { key: 'count', label: 'Bookings' },
              { key: 'revenue', label: 'Revenue', render: v => `${currency} ${fmt(v)}` },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function OccupancyReport({ data }) {
  const s = data.summary || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <SummaryCard label="Total Rooms" value={s.total_rooms} />
        <SummaryCard label="Occupied Nights" value={s.occupied_nights} />
        <SummaryCard label="Occupancy Rate" value={`${s.occupancy_rate}%`} />
        <SummaryCard label="Arrivals" value={s.arrivals} />
      </div>
      <div className="border-t border-gray-100 px-4 pb-2 pt-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">Daily Breakdown</h3>
        <DataTable
          rows={data.daily || []}
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'occupied_rooms', label: 'Occupied' },
            { key: 'total_rooms', label: 'Total' },
            { key: 'occupancy_pct', label: 'Occupancy %', render: v => `${v}%` },
          ]}
        />
      </div>
    </div>
  );
}

function ArrDepReport({ data }) {
  const nameOf = r => r.first_name ? `${r.first_name} ${r.last_name}` : '—';
  const cols = [
    { key: 'booking_ref', label: 'Ref' },
    { key: 'first_name', label: 'Guest', render: (_, r) => nameOf(r) },
    { key: 'room_number', label: 'Room' },
    { key: 'check_in', label: 'Check-in' },
    { key: 'check_out', label: 'Check-out' },
    { key: 'nights', label: 'Nights' },
    { key: 'payment_status', label: 'Payment' },
  ];
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 px-4 pb-4 pt-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">
          Arrivals ({(data.arrivals || []).length})
        </h3>
        <DataTable rows={data.arrivals || []} columns={cols} />
      </div>
      <div className="px-4 pb-4 pt-2">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">
          Departures ({(data.departures || []).length})
        </h3>
        <DataTable rows={data.departures || []} columns={cols} />
      </div>
      {(data.in_house || []).length > 0 && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">
            In-House ({data.in_house.length})
          </h3>
          <DataTable rows={data.in_house} columns={cols} />
        </div>
      )}
    </div>
  );
}

function PaymentsReport({ data, currency }) {
  const fmt = n => Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
  const totals = data.totals || {};
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
        <SummaryCard label="Total Collected" value={`${currency} ${fmt(totals.total_amount)}`} />
        <SummaryCard label="Transactions" value={totals.transaction_count} />
      </div>
      <div className="border-t border-gray-100 px-4 pb-2 pt-4">
        <DataTable
          rows={data.payments || []}
          columns={[
            { key: 'payment_date', label: 'Date' },
            { key: 'booking_ref', label: 'Booking' },
            { key: 'first_name', label: 'Guest', render: (_, r) => r.first_name ? `${r.first_name} ${r.last_name}` : '—' },
            { key: 'amount', label: 'Amount', render: v => `${currency} ${fmt(v)}` },
            { key: 'payment_method', label: 'Method' },
            { key: 'reference', label: 'Reference' },
          ]}
        />
      </div>
    </div>
  );
}

function CommissionsReport({ data, currency }) {
  const fmt = n => Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 });
  return (
    <div className="space-y-6">
      <div className="border-t border-gray-100 px-4 pb-2 pt-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">By Status</h3>
        <DataTable
          rows={data.by_status || []}
          columns={[
            { key: 'status', label: 'Status' },
            { key: 'count', label: 'Count' },
            { key: 'total_amount', label: 'Total', render: v => `${currency} ${fmt(v)}` },
          ]}
        />
      </div>
      {(data.overdue || []).length > 0 && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-4">
          <h3 className="text-sm font-semibold text-red-600 mb-3">Overdue ({data.overdue.length})</h3>
          <DataTable
            rows={data.overdue}
            columns={[
              { key: 'booking_ref', label: 'Booking' },
              { key: 'amount', label: 'Amount', render: v => `${currency} ${fmt(v)}` },
              { key: 'due_date', label: 'Due Date' },
              { key: 'status', label: 'Status' },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function GuestsReport({ data }) {
  return (
    <div className="space-y-6">
      <div className="border-b border-gray-100 px-4 pb-4 pt-4">
        <h3 className="text-sm font-semibold text-gray-600 mb-3">By Nationality</h3>
        <DataTable
          rows={data.by_nationality || []}
          columns={[
            { key: 'nationality', label: 'Nationality' },
            { key: 'guest_count', label: 'Guests' },
            { key: 'booking_count', label: 'Bookings' },
          ]}
        />
      </div>
      {(data.vip_guests || []).length > 0 && (
        <div className="px-4 pb-4 pt-2">
          <h3 className="text-sm font-semibold text-gold mb-3">VIP Guests ({data.vip_guests.length})</h3>
          <DataTable
            rows={data.vip_guests}
            columns={[
              { key: 'first_name', label: 'Name', render: (_, r) => `${r.first_name} ${r.last_name}` },
              { key: 'email', label: 'Email' },
              { key: 'booking_count', label: 'Stays' },
              { key: 'last_stay', label: 'Last Stay' },
            ]}
          />
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { property } = useProperty();
  const [tab, setTab] = useState('revenue');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const today = new Date();
  const [params, setParams] = useState({
    from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  });

  const currency = property?.currency || 'ZAR';

  useEffect(() => {
    setLoading(true);
    setData(null);
    setError(null);
    api.get(`/api/reports/${tab}`, { params })
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [tab, params]);

  const renderReport = () => {
    if (!data) return null;
    switch (tab) {
      case 'revenue':            return <RevenueReport data={data} currency={currency} />;
      case 'occupancy':          return <OccupancyReport data={data} />;
      case 'arrivals-departures': return <ArrDepReport data={data} />;
      case 'payments':           return <PaymentsReport data={data} currency={currency} />;
      case 'commissions':        return <CommissionsReport data={data} currency={currency} />;
      case 'guests':             return <GuestsReport data={data} />;
      default:                   return null;
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Reports</h1>

      {/* Date range */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <input type="date" value={params.from}
          onChange={e => setParams(p => ({ ...p, from: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={params.to}
          onChange={e => setParams(p => ({ ...p, to: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 min-h-32">
        {loading ? (
          <div className="p-12 text-center text-gray-400 animate-pulse">Loading…</div>
        ) : error ? (
          <div className="p-12 text-center">
            <div className="text-red-500 text-sm mb-2">{error}</div>
          </div>
        ) : data ? (
          renderReport()
        ) : (
          <div className="p-12 text-center text-gray-400 text-sm">No data for this period</div>
        )}
      </div>
    </div>
  );
}
