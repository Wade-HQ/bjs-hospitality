'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

function recalcPaymentStatus(db, bookingId) {
  const booking = db.prepare('SELECT total_amount FROM bookings WHERE id = ? AND property_id = ?')
    .get(bookingId, PROPERTY_ID());
  if (!booking) return;

  const paid = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM booking_payments
    WHERE booking_id = ? AND property_id = ?
  `).get(bookingId, PROPERTY_ID());

  let paymentStatus = 'unpaid';
  if (paid.total >= booking.total_amount - 0.01) {
    paymentStatus = 'fully_paid';
  } else if (paid.total > 0) {
    paymentStatus = 'deposit_paid';
  }

  db.prepare('UPDATE bookings SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND property_id = ?')
    .run(paymentStatus, bookingId, PROPERTY_ID());
}

// GET /api/payments?booking_id=&page=&limit=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { booking_id, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT bp.*,
           b.booking_ref, b.total_amount as booking_total,
           g.first_name, g.last_name,
           u.name as created_by_name
    FROM booking_payments bp
    JOIN bookings b ON b.id = bp.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN users u ON u.id = bp.created_by
    WHERE bp.property_id = ?
  `;
  const params = [PROPERTY_ID()];

  if (booking_id) { query += ' AND bp.booking_id = ?'; params.push(booking_id); }

  const countRow = db.prepare(
    query.replace('SELECT bp.*,\n           b.booking_ref, b.total_amount as booking_total,\n           g.first_name, g.last_name,\n           u.name as created_by_name', 'SELECT COUNT(*) as total')
  ).get(...params);

  query += ' ORDER BY bp.payment_date DESC LIMIT ? OFFSET ?';
  const payments = db.prepare(query).all(...params, parseInt(limit), offset);

  return res.json({
    payments,
    pagination: {
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRow.total / parseInt(limit))
    }
  });
});

// GET /api/payments/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const payment = db.prepare(`
    SELECT bp.*,
           b.booking_ref, b.total_amount as booking_total, b.currency as booking_currency,
           g.first_name, g.last_name,
           u.name as created_by_name
    FROM booking_payments bp
    JOIN bookings b ON b.id = bp.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN users u ON u.id = bp.created_by
    WHERE bp.id = ? AND bp.property_id = ?
  `).get(req.params.id, PROPERTY_ID());

  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  return res.json({ payment });
});

// POST /api/payments
router.post('/', requireAuth, requireRole('owner','hotel_manager','accountant','front_desk'), (req, res) => {
  const db = getDb();
  const {
    booking_id, amount, currency, payment_method = 'bank_transfer',
    payment_date, reference, notes
  } = req.body;

  if (!booking_id || !amount || !payment_date) {
    return res.status(400).json({ error: 'booking_id, amount, and payment_date are required' });
  }

  // Verify booking belongs to this property
  const booking = db.prepare('SELECT id, currency, total_amount FROM bookings WHERE id = ? AND property_id = ?')
    .get(booking_id, PROPERTY_ID());
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const result = db.prepare(`
    INSERT INTO booking_payments (
      booking_id, property_id, amount, currency, payment_method,
      payment_date, reference, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    booking_id, PROPERTY_ID(),
    parseFloat(amount), currency || booking.currency || 'USD',
    payment_method, payment_date,
    reference || null, notes || null,
    req.user.id
  );

  recalcPaymentStatus(db, booking_id);

  const payment = db.prepare('SELECT * FROM booking_payments WHERE id = ?').get(result.lastInsertRowid);
  const updatedBooking = db.prepare('SELECT payment_status FROM bookings WHERE id = ?').get(booking_id);

  return res.status(201).json({ payment, booking_payment_status: updatedBooking.payment_status });
});

// PUT /api/payments/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM booking_payments WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Payment not found' });

  const { amount, currency, payment_method, payment_date, reference, notes } = req.body;

  db.prepare(`
    UPDATE booking_payments SET
      amount = COALESCE(?, amount),
      currency = COALESCE(?, currency),
      payment_method = COALESCE(?, payment_method),
      payment_date = COALESCE(?, payment_date),
      reference = COALESCE(?, reference),
      notes = COALESCE(?, notes)
    WHERE id = ? AND property_id = ?
  `).run(
    amount !== undefined ? parseFloat(amount) : null,
    currency || null, payment_method || null, payment_date || null,
    reference !== undefined ? reference : null,
    notes !== undefined ? notes : null,
    req.params.id, PROPERTY_ID()
  );

  recalcPaymentStatus(db, existing.booking_id);

  const updated = db.prepare('SELECT * FROM booking_payments WHERE id = ?').get(req.params.id);
  return res.json({ payment: updated });
});

// DELETE /api/payments/:id
router.delete('/:id', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM booking_payments WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Payment not found' });

  db.prepare('DELETE FROM booking_payments WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  recalcPaymentStatus(db, existing.booking_id);

  return res.json({ ok: true });
});

module.exports = router;
