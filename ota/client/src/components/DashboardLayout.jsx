import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import api from '../api/index.js';

const NAV_ITEMS = [
  { label: 'Dashboard',    path: '/dashboard',               icon: '⊞' },
  { label: 'Bookings',     path: '/dashboard/bookings',      icon: '📋' },
  { label: 'Properties',   path: '/dashboard/properties',    icon: '🏨' },
  { label: 'Commissions',  path: '/dashboard/commissions',   icon: '💰' },
  { label: 'Invoices',     path: '/dashboard/invoices',      icon: '🧾' },
  { label: 'Reports',      path: '/dashboard/reports',       icon: '📊' },
  { label: 'Google Hotels',path: '/dashboard/google-hotels', icon: '🔍' },
  { label: 'Channel Sync', path: '/dashboard/channel-sync',  icon: '🔄' },
  { label: 'Users',        path: '/dashboard/users',         icon: '👥' },
  { label: 'Settings',     path: '/dashboard/settings',      icon: '⚙' },
];

function PageTitle() {
  const location = useLocation();
  const item = NAV_ITEMS.find(n => n.path === location.pathname);
  return item ? item.label : 'Dashboard';
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchNotifications = () => {
    api.get('/api/notifications?read=false')
      .then(res => setNotifications(Array.isArray(res.data) ? res.data.slice(0, 15) : []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (notif) => {
    try {
      await api.put(`/api/notifications/${notif.id}/read`);
      fetchNotifications();
      if (notif.related_id && notif.related_type === 'booking') {
        navigate(`/dashboard/bookings/${notif.related_id}`);
        setNotifOpen(false);
      }
    } catch (_) {}
  };

  const markAllRead = async () => {
    try {
      await api.put('/api/notifications/read-all');
      fetchNotifications();
      setNotifOpen(false);
    } catch (_) {}
  };

  const unreadCount = notifications.length;

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30
        w-60 bg-primary flex flex-col flex-shrink-0
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="text-gold font-bold text-lg leading-tight">Sun Safari</div>
          <div className="text-gold/70 text-xs font-medium tracking-wide">DESTINATIONS</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors border-l-2 ${
                  isActive
                    ? 'border-gold text-gold bg-white/5'
                    : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-5 py-4 border-t border-white/10">
          <div className="text-white/50 text-xs truncate mb-1">{user?.email}</div>
          <button
            onClick={logout}
            className="text-white/60 hover:text-white text-xs transition-colors"
          >
            Sign out →
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden text-gray-500 hover:text-gray-700"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-primary">
              <PageTitle />
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="text-gray-500 hover:text-gray-700 relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-primary">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-teal hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-400 text-sm">No unread notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className="flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                          onClick={() => markRead(n)}
                        >
                          <span className="mt-0.5 text-base">
                            {n.type === 'arrival' ? '🛬' : n.type === 'departure' ? '🛫' : n.type === 'payment' ? '💰' : n.type === 'new_booking' ? '📋' : '📌'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 leading-snug">{n.message}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{new Date(n.created_at).toLocaleString()}</div>
                            {n.related_id && n.related_type === 'booking' && (
                              <div className="text-xs text-teal mt-0.5 font-medium">View booking →</div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
