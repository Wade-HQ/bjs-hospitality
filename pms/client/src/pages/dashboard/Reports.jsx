import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';

export default function Reports() {
  const [tab, setTab] = useState('revenue');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10),
    to: new Date().toISOString().slice(0,10)
  });

  const tabs = ['revenue','occupancy','guest_summary','arrivals_departures'];

  const run = () => {
    setLoading(true);
    api.get(`/api/reports/${tab}`, { params }).then(r => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(run, [tab, params]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary mb-6">Reports</h1>
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <input type="date" value={params.from} onChange={e => setParams(p=>({...p,from:e.target.value}))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={params.to} onChange={e => setParams(p=>({...p,to:e.target.value}))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
      </div>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===t ? 'bg-white shadow text-primary' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.replace(/_/g,' ')}
          </button>
        ))}
      </div>
      {loading ? <div className="p-12 text-center text-gray-400">Loading…</div> :
        data && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {Array.isArray(data) ? (
              data.length === 0 ? <div className="p-12 text-center text-gray-400">No data for this period</div> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                    <tr>{Object.keys(data[0]).map(k => <th key={k} className="px-4 py-3 text-left">{k.replace(/_/g,' ')}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">{Object.values(row).map((v,j) => <td key={j} className="px-4 py-3">{typeof v === 'number' ? v.toLocaleString() : v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data).map(([k,v]) => (
                  <div key={k} className="bg-gray-50 rounded-lg p-4">
                    <dt className="text-xs text-gray-400 uppercase mb-1">{k.replace(/_/g,' ')}</dt>
                    <dd className="text-xl font-bold text-primary">{typeof v==='number' ? v.toLocaleString() : v}</dd>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    </div>
  );
}
