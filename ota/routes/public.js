'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { createNotification } = require('../utils/notifications');

// GET /api/public/properties
router.get('/properties', (req, res) => {
  const db = getDb();
  const properties = db.prepare(`
    SELECT id, name, slug, type, address, country, currency, timezone,
           contact_email, contact_phone, domain
    FROM properties ORDER BY name
  `).all();
  return res.json(properties);
});

// GET /api/public/properties/:slug
router.get('/properties/:slug', (req, res) => {
  const db = getDb();
  const property = db.prepare(`
    SELECT id, name, slug, type, address, country, currency, timezone,
           contact_email, contact_phone, domain, tax_label, tax_rate
    FROM properties WHERE slug = ?
  `).get(req.params.slug);

  if (!property) {
    return res.status(404).json({ error: 'Property not found' });
  }

  const roomTypes = db.prepare(`
    SELECT id, name, description, max_occupancy, base_rate, currency,
           amenities_json, image_urls_json
    FROM room_types WHERE property_id = ? ORDER BY name
  `).all(property.id);

  return res.json({ ...property, room_types: roomTypes });
});

// GET /api/public/availability?property_id=&room_type_id=&check_in=&check_out=
router.get('/availability', (req, res) => {
  const { property_id, room_type_id, check_in, check_out } = req.query;
  if (!property_id || !check_in || !check_out) {
    return res.status(400).json({ error: 'property_id, check_in and check_out are required' });
  }

  const db = getDb();

  let roomQuery = `SELECT r.* FROM rooms r WHERE r.property_id = ? AND r.status != 'maintenance'`;
  const queryParams = [property_id];

  if (room_type_id) {
    roomQuery += ` AND r.room_type_id = ?`;
    queryParams.push(room_type_id);
  }

  const rooms = db.prepare(roomQuery).all(...queryParams);

  const availableRooms = rooms.filter(room => {
    // Check for overlapping bookings
    const bookingConflict = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ?
        AND status NOT IN ('cancelled','no_show')
        AND check_in < ?
        AND check_out > ?
    `).get(room.id, check_out, check_in);

    if (bookingConflict) return false;

    // Check for availability blocks
    const blockConflict = db.prepare(`
      SELECT id FROM availability_blocks
      WHERE room_id = ?
        AND start_date < ?
        AND end_date > ?
    `).get(room.id, check_out, check_in);

    return !blockConflict;
  });

  return res.json({
    available: availableRooms.length > 0,
    rooms: availableRooms
  });
});

// POST /api/public/bookings
router.post('/bookings', (req, res) => {
  const {
    guest: guestData,
    room_type_id, room_id, property_id,
    check_in, check_out,
    adults, children, special_requests
  } = req.body;

  // Validate required fields
  if (!guestData || !room_type_id || !property_id || !check_in || !check_out || !adults) {
    return res.status(400).json({ error: 'Missing required fields: guest, room_type_id, property_id, check_in, check_out, adults' });
  }
  if (!guestData.first_name || !guestData.last_name || !guestData.email) {
    return res.status(400).json({ error: 'Guest must have first_name, last_name and email' });
  }

  const db = getDb();

  const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(property_id);
  if (!property) return res.status(400).json({ error: 'Property not found' });

  const roomType = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(room_type_id);
  if (!roomType) return res.status(400).json({ error: 'Room type not found' });

  // Determine which room to use
  let targetRoomId = room_id || null;

  if (targetRoomId) {
    // Validate specified room availability
    const bookingConflict = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ? AND status NOT IN ('cancelled','no_show')
        AND check_in < ? AND check_out > ?
    `).get(targetRoomId, check_out, check_in);

    if (bookingConflict) {
      return res.status(409).json({ error: 'Room not available for selected dates' });
    }

    const blockConflict = db.prepare(`
      SELECT id FROM availability_blocks
      WHERE room_id = ? AND start_date < ? AND end_date > ?
    `).get(targetRoomId, check_out, check_in);

    if (blockConflict) {
      return res.status(409).json({ error: 'Room not available for selected dates' });
    }
  } else {
    // Find first available room of this type
    const rooms = db.prepare(`
      SELECT id FROM rooms
      WHERE property_id = ? AND room_type_id = ? AND status != 'maintenance'
    `).all(property_id, room_type_id);

    for (const room of rooms) {
      const bookingConflict = db.prepare(`
        SELECT id FROM bookings
        WHERE room_id = ? AND status NOT IN ('cancelled','no_show')
          AND check_in < ? AND check_out > ?
      `).get(room.id, check_out, check_in);

      if (bookingConflict) continue;

      const blockConflict = db.prepare(`
        SELECT id FROM availability_blocks
        WHERE room_id = ? AND start_date < ? AND end_date > ?
      `).get(room.id, check_out, check_in);

      if (!blockConflict) {
        targetRoomId = room.id;
        break;
      }
    }

    if (!targetRoomId) {
      return res.status(409).json({ error: 'No rooms available for selected dates' });
    }
  }

  // Find or create guest by email
  let guest = db.prepare(`SELECT * FROM guests WHERE email = ? LIMIT 1`).get(guestData.email);
  if (!guest) {
    const insertGuest = db.prepare(`
      INSERT INTO guests (property_id, first_name, last_name, email, phone, nationality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(property_id, guestData.first_name, guestData.last_name, guestData.email,
           guestData.phone || null, guestData.nationality || null);
    guest = db.prepare(`SELECT * FROM guests WHERE id = ?`).get(insertGuest.lastInsertRowid);
  }

  // Generate booking ref
  const maxId = db.prepare(`SELECT MAX(id) as max_id FROM bookings`).get();
  const nextNum = (maxId.max_id || 0) + 1;
  const year = new Date().getFullYear();
  const booking_ref = `BJS-${year}-${String(nextNum).padStart(5, '0')}`;

  // Calculate financials
  const checkInDate = new Date(check_in);
  const checkOutDate = new Date(check_out);
  const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));
  const checkInDay = checkInDate.getDay(); // 0=Sun

  // Look for best rate match
  const todayStr = new Date().toISOString().slice(0, 10);
  const rate = db.prepare(`
    SELECT rate_per_night FROM rates
    WHERE room_type_id = ? AND active = 1
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to >= ?)
      AND (channel = 'all' OR channel = 'ota')
      AND (min_nights IS NULL OR min_nights <= ?)
      AND (max_nights IS NULL OR max_nights >= ?)
    ORDER BY valid_from DESC LIMIT 1
  `).get(room_type_id, check_in, check_in, nights, nights);

  const roomRate = rate ? rate.rate_per_night : roomType.base_rate;
  const subtotal = roomRate * nights;
  const taxRate = property.tax_rate || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const commissionRate = property.commission_rate_percent || 15;
  const commissionAmount = total * (commissionRate / 100);
  const netToProperty = total - commissionAmount;

  // Insert booking
  const bookingInsert = db.prepare(`
    INSERT INTO bookings (
      booking_ref, source, property_id, room_id, room_type_id, guest_id,
      check_in, check_out, nights, adults, children,
      room_rate, subtotal, tax_amount, tax_rate, total_amount, currency,
      commission_rate, commission_amount, net_to_property,
      status, payment_status, special_requests
    ) VALUES (?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provisional', 'unpaid', ?)
  `).run(
    booking_ref, property_id, targetRoomId, room_type_id, guest.id,
    check_in, check_out, nights, adults, children || 0,
    roomRate, subtotal, taxAmount, taxRate, total,
    property.currency, commissionRate, commissionAmount, netToProperty,
    special_requests || null
  );

  const bookingId = bookingInsert.lastInsertRowid;

  // Insert commission record
  const dueDate = new Date(checkOutDate);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO ota_commissions (booking_id, hotel_property_id, amount, currency, status, due_date)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(bookingId, property_id, commissionAmount, property.currency, dueDateStr);

  // Create notification
  createNotification(
    db, property_id, 'new_booking',
    'New Booking',
    `New booking ${booking_ref} from ${guest.first_name} ${guest.last_name} for ${check_in} to ${check_out}`,
    bookingId, 'booking'
  );

  return res.status(201).json({
    booking_ref,
    booking_id: bookingId,
    total_amount: total
  });
});

// GET /api/public/bookings/:ref?email=
router.get('/bookings/:ref', (req, res) => {
  const db = getDb();
  const { ref } = req.params;
  const { email } = req.query;

  const booking = db.prepare(`
    SELECT b.*, g.first_name, g.last_name, g.email as guest_email,
           g.phone, rt.name as room_type_name, p.name as property_name,
           p.currency as property_currency
    FROM bookings b
    JOIN guests g ON g.id = b.guest_id
    JOIN room_types rt ON rt.id = b.room_type_id
    JOIN properties p ON p.id = b.property_id
    WHERE b.booking_ref = ?
  `).get(ref);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // If email provided, verify it matches
  if (email && booking.guest_email.toLowerCase() !== email.toLowerCase()) {
    return res.status(403).json({ error: 'Email does not match booking' });
  }

  const payments = db.prepare(`
    SELECT amount, method, status, payment_date FROM payments
    WHERE booking_id = ? ORDER BY payment_date DESC
  `).all(booking.id);

  return res.json({
    booking: {
      booking_ref: booking.booking_ref,
      status: booking.status,
      payment_status: booking.payment_status,
      check_in: booking.check_in,
      check_out: booking.check_out,
      nights: booking.nights,
      adults: booking.adults,
      children: booking.children,
      room_type_name: booking.room_type_name,
      property_name: booking.property_name,
      total_amount: booking.total_amount,
      currency: booking.property_currency,
      special_requests: booking.special_requests,
      guest: {
        first_name: booking.first_name,
        last_name: booking.last_name,
        email: booking.guest_email,
        phone: booking.phone
      },
      payments
    }
  });
});

module.exports = router;
