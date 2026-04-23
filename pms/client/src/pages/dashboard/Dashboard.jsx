import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/index.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useProperty } from '../../contexts/PropertyContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';

function StatCard({ title, value, sub, color = 'primary' }) {
  const colorClass = {
    primary: 'border-l-primary',
    gold: 'border-l-gold',
    teal: 'border-l-teal',
    red: 'border-l-red-500',
    green: 'border-l-green-500',
  }[color] || 'border-l-primary';

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 ${colorClass} p-4`}>
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</div>
      <div className="text-2xl font-bold text-primary mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { property } = useProperty();

  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [commissions, setCommissions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [overduePayments, setOverduePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [arrDepRes, roomsRes, notifRes] = await Promise.all([
        api.get(`/api/reports/arrivals-departures?from=${today}&to=${today}`),
        api.get('/api/rooms'),
        api.get('/api/notifications?unread=true'),
      ]);

      const toGuestName = b => `${b.first_name || ''} ${b.last_name || ''}`.trim();
      setArrivals((arrDepRes.data?.arrivals || []).map(b => ({ ...b, guest_name: toGuestName(b) })));
      setDepartures((arrDepRes.data?.departures || []).map(b => ({ ...b, guest_name: toGuestName(b) })));
      setRooms(roomsRes.data?.rooms || []);
      setNotifications((notifRes.data?.notifications || []).slice(0, 15));

      // Revenue (non-blocking) — show this month's gross revenue
      try {
        const revRes = await api.get(`/api/reports/revenue?year=${currentYear}`);
        const thisMonth = String(new Date().getMonth() + 1).padStart(2, '0');
        const monthData = (revRes.data?.monthly || []).find(m => m.month === thisMonth);
        setRevenue(monthData || null);
      } catch (_) {}

      // Commissions (non-blocking) — fetch due + overdue separately
      try {
        const [dueRes, overdueRes] = await Promise.all([
          api.get('/api/commissions?status=due'),
          api.get('/api/commissions?status=overdue'),
        ]);
        setCommissions([
          ...(dueRes.data?.commissions || []),
          ...(overdueRes.data?.commissions || []),
        ]);
      } catch (_) {}

    } catch (err) {
      addToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCheckIn = async (bookingId) => {
    setActionLoading(prev => ({ ...prev, [bookingId]: true }));
    try {
      await api.patch(`/api/bookings/${bookingId}/check-in`);
      addToast('Guest checked in successfully');
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Check-in failed', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [bookingId]: false }));
    }
  };

  const handleCheckOut = async (bookingId) => {
    setActionLoading(prev => ({ ...prev, [bookingId]: true }));
    try {
      await api.patch(`/api/bookings/${bookingId}/check-out`);
      addToast('Guest checked out successfully');
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Check-out failed', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [bookingId]: false }));
    }
  };

  const markNotifRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (_) {}
  };

  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const totalRooms = rooms.length;
  const occupancyPct = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const currency = property?.currency || 'ZAR';

  const commissionTotal = commissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

  const fmt = (n) => Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="p-6 space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Today's Arrivals"
          value={arrivals.length}
          sub={`${arrivals.filter(a => a.status === 'confirmed').length} confirmed`}
          color="teal"
        />
        <StatCard
          title="Today's Departures"
          value={departures.length}
          sub="Checking out today"
          color="primary"
        />
        <StatCard
          title="Occupancy"
          value={`${occupiedRooms}/${totalRooms}`}
          sub={`${occupancyPct}% occupied`}
          color="green"
        />
        {commissionTotal > 0 && (
          <StatCard
            title="Commissions Due"
            value={`${currency} ${fmt(commissionTotal)}`}
            sub={`${commissions.length} record(s)`}
            color="gold"
          />
        )}
      </div>

      {/* Revenue row */}
      {revenue && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Today's Revenue" value={`${currency} ${fmt(revenue.today)}`} color="green" />
          <StatCard title="This Week" value={`${currency} ${fmt(revenue.this_week)}`} color="teal" />
          <StatCard title="This Month" value={`${currency} ${fmt(revenue.this_month)}`} color="gold" />
        </div>
      )}

      {/* Occupancy bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-primary">Room Occupancy</span>
          <span className="text-sm font-bold text-primary">{occupancyPct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="h-3 rounded-full bg-teal transition-all duration-500"
            style={{ width: `${occupancyPct}%` }}
          />
        </div>
        <div className="text-xs text-gray-400 mt-1">{occupiedRooms} of {totalRooms} rooms occupied</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Arrivals */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-primary">Today's Arrivals</h2>
            <span className="text-xs text-gray-400">{arrivals.length} expected</span>
          </div>
          {loading ? (
            <div className="p-5 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
          ) : arrivals.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No arrivals today</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {arrivals.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium text-primary cursor-pointer hover:underline truncate"
                      onClick={() => navigate(`/dashboard/bookings/${b.id}`)}
                    >
                      {b.guest_name}
                    </div>
                    <div className="text-xs text-gray-400">
                      Room {b.room_number || b.room_name} &bull; {b.nights} night{b.nights !== 1 ? 's' : ''}
                    </div>
                    {Number(b.balance_due) > 0 && (
                      <div className="text-xs text-red-500 font-medium mt-0.5">
                        Balance: {currency} {fmt(b.balance_due)}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={b.status} />
                  <button
                    onClick={() => handleCheckIn(b.id)}
                    disabled={actionLoading[b.id]}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Check In
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Departures */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-primary">Today's Departures</h2>
            <span className="text-xs text-gray-400">{departures.length} departing</span>
          </div>
          {loading ? (
            <div className="p-5 text-center text-gray-400 text-sm animate-pulse">Loading...</div>
          ) : departures.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No departures today</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {departures.map(b => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-medium text-primary cursor-pointer hover:underline truncate"
                      onClick={() => navigate(`/dashboard/bookings/${b.id}`)}
                    >
                      {b.guest_name}
                    </div>
                    <div className="text-xs text-gray-400">Room {b.room_number || b.room_name}</div>
                    {Number(b.balance_due) > 0 && (
                      <div className="text-xs text-red-500 font-semibold mt-0.5">
                        Outstanding: {currency} {fmt(b.balance_due)}
                      </div>
                    )}
                  </div>
                  {Number(b.balance_due) > 0 && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Unpaid</span>
                  )}
                  <button
                    onClick={() => handleCheckOut(b.id)}
                    disabled={actionLoading[b.id]}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Check Out
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Payments */}
        {overduePayments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-red-600">Overdue Payments</h2>
              <span className="text-xs text-gray-400">{overduePayments.length} bookings</span>
            </div>
            <div className="divide-y divide-gray-50">
              {overduePayments.slice(0, 8).map(b => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/dashboard/bookings/${b.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary truncate">{b.guest_name}</div>
                    <div className="text-xs text-gray-400">Checked out: {b.check_out?.slice(0, 10)}</div>
                  </div>
                  <span className="text-sm font-semibold text-red-600 whitespace-nowrap">
                    {currency} {fmt(b.balance_due)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commissions */}
        {commissions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-primary">Commissions Owed</h2>
              <span className="text-xs font-semibold text-gold">Total: {currency} {fmt(commissionTotal)}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {commissions.slice(0, 6).map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/dashboard/bookings/${c.booking_id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary truncate">{c.guest_name || c.booking_ref}</div>
                    <div className="text-xs text-gray-400">{c.commission_type || 'OTA'} &bull; Due: {c.due_date?.slice(0,10) || '—'}</div>
                  </div>
                  <StatusBadge status={c.status} />
                  <span className="text-sm font-semibold text-primary whitespace-nowrap">
                    {currency} {fmt(c.amount_due)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notification feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-primary">Recent Notifications</h2>
            <span className="text-xs text-gray-400">{notifications.length} unread</span>
          </div>
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No unread notifications</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => markNotifRead(n.id)}
                >
                  <span className="text-lg mt-0.5">
                    {n.type === 'arrival' ? '🛬' : n.type === 'departure' ? '🛫' : n.type === 'payment' ? '💰' : '📌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700">{n.message}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  <button className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap">Dismiss</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
