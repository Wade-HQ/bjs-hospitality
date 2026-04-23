import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/index.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import Modal from '../../components/Modal.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';

function StatCard({ title, value, subtitle, highlight, icon }) {
  return (
    <div className={`bg-white rounded-xl border p-6 ${highlight ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <p className={`text-sm font-medium ${highlight ? 'text-red-600' : 'text-gray-500'}`}>{title}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${highlight ? 'text-red-700' : 'text-primary'}`}>{value}</p>
      {subtitle && <p className={`text-xs mt-1 ${highlight ? 'text-red-500' : 'text-gray-400'}`}>{subtitle}</p>}
    </div>
  );
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const NOTIF_ICONS = {
  booking_created: '📋',
  booking_confirmed: '✅',
  booking_cancelled: '❌',
  payment_received: '💰',
  commission_due: '🧾',
  check_in: '🏨',
  check_out: '👋',
};

export default function Dashboard() {
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markPaidModal, setMarkPaidModal] = useState(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [markingPaid, setMarkingPaid] = useState(false);

  const fetchAll = async () => {
    try {
      const [statsRes, commRes, arrivRes, deptRes, notifRes] = await Promise.allSettled([
        api.get('/api/dashboard/stats'),
        api.get('/api/commissions?status=pending&status=overdue&limit=10'),
        api.get('/api/bookings?check_in_today=true'),
        api.get('/api/bookings?check_out_today=true'),
        api.get('/api/notifications?limit=20'),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (commRes.status === 'fulfilled') setCommissions(commRes.value.data?.commissions || commRes.value.data || []);
      if (arrivRes.status === 'fulfilled') setArrivals(arrivRes.value.data?.bookings || arrivRes.value.data || []);
      if (deptRes.status === 'fulfilled') setDepartures(deptRes.value.data?.bookings || deptRes.value.data || []);
      if (notifRes.status === 'fulfilled') setNotifications(notifRes.value.data?.notifications || notifRes.value.data || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleMarkPaid = async () => {
    if (!markPaidModal) return;
    setMarkingPaid(true);
    try {
      await api.put(`/api/commissions/${markPaidModal.id}/paid`, { payment_ref: paymentRef });
      addToast('Commission marked as paid', 'success');
      setMarkPaidModal(null);
      setPaymentRef('');
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to mark as paid', 'error');
    } finally {
      setMarkingPaid(false);
    }
  };

  const fmtCurrency = (n, currency) => {
    if (!n && n !== 0) return '—';
    return `${currency || 'ZAR'} ${Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  };

  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
    return diff;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-28 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Bookings This Month"
          value={stats?.bookings_this_month ?? 0}
          icon="📋"
          subtitle="total bookings"
        />
        <StatCard
          title="Revenue This Month"
          value={fmtCurrency(stats?.revenue_this_month, stats?.currency)}
          icon="💵"
          subtitle="total booking value"
        />
        <StatCard
          title="Commissions Due"
          value={fmtCurrency(stats?.commissions_due, stats?.currency)}
          icon="🧾"
          subtitle="pending payment"
        />
        <StatCard
          title="Commissions Overdue"
          value={fmtCurrency(stats?.commissions_overdue, stats?.currency)}
          icon="⚠️"
          subtitle="requires attention"
          highlight={stats?.commissions_overdue > 0}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Commissions */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-primary">Pending Commissions</h2>
            <Link to="/dashboard/commissions" className="text-xs text-teal hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {commissions.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">No pending commissions</div>
            ) : (
              commissions.map(c => {
                const days = daysUntil(c.due_date);
                const isOverdue = days !== null && days < 0;
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{c.booking_ref}</p>
                      <p className="text-xs text-gray-400">{c.property_name || c.property}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${isOverdue ? 'text-red-600' : 'text-primary'}`}>
                        {fmtCurrency(c.amount, c.currency)}
                      </p>
                      {days !== null && (
                        <p className={`text-xs ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                          {isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'due today' : `${days}d left`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setMarkPaidModal(c); setPaymentRef(''); }}
                      className="bg-green-100 hover:bg-green-200 text-green-700 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0"
                    >
                      Mark Paid
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Arrivals & Departures */}
        <div className="space-y-4">
          {/* Today's Arrivals */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-primary">Today's Arrivals</h2>
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">{arrivals.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {arrivals.length === 0 ? (
                <div className="px-5 py-6 text-center text-gray-400 text-sm">No arrivals today</div>
              ) : (
                arrivals.slice(0, 5).map(b => (
                  <div key={b.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {[b.first_name, b.last_name].filter(Boolean).join(' ')}
                      </p>
                      <p className="text-xs text-gray-400">{b.property_name} · {b.room_type_name}</p>
                    </div>
                    <Link to={`/dashboard/bookings/${b.id}`} className="text-xs text-teal hover:underline">
                      {b.booking_ref}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Today's Departures */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-primary">Today's Departures</h2>
              <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-0.5 rounded-full">{departures.length}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {departures.length === 0 ? (
                <div className="px-5 py-6 text-center text-gray-400 text-sm">No departures today</div>
              ) : (
                departures.slice(0, 5).map(b => (
                  <div key={b.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-primary">
                        {[b.first_name, b.last_name].filter(Boolean).join(' ')}
                      </p>
                      <p className="text-xs text-gray-400">{b.property_name} · {b.room_type_name}</p>
                    </div>
                    <Link to={`/dashboard/bookings/${b.id}`} className="text-xs text-teal hover:underline">
                      {b.booking_ref}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-primary">Recent Activity</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {notifications.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">No recent activity</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className="px-5 py-3 flex items-start gap-3">
                <span className="text-lg flex-shrink-0 mt-0.5">{NOTIF_ICONS[n.type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary">{n.title || n.message}</p>
                  {n.body && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{n.body}</p>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{timeAgo(n.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>

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
                <span className="font-medium text-primary">{markPaidModal.property_name || markPaidModal.property}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-primary">{fmtCurrency(markPaidModal.amount, markPaidModal.currency)}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">PAYMENT REFERENCE (optional)</label>
              <input
                type="text"
                value={paymentRef}
                onChange={e => setPaymentRef(e.target.value)}
                placeholder="Bank transfer ref, EFT ref..."
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setMarkPaidModal(null)} className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={markingPaid}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                {markingPaid ? 'Saving...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
