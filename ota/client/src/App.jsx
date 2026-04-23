import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';
import DashboardLayout from './components/DashboardLayout.jsx';

import Home from './pages/Home.jsx';
import Properties from './pages/Properties.jsx';
import PropertyDetail from './pages/PropertyDetail.jsx';
import BookingConfirm from './pages/BookingConfirm.jsx';
import BookingLookup from './pages/BookingLookup.jsx';
import Login from './pages/Login.jsx';

import Dashboard from './pages/dashboard/Dashboard.jsx';
import Bookings from './pages/dashboard/Bookings.jsx';
import BookingDetail from './pages/dashboard/BookingDetail.jsx';
import DashboardProperties from './pages/dashboard/Properties.jsx';
import Commissions from './pages/dashboard/Commissions.jsx';
import Invoices from './pages/dashboard/Invoices.jsx';
import Reports from './pages/dashboard/Reports.jsx';
import GoogleHotels from './pages/dashboard/GoogleHotels.jsx';
import ChannelSync from './pages/dashboard/ChannelSync.jsx';
import Users from './pages/dashboard/Users.jsx';
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
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/properties/:slug" element={<PropertyDetail />} />
            <Route path="/booking/confirm/:ref" element={<BookingConfirm />} />
            <Route path="/booking/lookup" element={<BookingLookup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="bookings/:id" element={<BookingDetail />} />
              <Route path="properties" element={<DashboardProperties />} />
              <Route path="commissions" element={<Commissions />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="reports" element={<Reports />} />
              <Route path="google-hotels" element={<GoogleHotels />} />
              <Route path="channel-sync" element={<ChannelSync />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
