import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ToastProvider } from './contexts/ToastContext.jsx';

// Layout
import DashboardLayout from './components/DashboardLayout.jsx';

// Public pages
import Home from './pages/Home.jsx';
import Properties from './pages/Properties.jsx';
import PropertyDetail from './pages/PropertyDetail.jsx';
import BookingConfirm from './pages/BookingConfirm.jsx';
import BookingLookup from './pages/BookingLookup.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';

// Dashboard pages
import Dashboard from './pages/dashboard/Dashboard.jsx';
import Bookings from './pages/dashboard/Bookings.jsx';
import BookingDetail from './pages/dashboard/BookingDetail.jsx';
import PropertiesDash from './pages/dashboard/Properties.jsx';
import Commissions from './pages/dashboard/Commissions.jsx';
import Invoices from './pages/dashboard/Invoices.jsx';
import Reports from './pages/dashboard/Reports.jsx';
import GoogleHotels from './pages/dashboard/GoogleHotels.jsx';
import ChannelSync from './pages/dashboard/ChannelSync.jsx';
import Users from './pages/dashboard/Users.jsx';
import Settings from './pages/dashboard/Settings.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-gold rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/" element={<Home />} />
            <Route path="/properties" element={<Properties />} />
            <Route path="/properties/:slug" element={<PropertyDetail />} />
            <Route path="/booking/confirm" element={<BookingConfirm />} />
            <Route path="/booking/lookup" element={<BookingLookup />} />
            <Route path="/booking/:ref" element={<BookingLookup />} />
            <Route path="/login" element={<Login />} />

            {/* Dashboard (protected) */}
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <DashboardLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="bookings/:id" element={<BookingDetail />} />
              <Route path="properties" element={<PropertiesDash />} />
              <Route path="commissions" element={<Commissions />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="reports" element={<Reports />} />
              <Route path="google-hotels" element={<GoogleHotels />} />
              <Route path="channel-sync" element={<ChannelSync />} />
              <Route path="users" element={<Users />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
