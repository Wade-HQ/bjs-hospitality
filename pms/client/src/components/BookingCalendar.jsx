import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/index.js';
import StatusBadge from './StatusBadge.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const STATUS_COLORS = {
  provisional: '#F59E0B',
  confirmed: '#3B82F6',
  checked_in: '#22C55E',
  checked_out: '#9CA3AF',
  cancelled: '#EF4444',
};

const STATUS_TEXT_COLORS = {
  provisional: '#fff',
  confirmed: '#fff',
  checked_in: '#fff',
  checked_out: '#374151',
  cancelled: '#fff',
};

function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b - a) / msPerDay);
}

function toDateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function BookingCalendar({ mode = 'booking', onNewBooking }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomType, setSelectedRoomType] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newBookingModal, setNewBookingModal] = useState(null); // { room, date }
  const [actionLoading, setActionLoading] = useState(false);

  const startDate = viewMode === 'month'
    ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    : (() => {
        const d = toDateOnly(currentDate);
        const day = d.getDay();
        d.setDate(d.getDate() - day);
        return d;
      })();

  const numDays = viewMode === 'month'
    ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
    : 7;

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + numDays - 1);

  const days = Array.from({ length: numDays }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d;
  });

  const filteredRooms = selectedRoomType
    ? rooms.filter(r => String(r.room_type_id) === String(selectedRoomType))
    : rooms;

  // Group rooms by type
  const groupedRooms = roomTypes.reduce((acc, rt) => {
    const rms = filteredRooms.filter(r => r.room_type_id === rt.id);
    if (rms.length > 0) acc.push({ type: rt, rooms: rms });
    return acc;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [roomsRes, roomTypesRes, bookingsRes] = await Promise.all([
        api.get('/api/rooms'),
        api.get('/api/room-types'),
        api.get(`/api/bookings?from=${formatDate(startDate)}&to=${formatDate(endDate)}`),
      ]);
      setRooms(roomsRes.data || []);
      setRoomTypes(roomTypesRes.data || []);
      setBookings(bookingsRes.data || []);

      if (mode === 'availability') {
        try {
          const blocksRes = await api.get(`/api/availability/blocks?from=${formatDate(startDate)}&to=${formatDate(endDate)}`);
          setBlocks(blocksRes.data || []);
        } catch (_) {}
      }
    } catch (err) {
      addToast('Failed to load calendar data', 'error');
    } finally {
      setLoading(false);
    }
  }, [startDate.toDateString(), endDate.toDateString(), mode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prev = () => {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    } else {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
    }
  };

  const next = () => {
    if (viewMode === 'month') {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    } else {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
    }
  };

  const goToday = () => setCurrentDate(new Date());

  const getBookingsForRoom = (roomId) =>
    bookings.filter(b => b.room_id === roomId && b.status !== 'cancelled');

  const getBlocksForRoom = (roomId) =>
    blocks.filter(b => b.room_id === roomId || b.applies_all);

  // For a given room and day index, find if a booking starts on that day
  const getBookingStartingOnDay = (roomId, dayDate) => {
    const d = formatDate(dayDate);
    return getBookingsForRoom(roomId).filter(b => {
      const ci = b.check_in?.slice(0, 10);
      return ci === d;
    });
  };

  const getBlockStartingOnDay = (roomId, dayDate) => {
    const d = formatDate(dayDate);
    return getBlocksForRoom(roomId).filter(b => {
      const start = b.start_date?.slice(0, 10);
      return start === d;
    });
  };

  // Compute bar width (in day units) for a booking
  const getBarDays = (booking) => {
    const ci = parseDate(booking.check_in);
    const co = parseDate(booking.check_out);
    if (!ci || !co) return 1;
    const clampedStart = ci < startDate ? startDate : ci;
    const clampedEnd = co > endDate ? new Date(endDate.getTime() + 86400000) : co;
    return Math.max(1, daysBetween(clampedStart, clampedEnd));
  };

  const getBarOffset = (booking) => {
    const ci = parseDate(booking.check_in);
    if (!ci || ci < startDate) return 0;
    return daysBetween(startDate, ci);
  };

  const getBlockBarDays = (block) => {
    const s = parseDate(block.start_date);
    const e = parseDate(block.end_date);
    if (!s || !e) return 1;
    const clampedStart = s < startDate ? startDate : s;
    const clampedEnd = e > endDate ? new Date(endDate.getTime() + 86400000) : new Date(e.getTime() + 86400000);
    return Math.max(1, daysBetween(clampedStart, clampedEnd));
  };

  const getBlockBarOffset = (block) => {
    const s = parseDate(block.start_date);
    if (!s || s < startDate) return 0;
    return daysBetween(startDate, s);
  };

  const handleBookingClick = async (bookingId) => {
    try {
      const res = await api.get(`/api/bookings/${bookingId}`);
      setSelectedBooking(res.data);
      setSidebarOpen(true);
    } catch (_) {
      addToast('Failed to load booking', 'error');
    }
  };

  const handleCellClick = (room, date) => {
    if (mode === 'availability') {
      onNewBooking && onNewBooking({ room, date });
      return;
    }
    if (onNewBooking) {
      onNewBooking({ room, date });
    } else {
      navigate(`/dashboard/bookings/new?room_id=${room.id}&check_in=${formatDate(date)}`);
    }
  };

  const handleCheckIn = async () => {
    if (!selectedBooking) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/bookings/${selectedBooking.id}/check-in`);
      addToast('Checked in successfully');
      setSidebarOpen(false);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Check-in failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!selectedBooking) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/bookings/${selectedBooking.id}/check-out`);
      addToast('Checked out successfully');
      setSidebarOpen(false);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Check-out failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedBooking) return;
    if (!window.confirm('Cancel this booking?')) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/bookings/${selectedBooking.id}/cancel`);
      addToast('Booking cancelled');
      setSidebarOpen(false);
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Cancel failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const today = toDateOnly(new Date());
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const headerTitle = viewMode === 'month'
    ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : `Week of ${startDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const COL_WIDTH = 80; // px per day column
  const ROW_HEIGHT = 40; // px per room row
  const ROOM_COL_WIDTH = 140; // px for room label column

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={prev} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          &#8249; Prev
        </button>
        <button onClick={goToday} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Today
        </button>
        <button onClick={next} className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors">
          Next &#8250;
        </button>
        <span className="text-base font-semibold text-primary">{headerTitle}</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selectedRoomType}
            onChange={e => setSelectedRoomType(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal"
          >
            <option value="">All Room Types</option>
            {roomTypes.map(rt => (
              <option key={rt.id} value={rt.id}>{rt.name}</option>
            ))}
          </select>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'month' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-sm transition-colors ${viewMode === 'week' ? 'bg-primary text-white' : 'hover:bg-gray-50'}`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-gray-600 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
        {mode === 'availability' && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gray-400" />
            <span className="text-gray-600">Blocked</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Loading calendar...
        </div>
      ) : (
        <div className="flex-1 overflow-auto border border-gray-200 rounded-lg">
          <div style={{ minWidth: ROOM_COL_WIDTH + COL_WIDTH * numDays }}>
            {/* Date header row */}
            <div className="flex sticky top-0 z-20 bg-primary border-b border-gray-700">
              <div
                className="flex-shrink-0 flex items-center justify-center text-xs font-semibold text-white/70 border-r border-gray-700"
                style={{ width: ROOM_COL_WIDTH, height: 40 }}
              >
                Room
              </div>
              {days.map((day, i) => {
                const isToday = formatDate(day) === formatDate(today);
                return (
                  <div
                    key={i}
                    className={`flex-shrink-0 flex flex-col items-center justify-center text-xs border-r border-gray-700 ${isToday ? 'bg-gold' : ''}`}
                    style={{ width: COL_WIDTH, height: 40 }}
                  >
                    <span className="text-white/70">{DAY_NAMES[day.getDay()]}</span>
                    <span className="text-white font-semibold">{day.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {/* Room rows */}
            {groupedRooms.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">No rooms found</div>
            ) : (
              groupedRooms.map(({ type, rooms: typeRooms }) => (
                <React.Fragment key={type.id}>
                  {/* Room type header */}
                  <div className="flex bg-gray-100 border-b border-gray-200">
                    <div
                      className="flex-shrink-0 flex items-center px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200"
                      style={{ width: ROOM_COL_WIDTH, height: 28 }}
                    >
                      {type.name}
                    </div>
                    {days.map((_, i) => (
                      <div
                        key={i}
                        className="flex-shrink-0 border-r border-gray-200"
                        style={{ width: COL_WIDTH, height: 28 }}
                      />
                    ))}
                  </div>

                  {/* Room rows */}
                  {typeRooms.map(room => {
                    const roomBookings = getBookingsForRoom(room.id);
                    const roomBlocks = getBlocksForRoom(room.id);

                    // Only render bookings/blocks that START within our view
                    const visibleBookings = roomBookings.filter(b => {
                      const ci = parseDate(b.check_in);
                      const co = parseDate(b.check_out);
                      return ci && co && ci <= endDate && co >= startDate;
                    });

                    const visibleBlocks = roomBlocks.filter(bl => {
                      const s = parseDate(bl.start_date);
                      const e = parseDate(bl.end_date);
                      return s && e && s <= endDate && e >= startDate;
                    });

                    return (
                      <div
                        key={room.id}
                        className="flex relative border-b border-gray-100"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* Room label */}
                        <div
                          className="flex-shrink-0 sticky left-0 z-10 flex items-center px-3 text-sm font-medium text-gray-700 bg-white border-r border-gray-200"
                          style={{ width: ROOM_COL_WIDTH }}
                        >
                          {room.room_number || room.name}
                        </div>

                        {/* Day cells */}
                        {days.map((day, dayIdx) => {
                          const isToday = formatDate(day) === formatDate(today);
                          return (
                            <div
                              key={dayIdx}
                              onClick={() => handleCellClick(room, day)}
                              className={`flex-shrink-0 border-r border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}
                              style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                            />
                          );
                        })}

                        {/* Booking bars — absolutely positioned over cells */}
                        {visibleBookings.map(booking => {
                          const offset = getBarOffset(booking);
                          const barDays = getBarDays(booking);
                          const color = STATUS_COLORS[booking.status] || '#9CA3AF';
                          const textColor = STATUS_TEXT_COLORS[booking.status] || '#fff';
                          const left = ROOM_COL_WIDTH + offset * COL_WIDTH + 2;
                          const width = barDays * COL_WIDTH - 4;
                          return (
                            <div
                              key={booking.id}
                              onClick={(e) => { e.stopPropagation(); handleBookingClick(booking.id); }}
                              style={{
                                position: 'absolute',
                                left,
                                width,
                                top: 6,
                                height: ROW_HEIGHT - 12,
                                backgroundColor: color,
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: 6,
                                paddingRight: 6,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                zIndex: 5,
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }}
                              title={`${booking.guest_name} — ${booking.check_in?.slice(0,10)} to ${booking.check_out?.slice(0,10)}`}
                            >
                              <span style={{ color: textColor, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {booking.guest_name}
                              </span>
                            </div>
                          );
                        })}

                        {/* Block bars */}
                        {visibleBlocks.map(block => {
                          const offset = getBlockBarOffset(block);
                          const barDays = getBlockBarDays(block);
                          const left = ROOM_COL_WIDTH + offset * COL_WIDTH + 2;
                          const width = barDays * COL_WIDTH - 4;
                          return (
                            <div
                              key={block.id}
                              onClick={(e) => { e.stopPropagation(); onNewBooking && onNewBooking({ block }); }}
                              style={{
                                position: 'absolute',
                                left,
                                width,
                                top: 6,
                                height: ROW_HEIGHT - 12,
                                backgroundColor: '#9CA3AF',
                                borderRadius: 4,
                                display: 'flex',
                                alignItems: 'center',
                                paddingLeft: 6,
                                paddingRight: 6,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                zIndex: 5,
                              }}
                              title={`Blocked: ${block.reason || 'No reason'}`}
                            >
                              <span style={{ color: '#374151', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {block.reason || 'Blocked'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      )}

      {/* Booking Detail Sidebar */}
      {sidebarOpen && selectedBooking && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-primary text-white">
              <h3 className="font-semibold">Booking Detail</h3>
              <button onClick={() => setSidebarOpen(false)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <div className="text-xl font-semibold text-primary">{selectedBooking.guest_name}</div>
                <div className="text-sm text-gray-500 mt-1">Room {selectedBooking.room_number || selectedBooking.room_name}</div>
              </div>

              <StatusBadge status={selectedBooking.status} />

              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Check-in</span>
                  <span className="font-medium">{selectedBooking.check_in?.slice(0,10)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Check-out</span>
                  <span className="font-medium">{selectedBooking.check_out?.slice(0,10)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nights</span>
                  <span className="font-medium">{selectedBooking.nights || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Adults</span>
                  <span className="font-medium">{selectedBooking.adults ?? '—'}</span>
                </div>
                {selectedBooking.children > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Children</span>
                    <span className="font-medium">{selectedBooking.children}</span>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-medium">{selectedBooking.currency} {Number(selectedBooking.total_amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Paid</span>
                  <span className="font-medium text-green-600">{selectedBooking.currency} {Number(selectedBooking.amount_paid || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-700 font-medium">Balance Due</span>
                  <span className={`font-semibold ${Number(selectedBooking.balance_due) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {selectedBooking.currency} {Number(selectedBooking.balance_due || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              {selectedBooking.status === 'confirmed' || selectedBooking.status === 'provisional' ? (
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading}
                  className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Check In
                </button>
              ) : null}
              {selectedBooking.status === 'checked_in' ? (
                <button
                  onClick={handleCheckOut}
                  disabled={actionLoading}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Check Out
                </button>
              ) : null}
              <button
                onClick={() => navigate(`/dashboard/bookings/${selectedBooking.id}`)}
                className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                View Full Detail
              </button>
              {selectedBooking.status !== 'cancelled' && selectedBooking.status !== 'checked_out' && (
                <button
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="w-full py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
