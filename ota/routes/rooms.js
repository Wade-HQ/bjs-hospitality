'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/rooms?property_id=&available=&check_in=&check_out=
router.get('/', (req, res) => {
  const { property_id, available, check_in, check_out } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];

  if (property_id) {
    conditions.push('r.property_id = ?');
    params.push(property_id);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rooms = db.prepare(`
    SELECT r.*, rt.name as room_type_name, rt.max_occupancy, rt.base_rate
    FROM rooms r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    ${where}
    ORDER BY r.room_number
  `).all(...params);

  if (available === 'true' && check_in && check_out) {
    const filtered = rooms.filter(room => {
      const bookingConflict = db.prepare(`
        SELECT id FROM bookings
        WHERE room_id = ? AND status NOT IN ('cancelled','no_show')
          AND check_in < ? AND check_out > ?
      `).get(room.id, check_out, check_in);

      if (bookingConflict) return false;

      const blockConflict = db.prepare(`
        SELECT id FROM availability_blocks
        WHERE room_id = ? AND start_date < ? AND end_date > ?
      `).get(room.id, check_out, check_in);

      return !blockConflict;
    });
    return res.json(filtered);
  }

  return res.json(rooms);
});

// PUT /api/rooms/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const room = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { status, notes } = req.body;
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  db.prepare(`UPDATE rooms SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

module.exports = router;
