import React from 'react';
import BookingCalendar from '../../components/BookingCalendar.jsx';

export default function Calendar() {
  return (
    <div className="flex flex-col h-full p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-primary">Booking Calendar</h1>
        <p className="text-sm text-gray-500 mt-1">Click an empty cell to create a booking. Click a booking bar to view details.</p>
      </div>
      <div className="flex-1 min-h-0">
        <BookingCalendar mode="booking" />
      </div>
    </div>
  );
}
