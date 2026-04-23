'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/commissions?status=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT oc.*,
           b.booking_ref, b.check_in, b.check_out, b.source, b.total_amount as booking_total,
           g.first_name, g.last_name,
           p_ota.name as ota_name
    FROM ota_commissions oc
    JOIN bookings b ON b.id = oc.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN properties p_ota ON p_ota.id = oc.ota_property_id
    WHERE oc.hotel_property_id = ?
  `;
  const params = [PROPERTY_ID()];

  if (status) { query += ' AND oc.status = ?'; params.push(status); }

  const countRow = db.prepare(
    query.replace(
      'SELECT oc.*,\n           b.booking_ref, b.check_in, b.check_out, b.source, b.total_amount as booking_total,\n           g.first_name, g.last_name,\n           p_ota.name as ota_name',
      'SELECT COUNT(*) as total'
    )
  ).get(...params);

  query += ' ORDER BY oc.due_date DESC LIMIT ? OFFSET ?';
  const commissions = db.prepare(query).all(...params, parseInt(limit), offset);

  return res.json({
    commissions,
    pagination: {
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRow.total / parseInt(limit))
    }
  });
});

// GET /api/commissions/summary?month= (YYYY-MM)
router.get('/summary', requireAuth, (req, res) => {
  const db = getDb();
  const { month, year } = req.query;

  let dateFilter = '';
  const params = [PROPERTY_ID()];

  if (month) {
    // month format: YYYY-MM
    dateFilter = `AND strftime('%Y-%m', b.check_out) = ?`;
    params.push(month);
  } else if (year) {
    dateFilter = `AND strftime('%Y', b.check_out) = ?`;
    params.push(String(year));
  }

  const summary = db.prepare(`
    SELECT
      oc.status,
      COUNT(*) as count,
      SUM(oc.amount) as total_amount,
      oc.currency
    FROM ota_commissions oc
    JOIN bookings b ON b.id = oc.booking_id
    WHERE oc.hotel_property_id = ? ${dateFilter}
    GROUP BY oc.status, oc.currency
    ORDER BY oc.status
  `).all(...params);

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_count,
      SUM(oc.amount) as total_amount,
      SUM(CASE WHEN oc.status = 'paid' THEN oc.amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN oc.status IN ('pending','due','overdue') THEN oc.amount ELSE 0 END) as outstanding_amount,
      oc.currency
    FROM ota_commissions oc
    JOIN bookings b ON b.id = oc.booking_id
    WHERE oc.hotel_property_id = ? ${dateFilter}
    GROUP BY oc.currency
  `).all(...params);

  return res.json({ summary, totals });
});

// PUT /api/commissions/:id (mark paid)
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const commission = db.prepare('SELECT * FROM ota_commissions WHERE id = ? AND hotel_property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!commission) return res.status(404).json({ error: 'Commission not found' });

  const { status, payment_ref, paid_date, notes } = req.body;

  const validStatuses = ['pending', 'due', 'paid', 'overdue'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const effectivePaidDate = status === 'paid'
    ? (paid_date || new Date().toISOString().slice(0, 10))
    : null;

  db.prepare(`
    UPDATE ota_commissions SET
      status = COALESCE(?, status),
      paid_date = COALESCE(?, paid_date),
      payment_ref = COALESCE(?, payment_ref),
      notes = COALESCE(?, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND hotel_property_id = ?
  `).run(
    status || null,
    effectivePaidDate,
    payment_ref || null,
    notes !== undefined ? notes : null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM ota_commissions WHERE id = ?').get(req.params.id);
  return res.json({ commission: updated });
});

module.exports = router;
