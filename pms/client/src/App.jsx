import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { PropertyProvider } from './contexts/PropertyContext.jsx';
import DashboardLayout from './components/DashboardLayout.jsx';

import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/dashboard/Dashboard.jsx';
import Calendar from './pages/dashboard/Calendar.jsx';
import Bookings from './pages/dashboard/Bookings.jsx';
import NewBooking from './pages/dashboard/NewBooking.jsx';
import BookingDetail from './pages/dashboard/BookingDetail.jsx';
import Guests from './pages/dashboard/Guests.jsx';
import GuestProfile from './pages/dashboard/GuestProfile.jsx';
import Invoices from './pages/dashboard/Invoices.jsx';
import Rates from './pages/dashboard/Rates.jsx';
import Availability from './pages/dashboard/Availability.jsx';
import Reports from './pages/dashboard/Reports.jsx';
import Settings from './pages/dashboard/Settings.jsx';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-primary">
      <div className="text-white/70 text-sm animate-pulse">Loading...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <PropertyProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/calendar" element={<Calendar />} />
                <Route path="/dashboard/bookings" element={<Bookings />} />
                <Route path="/dashboard/bookings/new" element={<NewBooking />} />
                <Route path="/dashboard/bookings/:id" element={<BookingDetail />} />
                <Route path="/dashboard/guests" element={<Guests />} />
                <Route path="/dashboard/guests/:id" element={<GuestProfile />} />
                <Route path="/dashboard/invoices" element={<Invoices />} />
                <Route path="/dashboard/rates" element={<Rates />} />
                <Route path="/dashboard/availability" element={<Availability />} />
                <Route path="/dashboard/reports" element={<Reports />} />
                <Route path="/dashboard/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </PropertyProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
