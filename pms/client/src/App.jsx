import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import { PropertyProvider } from './contexts/PropertyContext.jsx';
import DashboardLayout from './components/DashboardLayout.jsx';

import Login from './pages/Login.jsx';
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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="text-gray-500">Loading…</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <PropertyProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<Navigate to="/dashboard" replace />} />
              </Route>
              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="bookings" element={<Bookings />} />
                <Route path="bookings/new" element={<NewBooking />} />
                <Route path="bookings/:id" element={<BookingDetail />} />
                <Route path="guests" element={<Guests />} />
                <Route path="guests/:id" element={<GuestProfile />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="rates" element={<Rates />} />
                <Route path="availability" element={<Availability />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </PropertyProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
