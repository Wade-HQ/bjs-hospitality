import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useProperty } from '../contexts/PropertyContext.jsx';
import api from '../api/index.js';

const PMS_HOTELS = [
  { name: 'Sky Island Resort & Safari', icon: '🏔', url: 'https://skyisland.bluejungle.solutions' },
  { name: 'Ponta Membene', icon: '🌊', url: 'https://membene.bluejungle.solutions' },
];

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard', icon: '⊞' },
  { label: 'Calendar', path: '/dashboard/calendar', icon: '📅' },
  { label: 'Bookings', path: '/dashboard/bookings', icon: '🏷' },
  { label: 'Guests', path: '/dashboard/guests', icon: '👤' },
  { label: 'Invoices', path: '/dashboard/invoices', icon: '🧾' },
  { label: 'Availability', path: '/dashboard/availability', icon: '🗓' },
  { label: 'Reports', path: '/dashboard/reports', icon: '📊' },
  { label: 'Settings', path: '/dashboard/settings', icon: '⚙' },
];

function formatDateTime(tz) {
  try {
    return new Date().toLocaleString('en-ZA', {
      timeZone: tz,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return new Date().toLocaleString();
  }
}

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { property } = useProperty();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [datetime, setDatetime] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hotelOpen, setHotelOpen] = useState(false);
  const hotelDropdownRef = useRef(null);

  const currentOrigin = window.location.origin;
  const currentHotel = PMS_HOTELS.find(h => h.url === currentOrigin) || PMS_HOTELS[0];

  const switchHotel = (hotel) => {
    setHotelOpen(false);
    if (hotel.url === currentOrigin) return;
    window.location.href = hotel.url + window.location.pathname + window.location.search;
  };

  // Close hotel dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (hotelDropdownRef.current && !hotelDropdownRef.current.contains(e.target)) {
        setHotelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const tz = property?.timezone || 'Africa/Johannesburg';
    setDatetime(formatDateTime(tz));
    const timer = setInterval(() => setDatetime(formatDateTime(tz)), 60000);
    return () => clearInterval(timer);
  }, [property?.timezone]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/api/notifications?unread=true');
      const notifications = res.data?.notifications || [];
      setNotifCount(res.data?.unread_count ?? notifications.length);
      setNotifications(notifications.slice(0, 15));
    } catch (_) {}
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

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col bg-primary text-white transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ width: 240, flexShrink: 0 }}
      >
        {/* Hotel switcher */}
        <div className="relative border-b border-white/10" ref={hotelDropdownRef}>
          <button
            onClick={() => setHotelOpen(v => !v)}
            className="w-full px-6 py-5 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-gold font-bold text-base leading-tight truncate flex items-center gap-2">
                  <span>{currentHotel.icon}</span>
                  <span>{property?.name || currentHotel.name}</span>
                </div>
                <div className="text-white/50 text-xs mt-1">Property Management</div>
              </div>
              <span className={`text-white/40 text-xs transition-transform flex-shrink-0 ${hotelOpen ? 'rotate-180' : ''}`} style={{ fontSize: '0.6rem' }}>▼</span>
            </div>
          </button>

          {hotelOpen && (
            <div className="absolute left-0 right-0 top-full z-50 bg-primary border-t border-white/10 shadow-2xl">
              {PMS_HOTELS.map(hotel => {
                const isCurrent = hotel.url === currentOrigin;
                return (
                  <button
                    key={hotel.url}
                    onClick={() => switchHotel(hotel)}
                    className={`w-full flex items-center gap-3 px-6 py-3.5 text-left transition-colors ${
                      isCurrent
                        ? 'bg-white/10 cursor-default'
                        : 'hover:bg-white/5 cursor-pointer'
                    }`}
                  >
                    <span className="text-lg">{hotel.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium leading-tight ${isCurrent ? 'text-gold' : 'text-white/80'}`}>
                        {hotel.name}
                      </div>
                      {isCurrent && (
                        <div className="text-white/40 text-xs mt-0.5">Current property</div>
                      )}
                    </div>
                    {isCurrent && <span className="ml-auto text-gold text-xs">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? 'bg-white/10 text-gold border-r-2 border-gold'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User */}
        <div className="px-6 py-4 border-t border-white/10">
          <div className="text-sm font-medium text-white">{user?.name || user?.email || 'User'}</div>
          <div className="text-xs text-white/50 mt-0.5">{user?.role || 'Staff'}</div>
          <button
            onClick={logout}
            className="mt-3 text-xs text-white/50 hover:text-white/80 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden text-gray-500 hover:text-gray-700 text-xl"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
            <div>
              <div className="text-sm font-semibold text-primary">{property?.name || ''}</div>
              <div className="text-xs text-gray-400">{datetime}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
              >
                <span className="text-lg">🔔</span>
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-primary">Notifications</span>
                    {notifCount > 0 && (
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
                          <span className="mt-0.5 text-base">{n.type === 'arrival' ? '🛬' : n.type === 'departure' ? '🛫' : n.type === 'payment' ? '💰' : n.type === 'new_booking' ? '📋' : '📌'}</span>
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

            <div className="text-sm text-gray-600 hidden sm:block">
              {user?.name || user?.email || ''}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
