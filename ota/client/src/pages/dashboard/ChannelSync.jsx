import React, { useState, useEffect } from 'react';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';

export default function ChannelSync() {
  const { addToast } = useToast();
  const [properties, setProperties] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [copied, setCopied] = useState({});

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/properties'),
      api.get('/api/channel-sync/logs?limit=20'),
    ]).then(([propsRes, logsRes]) => {
      if (propsRes.status === 'fulfilled') setProperties(propsRes.value.data || []);
      if (logsRes.status === 'fulfilled') setSyncLogs(logsRes.value.data?.logs || logsRes.value.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const getIcalUrl = (propertySlug) => {
    const base = window.location.origin;
    return `${base}/api/public/ical/${propertySlug}`;
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(c => ({ ...c, [key]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [key]: false })), 2000);
    });
  };

  const handleManualSync = async (propertyId) => {
    setSyncing(s => ({ ...s, [propertyId]: true }));
    try {
      await api.post(`/api/channel-sync/sync/${propertyId}`);
      addToast('Sync triggered successfully', 'success');
      api.get('/api/channel-sync/logs?limit=20')
        .then(r => setSyncLogs(r.data?.logs || r.data || []))
        .catch(() => {});
    } catch (err) {
      addToast(err.response?.data?.error || 'Sync failed', 'error');
    } finally {
      setSyncing(s => ({ ...s, [propertyId]: false }));
    }
  };

  const fmt = (d) => d ? new Date(d).toLocaleString('en-ZA') : '—';

  const CHANNELS = [
    { name: 'Airbnb', logo: '🏠', color: 'text-red-500' },
    { name: 'Booking.com', logo: '🔵', color: 'text-blue-600' },
    { name: 'Expedia', logo: '✈️', color: 'text-yellow-600' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Per-property sections */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-40 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-3xl mb-2">🔄</p>
          <p>No properties to sync. Add properties first.</p>
        </div>
      ) : (
        properties.map(property => {
          const icalUrl = getIcalUrl(property.slug);
          return (
            <div key={property.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-primary px-5 py-4 flex items-center justify-between">
                <h2 className="font-semibold text-white">{property.name}</h2>
                <button
                  onClick={() => handleManualSync(property.id)}
                  disabled={syncing[property.id]}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                >
                  {syncing[property.id] ? 'Syncing...' : '↻ Sync Now'}
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* iCal URL */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">iCal Feed URL</h3>
                  <p className="text-xs text-gray-400 mb-2">
                    Use this URL to export your availability calendar to external platforms.
                  </p>
                  <div className="flex items-center gap-2 bg-slate-50 border border-gray-200 rounded-lg px-3 py-2.5">
                    <code className="flex-1 text-xs text-primary truncate font-mono">{icalUrl}</code>
                    <button
                      onClick={() => handleCopy(icalUrl, property.id)}
                      className={`text-xs px-2.5 py-1 rounded font-medium flex-shrink-0 transition-colors ${
                        copied[property.id]
                          ? 'bg-green-100 text-green-700'
                          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {copied[property.id] ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Channel connections */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Channel Connections</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {CHANNELS.map(ch => (
                      <div key={ch.name} className="border border-gray-200 rounded-xl p-3 text-center">
                        <div className={`text-2xl mb-1 ${ch.color}`}>{ch.logo}</div>
                        <p className="text-xs font-medium text-gray-700 mb-2">{ch.name}</p>
                        <div className="relative group inline-block w-full">
                          <button
                            disabled
                            className="w-full bg-gray-100 text-gray-400 text-xs py-1.5 rounded-lg cursor-not-allowed font-medium"
                          >
                            Connect
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Coming in Phase 2
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Sync Log */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-primary">Sync Log</h2>
        </div>
        {syncLogs.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">No sync activity yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Property', 'Channel', 'Status', 'Message', 'Time'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {syncLogs.map((log, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-primary">{log.property_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 capitalize">{log.channel || 'Manual'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.status === 'success' ? 'bg-green-100 text-green-700' :
                        log.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {log.status || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{log.message || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmt(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
