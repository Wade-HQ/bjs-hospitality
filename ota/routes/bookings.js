'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendBookingCancellation } = require('../utils/email');

router.use(requireAuth);

// GET /api/bookings
router.get('/', (req, res) => {
  const { property_id, status, from, to, source, page = 1, limit = 50 } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];

  if (property_id) { conditions.push('b.property_id = ?'); params.push(property_id); }
  if (status) { conditions.push('b.status = ?'); params.push(status); }
  if (from) { conditions.push('b.check_in >= ?'); params.push(from); }
  if (to) { conditions.push('b.check_in <= ?'); params.push(to); }
  if (source) { conditions.push('b.source = ?'); params.push(source); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM bookings b ${where}
  `).get(...params).count;

  const bookings = db.prepare(`
    SELECT b.*,
           g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
           r.room_number, rt.name as room_type_name,
           p.name as property_name, p.currency as property_currency
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN properties p ON p.id = b.property_id
    ${where}
    ORDER BY b.check_in DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  return res.json({ bookings, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/bookings/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const booking = db.prepare(`
    SELECT b.*,
           g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
           g.nationality, g.id_type, g.id_number, g.address as guest_address,
           r.room_number, r.floor, rt.name as room_type_name, rt.amenities_json,
           p.name as property_name, p.currency as property_currency,
           p.tax_label, p.tax_rate as property_tax_rate
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN properties p ON p.id = b.property_id
    WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const payments = db.prepare(`SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY payment_date`).all(booking.id);
  const invoice = db.prepare(`SELECT * FROM invoices WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1`).get(booking.id);
  const commission = db.prepare(`SELECT * FROM ota_commissions WHERE booking_id = ? LIMIT 1`).get(booking.id);

  return res.json({ ...booking, payments, invoice, commission });
});

// POST /api/bookings
router.post('/', (req, res) => {
  const {
    guest_id, room_type_id, room_id, property_id, source = 'direct',
    check_in, check_out, adults, children = 0, special_requests, internal_notes,
    channel_booking_ref
  } = req.body;

  if (!guest_id || !room_type_id || !property_id || !check_in || !check_out || !adults) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = getDb();
  const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(property_id);
  if (!property) return res.status(400).json({ error: 'Property not found' });

  const roomType = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(room_type_id);
  if (!roomType) return res.status(400).json({ error: 'Room type not found' });

  // Check availability if room specified
  if (room_id) {
    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE room_id = ? AND status NOT IN ('cancelled','no_show')
        AND check_in < ? AND check_out > ?
    `).get(room_id, check_out, check_in);
    if (conflict) return res.status(409).json({ error: 'Room not available for selected dates' });

    const blockConflict = db.prepare(`
      SELECT id FROM availability_blocks WHERE room_id = ? AND start_date < ? AND end_date > ?
    `).get(room_id, check_out, check_in);
    if (blockConflict) return res.status(409).json({ error: 'Room has a block for selected dates' });
  }

  const checkInDate = new Date(check_in);
  const checkOutDate = new Date(check_out);
  const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));

  const rateRow = db.prepare(`
    SELECT rate_per_night FROM rates
    WHERE room_type_id = ? AND active = 1
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to >= ?)
    ORDER BY valid_from DESC LIMIT 1
  `).get(room_type_id, check_in, check_in);

  const roomRate = rateRow ? rateRow.rate_per_night : roomType.base_rate;
  const subtotal = roomRate * nights;
  const taxRate = property.tax_rate || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const commissionRate = property.commission_rate_percent || 15;
  const commissionAmount = total * (commissionRate / 100);
  const netToProperty = total - commissionAmount;

  const maxId = db.prepare(`SELECT MAX(id) as max_id FROM bookings`).get();
  const nextNum = (maxId.max_id || 0) + 1;
  const year = new Date().getFullYear();
  const booking_ref = `BJS-${year}-${String(nextNum).padStart(5, '0')}`;

  const result = db.prepare(`
    INSERT INTO bookings (
      booking_ref, source, property_id, room_id, room_type_id, guest_id,
      check_in, check_out, nights, adults, children,
      room_rate, subtotal, tax_amount, tax_rate, total_amount, currency,
      commission_rate, commission_amount, net_to_property,
      status, payment_status, special_requests, internal_notes, channel_booking_ref
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'provisional', 'unpaid', ?, ?, ?)
  `).run(
    booking_ref, source, property_id, room_id || null, room_type_id, guest_id,
    check_in, check_out, nights, adults, children,
    roomRate, subtotal, taxAmount, taxRate, total,
    property.currency, commissionRate, commissionAmount, netToProperty,
    special_requests || null, internal_notes || null, channel_booking_ref || null
  );

  const bookingId = result.lastInsertRowid;

  const dueDate = new Date(checkOutDate);
  dueDate.setDate(dueDate.getDate() + 30);
  db.prepare(`
    INSERT INTO ota_commissions (booking_id, hotel_property_id, amount, currency, status, due_date)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(bookingId, property_id, commissionAmount, property.currency, dueDate.toISOString().slice(0, 10));

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, new_value)
    VALUES (?, ?, 'created', ?)
  `).run(bookingId, req.user.id, JSON.stringify({ booking_ref, status: 'provisional' }));

  createNotification(db, property_id, 'new_booking', 'New Booking',
    `Booking ${booking_ref} created`, bookingId, 'booking');

  return res.status(201).json({ booking_ref, booking_id: bookingId, total_amount: total });
});

// PUT /api/bookings/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const allowedFields = [
    'room_id', 'room_type_id', 'check_in', 'check_out', 'adults', 'children',
    'room_rate', 'extras_json', 'discount_amount', 'special_requests',
    'internal_notes', 'status', 'payment_status', 'channel_booking_ref', 'source'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  db.prepare(`UPDATE bookings SET ${setClauses} WHERE id = ?`).run(...values);

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'updated', ?, ?)
  `).run(booking.id, req.user.id, JSON.stringify(booking), JSON.stringify(updates));

  const updated = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// DELETE /api/bookings/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  db.prepare(`
    UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(req.params.id);

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'cancelled', ?, 'cancelled')
  `).run(booking.id, req.user.id, booking.status);

  createNotification(db, booking.property_id, 'cancellation',
    'Booking Cancelled', `Booking ${booking.booking_ref} has been cancelled`, booking.id, 'booking');

  return res.json({ ok: true });
});

// POST /api/bookings/:id/check-in
router.post('/:id/check-in', (req, res) => {
  const db = getDb();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.status === 'checked_in') return res.status(400).json({ error: 'Already checked in' });

  db.prepare(`
    UPDATE bookings SET status = 'checked_in', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(booking.id);

  if (booking.room_id) {
    db.prepare(`UPDATE rooms SET status = 'occupied' WHERE id = ?`).run(booking.room_id);
  }

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'check_in', ?, 'checked_in')
  `).run(booking.id, req.user.id, booking.status);

  createNotification(db, booking.property_id, 'check_in_today',
    'Guest Checked In', `Booking ${booking.booking_ref} — guest has checked in`, booking.id, 'booking');

  return res.json({ ok: true, status: 'checked_in' });
});

// POST /api/bookings/:id/check-out
router.post('/:id/check-out', (req, res) => {
  const db = getDb();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Check for outstanding balance
  const payments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_paid FROM booking_payments WHERE booking_id = ?
  `).get(booking.id);
  const outstandingBalance = booking.total_amount - (payments.total_paid || 0);

  db.prepare(`
    UPDATE bookings SET status = 'checked_out', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(booking.id);

  if (booking.room_id) {
    db.prepare(`UPDATE rooms SET status = 'available' WHERE id = ?`).run(booking.room_id);
  }

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'check_out', ?, 'checked_out')
  `).run(booking.id, req.user.id, booking.status);

  createNotification(db, booking.property_id, 'check_out_today',
    'Guest Checked Out', `Booking ${booking.booking_ref} — guest has checked out`, booking.id, 'booking');

  return res.json({ ok: true, status: 'checked_out', outstanding_balance: outstandingBalance });
});

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', (req, res) => {
  const db = getDb();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { reason } = req.body;

  db.prepare(`
    UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(booking.id);

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'cancelled', ?, ?)
  `).run(booking.id, req.user.id, booking.status, reason || 'cancelled');

  createNotification(db, booking.property_id, 'cancellation',
    'Booking Cancelled', `Booking ${booking.booking_ref} cancelled${reason ? ': ' + reason : ''}`,
    booking.id, 'booking');

  return res.json({ ok: true, status: 'cancelled' });
});

module.exports = router;
