'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/availability?property_id=&room_id=&start=&end=
router.get('/', (req, res) => {
  const { property_id, room_id, start, end } = req.query;
  const db = getDb();

  // Return blocks + bookings for the calendar view
  const conditions = [];
  const params = [];

  const blockConditions = [];
  const blockParams = [];

  if (property_id) {
    blockConditions.push('ab.property_id = ?');
    blockParams.push(property_id);
  }
  if (room_id) {
    blockConditions.push('ab.room_id = ?');
    blockParams.push(room_id);
  }
  if (start) {
    blockConditions.push('ab.end_date >= ?');
    blockParams.push(start);
  }
  if (end) {
    blockConditions.push('ab.start_date <= ?');
    blockParams.push(end);
  }

  const blockWhere = blockConditions.length ? 'WHERE ' + blockConditions.join(' AND ') : '';

  const blocks = db.prepare(`
    SELECT ab.*, r.room_number
    FROM availability_blocks ab
    LEFT JOIN rooms r ON r.id = ab.room_id
    ${blockWhere}
    ORDER BY ab.start_date
  `).all(...blockParams);

  // Also return bookings for context
  const bookingConditions = [];
  const bookingParams = [];

  if (property_id) { bookingConditions.push('b.property_id = ?'); bookingParams.push(property_id); }
  if (room_id) { bookingConditions.push('b.room_id = ?'); bookingParams.push(room_id); }
  if (start) { bookingConditions.push('b.check_out >= ?'); bookingParams.push(start); }
  if (end) { bookingConditions.push('b.check_in <= ?'); bookingParams.push(end); }
  bookingConditions.push(`b.status NOT IN ('cancelled','no_show')`);

  const bookingWhere = bookingConditions.length ? 'WHERE ' + bookingConditions.join(' AND ') : '';

  const bookings = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.status, b.room_id,
           g.first_name, g.last_name, r.room_number
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    ${bookingWhere}
    ORDER BY b.check_in
  `).all(...bookingParams);

  return res.json({ blocks, bookings });
});

// POST /api/availability/blocks
router.post('/blocks', (req, res) => {
  const { property_id, room_id, start_date, end_date, reason, notes } = req.body;
  if (!property_id || !room_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'property_id, room_id, start_date and end_date are required' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO availability_blocks (property_id, room_id, start_date, end_date, reason, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(property_id, room_id, start_date, end_date, reason || 'blocked', notes || null);

  const block = db.prepare(`SELECT * FROM availability_blocks WHERE id = ?`).get(result.lastInsertRowid);
  return res.status(201).json(block);
});

// PUT /api/availability/blocks/:id
router.put('/blocks/:id', (req, res) => {
  const db = getDb();
  const block = db.prepare(`SELECT * FROM availability_blocks WHERE id = ?`).get(req.params.id);
  if (!block) return res.status(404).json({ error: 'Block not found' });

  const allowedFields = ['start_date', 'end_date', 'reason', 'notes', 'room_id'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE availability_blocks SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT * FROM availability_blocks WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// DELETE /api/availability/blocks/:id
router.delete('/blocks/:id', (req, res) => {
  const db = getDb();
  const block = db.prepare(`SELECT * FROM availability_blocks WHERE id = ?`).get(req.params.id);
  if (!block) return res.status(404).json({ error: 'Block not found' });

  db.prepare(`DELETE FROM availability_blocks WHERE id = ?`).run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
