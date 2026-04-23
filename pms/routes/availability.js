'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/availability?room_id=&start=&end=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { room_id, start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end dates are required' });
  }

  let bookingsQuery = `
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.status,
           b.room_id, b.room_type_id,
           g.first_name, g.last_name,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ?
      AND b.status NOT IN ('cancelled','no_show')
      AND b.check_in < ? AND b.check_out > ?
  `;
  const bookingParams = [PROPERTY_ID(), end, start];

  let blocksQuery = `
    SELECT ab.id, ab.room_id, ab.start_date, ab.end_date, ab.reason, ab.notes,
           r.room_number, rt.name as room_type_name
    FROM availability_blocks ab
    JOIN rooms r ON r.id = ab.room_id
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE ab.property_id = ?
      AND ab.start_date < ? AND ab.end_date > ?
  `;
  const blockParams = [PROPERTY_ID(), end, start];

  if (room_id) {
    bookingsQuery += ' AND b.room_id = ?';
    bookingParams.push(room_id);
    blocksQuery += ' AND ab.room_id = ?';
    blockParams.push(room_id);
  }

  bookingsQuery += ' ORDER BY b.check_in';
  blocksQuery += ' ORDER BY ab.start_date';

  const bookings = db.prepare(bookingsQuery).all(...bookingParams);
  const blocks = db.prepare(blocksQuery).all(...blockParams);

  return res.json({ bookings, blocks });
});

// GET /api/availability/blocks
router.get('/blocks', requireAuth, (req, res) => {
  const db = getDb();
  const blocks = db.prepare(`
    SELECT ab.id, ab.room_id, ab.start_date, ab.end_date, ab.reason, ab.notes, ab.created_at,
           r.room_number, rt.name as room_type_name
    FROM availability_blocks ab
    JOIN rooms r ON r.id = ab.room_id
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE ab.property_id = ?
    ORDER BY ab.start_date DESC
  `).all(PROPERTY_ID());
  return res.json({ blocks });
});

// POST /api/availability/blocks
router.post('/blocks', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const {
    room_id, start_date, end_date,
    reason = 'blocked', notes,
    apply_to_room_type = false
  } = req.body;

  if (!room_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'room_id, start_date, and end_date are required' });
  }

  if (end_date <= start_date) {
    return res.status(400).json({ error: 'end_date must be after start_date' });
  }

  // Verify room belongs to this property
  const room = db.prepare('SELECT id, room_type_id FROM rooms WHERE id = ? AND property_id = ?')
    .get(room_id, PROPERTY_ID());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const validReasons = ['maintenance', 'owner', 'blocked', 'channel_sync'];
  if (!validReasons.includes(reason)) {
    return res.status(400).json({ error: `Invalid reason. Must be one of: ${validReasons.join(', ')}` });
  }

  const createdBlocks = [];

  if (apply_to_room_type && room.room_type_id) {
    // Create blocks for all rooms of same room_type at this property
    const rooms = db.prepare(`
      SELECT id FROM rooms WHERE room_type_id = ? AND property_id = ?
    `).all(room.room_type_id, PROPERTY_ID());

    for (const r of rooms) {
      const result = db.prepare(`
        INSERT INTO availability_blocks (property_id, room_id, start_date, end_date, reason, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(PROPERTY_ID(), r.id, start_date, end_date, reason, notes || null);
      createdBlocks.push(db.prepare('SELECT * FROM availability_blocks WHERE id = ?').get(result.lastInsertRowid));
    }
  } else {
    const result = db.prepare(`
      INSERT INTO availability_blocks (property_id, room_id, start_date, end_date, reason, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(PROPERTY_ID(), room_id, start_date, end_date, reason, notes || null);
    createdBlocks.push(db.prepare('SELECT * FROM availability_blocks WHERE id = ?').get(result.lastInsertRowid));
  }

  return res.status(201).json({ blocks: createdBlocks });
});

// PUT /api/availability/blocks/:id
router.put('/blocks/:id', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const block = db.prepare('SELECT id FROM availability_blocks WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!block) return res.status(404).json({ error: 'Block not found' });

  const { start_date, end_date, reason, notes } = req.body;

  if (start_date && end_date && end_date <= start_date) {
    return res.status(400).json({ error: 'end_date must be after start_date' });
  }

  db.prepare(`
    UPDATE availability_blocks SET
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      reason = COALESCE(?, reason),
      notes = COALESCE(?, notes)
    WHERE id = ? AND property_id = ?
  `).run(
    start_date || null, end_date || null,
    reason || null, notes !== undefined ? notes : null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM availability_blocks WHERE id = ?').get(req.params.id);
  return res.json({ block: updated });
});

// DELETE /api/availability/blocks/:id
router.delete('/blocks/:id', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const block = db.prepare('SELECT id FROM availability_blocks WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!block) return res.status(404).json({ error: 'Block not found' });

  db.prepare('DELETE FROM availability_blocks WHERE id = ? AND property_id = ?')
    .run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
