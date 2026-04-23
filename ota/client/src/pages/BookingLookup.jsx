import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/index.js';
import StatusBadge from '../components/StatusBadge.jsx';

export default function BookingLookup() {
  const [ref, setRef] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setBooking(null);
    setSearched(false);
    try {
      const res = await api.get(`/api/public/bookings/${ref}?email=${encodeURIComponent(email)}`);
      setBooking(res.data);
      setSearched(true);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('No booking found with that reference and email combination.');
      } else {
        setError('Unable to retrieve booking. Please check your details and try again.');
      }
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const fmtCurrency = (amount, currency) => {
    if (!amount) return '—';
    return `${currency || 'ZAR'} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-primary py-12 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4 text-white/50 text-sm">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <span className="text-white">Manage Booking</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Manage Your Booking</h1>
          <p className="text-white/60">Enter your booking reference and email to view your booking status</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Form */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">BOOKING REFERENCE</label>
              <input
                type="text"
                value={ref}
                onChange={e => setRef(e.target.value.toUpperCase())}
                placeholder="e.g. SSD-2024-001"
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">EMAIL ADDRESS</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="The email used when booking"
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {loading ? 'Searching...' : 'Find Booking'}
            </button>
          </form>
        </div>

        {/* Error */}
        {searched && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        {/* Booking result */}
        {booking && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-primary px-6 py-4 flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs">Booking Reference</p>
                <p className="text-gold font-bold text-xl">{booking.booking_ref}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>
            <div className="p-6 space-y-5">
              {/* Property */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">🏨</div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">PROPERTY</p>
                  <p className="text-primary font-semibold">{booking.property_name || booking.property}</p>
                  {booking.room_type_name && <p className="text-gray-500 text-sm">{booking.room_type_name}</p>}
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-teal/10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">📅</div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium">STAY DATES</p>
                  <div className="flex gap-6 mt-1">
                    <div>
                      <p className="text-xs text-gray-400">Check-in</p>
                      <p className="font-medium text-primary text-sm">{fmt(booking.check_in)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Check-out</p>
                      <p className="font-medium text-primary text-sm">{fmt(booking.check_out)}</p>
                    </div>
                    {booking.nights && (
                      <div>
                        <p className="text-xs text-gray-400">Nights</p>
                        <p className="font-medium text-primary text-sm">{booking.nights}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Guests */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-gold/10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">👥</div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">GUESTS</p>
                  <p className="text-primary text-sm mt-1">
                    {booking.adults || 0} adult{(booking.adults || 0) !== 1 ? 's' : ''}
                    {booking.children > 0 ? `, ${booking.children} child${booking.children !== 1 ? 'ren' : ''}` : ''}
                  </p>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">💳</div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">PAYMENT</p>
                  <div className="flex items-center gap-3 mt-1">
                    <StatusBadge status={booking.payment_status} />
                    {booking.total_amount && (
                      <span className="text-primary font-semibold text-sm">{fmtCurrency(booking.total_amount, booking.currency)}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Guest name */}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">👤</div>
                <div>
                  <p className="text-xs text-gray-400 font-medium">GUEST</p>
                  <p className="text-primary font-medium text-sm mt-1">
                    {[booking.first_name, booking.last_name].filter(Boolean).join(' ') || '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                Questions about your booking? Email us at{' '}
                <a href="mailto:office@sunsafaridestinations.co.za" className="text-teal hover:underline">
                  office@sunsafaridestinations.co.za
                </a>
              </p>
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <Link to="/" className="text-teal hover:underline text-sm">← Back to Homepage</Link>
        </div>
      </div>
    </div>
  );
}
