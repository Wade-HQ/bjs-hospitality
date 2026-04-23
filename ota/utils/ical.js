'use strict';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toIcalDate(dateStr) {
  // Convert YYYY-MM-DD to YYYYMMDD
  return dateStr.replace(/-/g, '').slice(0, 8);
}

function escapeIcalText(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateIcal(db, roomId) {
  const bookings = db.prepare(`
    SELECT b.booking_ref, b.check_in, b.check_out, b.guest_id,
           g.first_name, g.last_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE b.room_id = ? AND b.status IN ('confirmed', 'checked_in')
    ORDER BY b.check_in
  `).all(roomId);

  const now = new Date();
  const dtstamp = now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) + 'T' +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) + 'Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Blue Jungle Solutions//BJS OTA//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Room ' + roomId + ' Bookings',
  ];

  for (const b of bookings) {
    const lastName = b.last_name || 'Guest';
    const summary = escapeIcalText(lastName + ' - ' + b.booking_ref);
    const uid = b.booking_ref + '@bluejungle.solutions';
    const dtstart = toIcalDate(b.check_in);
    const dtend = toIcalDate(b.check_out);

    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid);
    lines.push('DTSTAMP:' + dtstamp);
    lines.push('DTSTART;VALUE=DATE:' + dtstart);
    lines.push('DTEND;VALUE=DATE:' + dtend);
    lines.push('SUMMARY:' + summary);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

module.exports = { generateIcal };
