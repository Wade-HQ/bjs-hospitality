import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchNotifs = () => {
      api.get('/api/notifications?read=false')
        .then(res => {
          const data = res.data;
          setUnreadCount(Array.isArray(data) ? data.length : (data.count ?? 0));
        })
        .catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

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
            {/* Bell */}
            <div className="relative">
              <button className="text-gray-500 hover:text-gray-700 relative">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
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
