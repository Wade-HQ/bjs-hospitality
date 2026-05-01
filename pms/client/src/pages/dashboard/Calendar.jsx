import React from 'react';
import { useNavigate } from 'react-router-dom';
import BookingCalendar from '../../components/BookingCalendar.jsx';

export default function Calendar() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-primary">Booking Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Click an empty cell to create a booking. Click a booking bar to view details.</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/bookings/new')}
          className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          + New Booking
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <BookingCalendar mode="booking" />
      </div>
    </div>
  );
}
