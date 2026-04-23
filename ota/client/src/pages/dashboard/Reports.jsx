import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/index.js';

const TABS = ['Revenue', 'Bookings by Source', 'Commissions', 'Occupancy'];

function useChart(canvasRef, type, data, options) {
  useEffect(() => {
    if (!canvasRef.current || !window.Chart) return;
    const ctx = canvasRef.current.getContext('2d');
    const chart = new window.Chart(ctx, { type, data, options });
    return () => chart.destroy();
  }, [canvasRef, JSON.stringify(data)]);
}

function exportCSV(data, filename) {
  if (!data?.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function RevenueTab() {
  const canvasRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/reports/revenue?period=12months')
      .then(r => setData(r.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const chartData = {
    labels: data.map(d => d.month || d.label),
    datasets: [{
      label: 'Revenue',
      data: data.map(d => d.revenue || d.amount || d.value || 0),
      backgroundColor: '#C8922A',
      borderColor: '#C8922A',
      borderWidth: 1,
    }]
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  };

  useChart(canvasRef, 'bar', chartData, chartOptions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary">Monthly Revenue (Last 12 Months)</h3>
        <button onClick={() => exportCSV(data, 'revenue-report.csv')} className="bg-primary text-white text-xs px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
          Export CSV
        </button>
      </div>
      {loading ? (
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <canvas ref={canvasRef} height="280" />
        </div>
      )}
      {data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-primary">
              <tr>
                {['Month', 'Bookings', 'Revenue', 'Commission'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-primary">{row.month || row.label}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.booking_count ?? row.bookings ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium">{row.revenue || row.amount ? `ZAR ${Number(row.revenue || row.amount).toLocaleString()}` : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.commission ? `ZAR ${Number(row.commission).toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BySourceTab() {
  const canvasRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/reports/bookings-by-source')
      .then(r => setData(r.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const COLORS = ['#0D1B2A', '#C8922A', '#1B5E7B', '#2d6a4f', '#7c3aed', '#dc2626', '#059669', '#d97706'];

  const chartData = {
    labels: data.map(d => d.source || d.label),
    datasets: [{
      data: data.map(d => d.count || d.value || 0),
      backgroundColor: COLORS,
      borderWidth: 2,
      borderColor: '#fff',
    }]
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { position: 'bottom' } }
  };

  useChart(canvasRef, 'pie', chartData, chartOptions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary">Bookings by Source</h3>
        <button onClick={() => exportCSV(data, 'bookings-by-source.csv')} className="bg-primary text-white text-xs px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
          Export CSV
        </button>
      </div>
      {loading ? (
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-sm mx-auto">
          <canvas ref={canvasRef} />
        </div>
      )}
      {data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-primary">
              <tr>
                {['Source', 'Bookings', 'Revenue', 'Share'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {data.map((row, i) => {
                const totalCount = data.reduce((s, d) => s + (d.count || 0), 0);
                const pct = totalCount ? ((row.count / totalCount) * 100).toFixed(1) : '0';
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="capitalize font-medium text-primary">{row.source || row.label || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{row.count || 0}</td>
                    <td className="px-4 py-2.5">{row.revenue ? `ZAR ${Number(row.revenue).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CommissionsReportTab() {
  const canvasRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/reports/commissions')
      .then(r => setData(r.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const chartData = {
    labels: data.map(d => d.month || d.label),
    datasets: [
      {
        label: 'Earned',
        data: data.map(d => d.earned || d.total || 0),
        backgroundColor: '#1B5E7B',
      },
      {
        label: 'Paid',
        data: data.map(d => d.paid || 0),
        backgroundColor: '#2d6a4f',
      },
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { x: { stacked: false }, y: { beginAtZero: true } }
  };

  useChart(canvasRef, 'bar', chartData, chartOptions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary">Commission Trends</h3>
        <button onClick={() => exportCSV(data, 'commissions-report.csv')} className="bg-primary text-white text-xs px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
          Export CSV
        </button>
      </div>
      {loading ? (
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <canvas ref={canvasRef} height="280" />
        </div>
      )}
    </div>
  );
}

function OccupancyTab() {
  const canvasRef = useRef(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/reports/occupancy')
      .then(r => setData(r.data || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  const chartData = {
    labels: data.map(d => d.month || d.label),
    datasets: [{
      label: 'Occupancy %',
      data: data.map(d => d.occupancy_rate || d.rate || d.value || 0),
      borderColor: '#C8922A',
      backgroundColor: 'rgba(200, 146, 42, 0.1)',
      fill: true,
      tension: 0.3,
    }]
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, max: 100 } }
  };

  useChart(canvasRef, 'line', chartData, chartOptions);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-primary">Occupancy Trend</h3>
        <button onClick={() => exportCSV(data, 'occupancy-report.csv')} className="bg-primary text-white text-xs px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors">
          Export CSV
        </button>
      </div>
      {loading ? (
        <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <canvas ref={canvasRef} height="280" />
        </div>
      )}
      {data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-primary">
              <tr>
                {['Month', 'Occupied Nights', 'Total Nights', 'Occupancy %'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-primary">{row.month || row.label}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.occupied_nights ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600">{row.total_nights ?? '—'}</td>
                  <td className="px-4 py-2.5 font-medium text-teal">{row.occupancy_rate != null ? `${row.occupancy_rate}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="space-y-5">
      {/* Tab Nav */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === i
                  ? 'border-gold text-gold'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === 0 && <RevenueTab />}
        {activeTab === 1 && <BySourceTab />}
        {activeTab === 2 && <CommissionsReportTab />}
        {activeTab === 3 && <OccupancyTab />}
      </div>
    </div>
  );
}
