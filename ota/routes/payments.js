'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

router.use(requireAuth);

// GET /api/payments?booking_id=
router.get('/', (req, res) => {
  const { booking_id } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (booking_id) { conditions.push('bp.booking_id = ?'); params.push(booking_id); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const payments = db.prepare(`
    SELECT bp.*, b.booking_ref, u.name as created_by_name
    FROM booking_payments bp
    LEFT JOIN bookings b ON b.id = bp.booking_id
    LEFT JOIN users u ON u.id = bp.created_by
    ${where}
    ORDER BY bp.payment_date DESC
  `).all(...params);

  return res.json(payments);
});

// POST /api/payments
router.post('/', (req, res) => {
  const { booking_id, amount, currency, payment_method, payment_date, reference, notes } = req.body;

  if (!booking_id || !amount || !payment_date) {
    return res.status(400).json({ error: 'booking_id, amount and payment_date are required' });
  }

  const db = getDb();
  const booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(booking_id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Insert payment
  db.prepare(`
    INSERT INTO booking_payments (booking_id, property_id, amount, currency, payment_method, payment_date, reference, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    booking_id, booking.property_id,
    parseFloat(amount), currency || booking.currency || 'USD',
    payment_method || 'bank_transfer', payment_date,
    reference || null, notes || null, req.user.id
  );

  // Recalculate payment status
  const totals = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_paid FROM booking_payments WHERE booking_id = ?
  `).get(booking_id);

  const totalPaid = totals.total_paid || 0;
  const bookingTotal = booking.total_amount || 0;
  let paymentStatus = booking.payment_status;

  if (totalPaid >= bookingTotal) {
    paymentStatus = 'fully_paid';
  } else if (bookingTotal > 0 && totalPaid >= bookingTotal * 0.5) {
    paymentStatus = 'deposit_paid';
  }

  db.prepare(`
    UPDATE bookings SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(paymentStatus, booking_id);

  if (paymentStatus === 'fully_paid' && booking.payment_status !== 'fully_paid') {
    createNotification(
      db, booking.property_id, 'payment_due',
      'Payment Fully Received',
      `Booking ${booking.booking_ref} has been fully paid. Total: ${booking.currency} ${bookingTotal.toFixed(2)}`,
      booking_id, 'booking'
    );
  }

  const payment = db.prepare(`
    SELECT * FROM booking_payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1
  `).get(booking_id);

  return res.status(201).json({
    payment,
    payment_status: paymentStatus,
    total_paid: totalPaid,
    outstanding: bookingTotal - totalPaid
  });
});

module.exports = router;
