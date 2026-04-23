'use strict';
const crypto = require('crypto');

function formatIcalDate(dateStr) {
  // dateStr is YYYY-MM-DD, convert to YYYYMMDD for iCal all-day format
  return dateStr.replace(/-/g, '');
}

function formatIcalDateTime(isoStr) {
  // Convert ISO datetime to iCal format: YYYYMMDDTHHmmssZ
  return isoStr.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace(' ', 'T');
}

function escapeIcal(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function generateIcal(db, roomId) {
  const propertyId = parseInt(process.env.PROPERTY_ID, 10);

  // Verify room belongs to this property
  const room = db.prepare(`
    SELECT r.id, r.room_number, rt.name as room_type_name, p.name as property_name
    FROM rooms r
    JOIN properties p ON p.id = r.property_id
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = ? AND r.property_id = ?
  `).get(roomId, propertyId);

  if (!room) return null;

  // Get bookings for this room
  const bookings = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.status,
           b.adults, b.children, b.special_requests, b.created_at,
           g.first_name, g.last_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE b.room_id = ? AND b.property_id = ?
      AND b.status NOT IN ('cancelled','no_show')
    ORDER BY b.check_in
  `).all(roomId, propertyId);

  // Get availability blocks for this room
  const blocks = db.prepare(`
    SELECT id, start_date, end_date, reason, notes, created_at
    FROM availability_blocks
    WHERE room_id = ? AND property_id = ?
    ORDER BY start_date
  `).all(roomId, propertyId);

  const now = formatIcalDateTime(new Date().toISOString());
  const calName = escapeIcal(`${room.property_name} - ${room.room_type_name || ''} Room ${room.room_number}`);

  let lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BJS Hospitality PMS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
    'X-WR-TIMEZONE:UTC'
  ];

  // Add booking events
  for (const b of bookings) {
    const uid = `booking-${b.id}-${b.booking_ref}@bjs-pms`;
    const guestName = b.first_name ? `${b.first_name} ${b.last_name}` : 'Guest';
    const summary = `BOOKED: ${guestName} [${b.booking_ref}]`;
    const description = [
      `Booking Ref: ${b.booking_ref}`,
      `Guest: ${guestName}`,
      `Guests: ${b.adults} adult(s)${b.children > 0 ? `, ${b.children} child(ren)` : ''}`,
      `Status: ${b.status}`,
      b.special_requests ? `Requests: ${b.special_requests}` : ''
    ].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(b.check_in)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(b.check_out)}`);
    lines.push(`SUMMARY:${escapeIcal(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcal(description)}`);
    lines.push(`STATUS:${b.status === 'confirmed' || b.status === 'checked_in' ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push('END:VEVENT');
  }

  // Add block events
  for (const blk of blocks) {
    const uid = `block-${blk.id}-room${roomId}@bjs-pms`;
    const summary = `BLOCKED: ${blk.reason.replace('_', ' ').toUpperCase()}`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcalDate(blk.start_date)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcalDate(blk.end_date)}`);
    lines.push(`SUMMARY:${escapeIcal(summary)}`);
    if (blk.notes) lines.push(`DESCRIPTION:${escapeIcal(blk.notes)}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

/**
 * Parse a VCALENDAR string and extract VEVENT blocks as objects.
 */
function parseIcal(icalText) {
  const events = [];
  const lines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let inEvent = false;
  let current = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      events.push(current);
      current = {};
      continue;
    }

    if (!inEvent) continue;

    // Handle property parameters (e.g. DTSTART;VALUE=DATE:20240101)
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = keyPart.split(';')[0].toUpperCase();

    switch (key) {
      case 'UID': current.uid = value; break;
      case 'SUMMARY': current.summary = value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';'); break;
      case 'DESCRIPTION': current.description = value.replace(/\\n/g, '\n'); break;
      case 'DTSTART': current.dtstart = parseDateValue(value); break;
      case 'DTEND': current.dtend = parseDateValue(value); break;
      case 'STATUS': current.status = value; break;
    }
  }

  return events;
}

function parseDateValue(val) {
  // Handles YYYYMMDD and YYYYMMDDTHHmmssZ
  if (!val) return null;
  if (val.length === 8) {
    // All-day: YYYYMMDD
    return `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
  }
  // DateTime: YYYYMMDDTHHmmssZ
  const d = new Date(val.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    '$1-$2-$3T$4:$5:$6'
  ));
  return d.toISOString().slice(0, 10);
}

module.exports = { generateIcal, parseIcal };
