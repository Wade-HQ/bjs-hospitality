import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/index.js';
import { useToast } from '../contexts/ToastContext.jsx';

function StarRating({ count = 5 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="text-gold text-lg">★</span>
      ))}
    </div>
  );
}

function Calendar({ bookedDates, selectedStart, selectedEnd, onSelectDate }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();

  const toStr = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const isBooked = (dateStr) => bookedDates.includes(dateStr);
  const isSelected = (dateStr) => {
    if (selectedStart && selectedEnd) {
      return dateStr >= selectedStart && dateStr <= selectedEnd;
    }
    return dateStr === selectedStart;
  };
  const isStart = (dateStr) => dateStr === selectedStart;
  const isEnd = (dateStr) => dateStr === selectedEnd;
  const isPast = (dateStr) => dateStr < new Date().toISOString().slice(0, 10);

  const prevMonth = () => {
    setViewDate(v => {
      if (v.month === 0) return { year: v.year - 1, month: 11 };
      return { ...v, month: v.month - 1 };
    });
  };
  const nextMonth = () => {
    setViewDate(v => {
      if (v.month === 11) return { year: v.year + 1, month: 0 };
      return { ...v, month: v.month + 1 };
    });
  };

  const monthName = new Date(viewDate.year, viewDate.month).toLocaleString('default', { month: 'long' });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 select-none">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg text-gray-600">‹</button>
        <span className="font-semibold text-primary">{monthName} {viewDate.year}</span>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg text-gray-600">›</button>
      </div>
      <div className="grid grid-cols-7 mb-2">
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = toStr(viewDate.year, viewDate.month, day);
          const booked = isBooked(dateStr);
          const past = isPast(dateStr);
          const sel = isSelected(dateStr);
          const start = isStart(dateStr);
          const end = isEnd(dateStr);
          return (
            <button
              key={day}
              disabled={booked || past}
              onClick={() => !booked && !past && onSelectDate(dateStr)}
              className={`
                text-xs py-1.5 rounded-lg font-medium transition-colors
                ${booked ? 'bg-red-100 text-red-400 cursor-not-allowed line-through' : ''}
                ${past && !booked ? 'text-gray-300 cursor-not-allowed' : ''}
                ${sel && !booked && !past ? 'bg-gold/20 text-primary' : ''}
                ${(start || end) && !booked && !past ? 'bg-gold text-white' : ''}
                ${!booked && !past && !sel ? 'hover:bg-gray-100 text-gray-700' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gold inline-block"/><span>Selected</span></div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"/><span>Booked</span></div>
      </div>
    </div>
  );
}

export default function PropertyDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const bookingFormRef = useRef(null);

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookedDates, setBookedDates] = useState([]);
  const [selectedStart, setSelectedStart] = useState('');
  const [selectedEnd, setSelectedEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    room_type_id: '',
    check_in: '',
    check_out: '',
    adults: 2,
    children: 0,
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    nationality: '',
    special_requests: '',
  });

  useEffect(() => {
    api.get(`/api/public/properties/${slug}`)
      .then(res => {
        setProperty(res.data);
        if (res.data?.room_types?.length > 0) {
          setForm(f => ({ ...f, room_type_id: res.data.room_types[0].id }));
        }
      })
      .catch(() => setError('Property not found.'))
      .finally(() => setLoading(false));

    api.get(`/api/public/availability?slug=${slug}`)
      .then(res => setBookedDates(res.data?.booked_dates || res.data || []))
      .catch(() => {});
  }, [slug]);

  const handleDateSelect = (dateStr) => {
    if (!selectedStart || (selectedStart && selectedEnd)) {
      setSelectedStart(dateStr);
      setSelectedEnd('');
      setForm(f => ({ ...f, check_in: dateStr, check_out: '' }));
    } else {
      if (dateStr > selectedStart) {
        setSelectedEnd(dateStr);
        setForm(f => ({ ...f, check_out: dateStr }));
      } else {
        setSelectedStart(dateStr);
        setSelectedEnd('');
        setForm(f => ({ ...f, check_in: dateStr, check_out: '' }));
      }
    }
  };

  const handleBookNow = (roomTypeId) => {
    setForm(f => ({ ...f, room_type_id: roomTypeId }));
    bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.check_in || !form.check_out) {
      addToast('Please select check-in and check-out dates.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/api/public/bookings', {
        ...form,
        property_id: property.id,
        property_slug: slug,
      });
      const ref = res.data?.booking_ref || res.data?.ref;
      navigate(`/booking/confirm?ref=${ref}`);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to submit booking. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-400">Loading property...</div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🏕️</div>
          <p className="text-gray-600 text-lg">{error || 'Property not found'}</p>
          <Link to="/properties" className="mt-4 inline-block text-teal hover:underline">← Back to Properties</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-primary py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6 text-white/50 text-sm">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link to="/properties" className="hover:text-white transition-colors">Properties</Link>
            <span>/</span>
            <span className="text-white">{property.name}</span>
          </div>
          <StarRating />
          <h1 className="text-4xl font-bold text-white mt-2 mb-2">{property.name}</h1>
          <div className="flex items-center gap-2 text-white/60 text-sm">
            <span>📍</span>
            <span>{property.country}</span>
            {property.property_type && (
              <>
                <span>·</span>
                <span className="bg-gold/20 text-gold text-xs px-2 py-0.5 rounded-full">{property.property_type}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-primary mb-3">About this property</h2>
              <p className="text-gray-600 leading-relaxed">
                {property.description || 'Nestled in the heart of the African wilderness, this exceptional property offers an unparalleled safari experience. Surrounded by pristine natural landscapes, guests enjoy world-class hospitality while connecting with nature at its finest.'}
              </p>
            </div>

            {/* Room Types */}
            <div>
              <h2 className="text-lg font-semibold text-primary mb-4">Available Rooms & Suites</h2>
              {property.room_types?.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">No room types available</div>
              ) : (
                <div className="space-y-4">
                  {property.room_types?.map(rt => (
                    <div key={rt.id} className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-primary text-base">{rt.name}</h3>
                          <p className="text-gray-500 text-sm mt-1">Max occupancy: {rt.max_occupancy} guests</p>
                          {rt.description && <p className="text-gray-600 text-sm mt-2">{rt.description}</p>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-primary font-bold text-xl">
                            {property.currency || 'ZAR'} {Number(rt.base_rate).toLocaleString()}
                          </div>
                          <div className="text-gray-400 text-xs">/night</div>
                          <button
                            onClick={() => handleBookNow(rt.id)}
                            className="mt-3 bg-gold hover:bg-gold/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Book Now
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Calendar */}
            <div>
              <h2 className="text-lg font-semibold text-primary mb-4">Availability</h2>
              <p className="text-gray-500 text-sm mb-4">Click a date to set check-in, click again to set check-out.</p>
              <Calendar
                bookedDates={bookedDates}
                selectedStart={selectedStart}
                selectedEnd={selectedEnd}
                onSelectDate={handleDateSelect}
              />
            </div>
          </div>

          {/* Booking Form */}
          <div ref={bookingFormRef}>
            <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-primary mb-5">Make a Booking</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">ROOM TYPE</label>
                  <select
                    value={form.room_type_id}
                    onChange={e => setField('room_type_id', e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                  >
                    {property.room_types?.map(rt => (
                      <option key={rt.id} value={rt.id}>{rt.name} — {property.currency || 'ZAR'} {Number(rt.base_rate).toLocaleString()}/night</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">CHECK-IN</label>
                    <input
                      type="date"
                      value={form.check_in}
                      onChange={e => { setField('check_in', e.target.value); setSelectedStart(e.target.value); }}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">CHECK-OUT</label>
                    <input
                      type="date"
                      value={form.check_out}
                      onChange={e => { setField('check_out', e.target.value); setSelectedEnd(e.target.value); }}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">ADULTS</label>
                    <input
                      type="number" min="1" max="10"
                      value={form.adults}
                      onChange={e => setField('adults', Number(e.target.value))}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">CHILDREN</label>
                    <input
                      type="number" min="0" max="10"
                      value={form.children}
                      onChange={e => setField('children', Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">FIRST NAME</label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={e => setField('first_name', e.target.value)}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">LAST NAME</label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={e => setField('last_name', e.target.value)}
                      required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">EMAIL</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">PHONE</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setField('phone', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">NATIONALITY</label>
                  <input
                    type="text"
                    value={form.nationality}
                    onChange={e => setField('nationality', e.target.value)}
                    placeholder="e.g. South African"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">SPECIAL REQUESTS</label>
                  <textarea
                    rows={3}
                    value={form.special_requests}
                    onChange={e => setField('special_requests', e.target.value)}
                    placeholder="Dietary requirements, accessibility needs, etc."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal/50 focus:border-teal resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gold hover:bg-gold/90 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {submitting ? 'Submitting...' : 'Request Booking'}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Your booking is a request. We'll confirm once payment is received.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
