'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/commissions?hotel_property_id=&status=&page=
router.get('/', (req, res) => {
  const { hotel_property_id, status, page = 1, limit = 50 } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (hotel_property_id) { conditions.push('c.hotel_property_id = ?'); params.push(hotel_property_id); }
  if (status) { conditions.push('c.status = ?'); params.push(status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM ota_commissions c ${where}`).get(...params).count;

  const commissions = db.prepare(`
    SELECT c.*,
           b.booking_ref, b.check_in, b.check_out,
           g.first_name, g.last_name,
           hp.name as hotel_property_name
    FROM ota_commissions c
    LEFT JOIN bookings b ON b.id = c.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN properties hp ON hp.id = c.hotel_property_id
    ${where}
    ORDER BY c.due_date ASC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  return res.json({ commissions, total, page: parseInt(page), limit: parseInt(limit) });
});

// PUT /api/commissions/:id — mark as paid
router.put('/:id', (req, res) => {
  const { paid_date, payment_ref, notes } = req.body;
  const db = getDb();

  const commission = db.prepare(`SELECT * FROM ota_commissions WHERE id = ?`).get(req.params.id);
  if (!commission) return res.status(404).json({ error: 'Commission not found' });

  db.prepare(`
    UPDATE ota_commissions
    SET status = 'paid', paid_date = ?, payment_ref = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(paid_date || new Date().toISOString().slice(0, 10), payment_ref || null, notes || null, req.params.id);

  const updated = db.prepare(`SELECT * FROM ota_commissions WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// GET /api/commissions/summary?property_id=&month=
router.get('/summary', (req, res) => {
  const { property_id, month } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];

  if (property_id) { conditions.push('c.hotel_property_id = ?'); params.push(property_id); }
  if (month) {
    // month format: YYYY-MM
    conditions.push(`strftime('%Y-%m', c.due_date) = ?`);
    params.push(month);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const summary = db.prepare(`
    SELECT
      c.status,
      COUNT(*) as count,
      SUM(c.amount) as total_amount,
      c.currency
    FROM ota_commissions c
    ${where}
    GROUP BY c.status, c.currency
    ORDER BY c.status
  `).all(...params);

  const overall = db.prepare(`
    SELECT
      COUNT(*) as total_count,
      COALESCE(SUM(c.amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN c.status = 'paid' THEN c.amount ELSE 0 END), 0) as paid_amount,
      COALESCE(SUM(CASE WHEN c.status != 'paid' THEN c.amount ELSE 0 END), 0) as outstanding_amount
    FROM ota_commissions c
    ${where}
  `).get(...params);

  return res.json({ summary, overall });
});

module.exports = router;
