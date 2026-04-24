'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/rooms?available=&check_in=&check_out=&room_type_id=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { available, check_in, check_out, room_type_id } = req.query;

  let query = `
    SELECT r.id, r.room_number, r.name, r.floor, r.status, r.notes,
           r.max_occupancy, r.max_adults, r.bed_config, r.bed_config_alt,
           r.show_online, r.description, r.amenities_json, r.wheelchair_accessible, r.created_at,
           rt.id as room_type_id, rt.name as room_type_name,
           COALESCE(r.max_occupancy, rt.max_occupancy) as max_occupancy,
           rt.base_rate, rt.amenities_json, rt.image_urls_json,
           COALESCE(rt.currency, p.currency) as currency
    FROM rooms r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    LEFT JOIN properties p ON p.id = r.property_id
    WHERE r.property_id = ?
  `;
  const params = [PROPERTY_ID()];

  if (room_type_id) {
    query += ' AND r.room_type_id = ?';
    params.push(room_type_id);
  }

  if (available === 'true' && check_in && check_out) {
    query += `
      AND r.status != 'maintenance'
      AND r.id NOT IN (
        SELECT DISTINCT room_id FROM bookings
        WHERE property_id = ?
          AND status NOT IN ('cancelled','no_show')
          AND check_in < ? AND check_out > ?
          AND room_id IS NOT NULL
      )
      AND r.id NOT IN (
        SELECT DISTINCT room_id FROM availability_blocks
        WHERE property_id = ?
          AND start_date < ? AND end_date > ?
      )
    `;
    params.push(PROPERTY_ID(), check_out, check_in, PROPERTY_ID(), check_out, check_in);
  }

  query += ' ORDER BY rt.name, r.room_number';

  const rooms = db.prepare(query).all(...params);
  return res.json({ rooms });
});

// PUT /api/rooms/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());

  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { status, notes, floor, room_number, name, room_type_id,
          max_occupancy, max_adults, bed_config, bed_config_alt, show_online,
          description, amenities_json, wheelchair_accessible } = req.body;

  // Validate room_type_id belongs to this property if provided
  if (room_type_id != null) {
    const rt = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
      .get(room_type_id, PROPERTY_ID());
    if (!rt) return res.status(400).json({ error: 'Invalid room_type_id for this property' });
  }

  db.prepare(`
    UPDATE rooms SET
      status         = COALESCE(?, status),
      notes          = COALESCE(?, notes),
      floor          = COALESCE(?, floor),
      room_number    = COALESCE(?, room_number),
      name           = ?,
      room_type_id   = COALESCE(?, room_type_id),
      max_occupancy  = ?,
      max_adults     = ?,
      bed_config     = ?,
      bed_config_alt = ?,
      show_online    = ?
    WHERE id = ? AND property_id = ?
  `).run(
    status || null, notes || null, floor || null, room_number || null,
    name ?? null,
    room_type_id != null ? Number(room_type_id) : null,
    max_occupancy != null ? Number(max_occupancy) : null,
    max_adults != null ? Number(max_adults) : null,
    bed_config ?? null,
    bed_config_alt ?? null,
    show_online != null ? (show_online ? 1 : 0) : null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare(`
    SELECT r.*, rt.name as room_type_name, rt.base_rate,
           COALESCE(r.max_occupancy, rt.max_occupancy) as effective_max_occupancy
    FROM rooms r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = ?
  `).get(req.params.id);

  return res.json({ room: updated });
});

// POST /api/rooms (create new room)
router.post('/', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const { room_number, name, room_type_id, floor, status = 'available', notes,
          max_occupancy, max_adults, bed_config, bed_config_alt, show_online = 1 } = req.body;

  const displayName = name || room_number;
  if (!displayName) return res.status(400).json({ error: 'room name is required' });

  // Verify room_type belongs to this property
  if (room_type_id) {
    const rt = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
      .get(room_type_id, PROPERTY_ID());
    if (!rt) return res.status(400).json({ error: 'Invalid room_type_id for this property' });
  }

  const result = db.prepare(`
    INSERT INTO rooms
      (property_id, room_number, name, room_type_id, floor, status, notes,
       max_occupancy, max_adults, bed_config, bed_config_alt, show_online)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    PROPERTY_ID(), displayName, name || null, room_type_id || null, floor || null, status, notes || null,
    max_occupancy != null ? Number(max_occupancy) : null,
    max_adults != null ? Number(max_adults) : null,
    bed_config || null, bed_config_alt || null, show_online ? 1 : 0
  );

  const room = db.prepare(`
    SELECT r.*, rt.name as room_type_name, rt.base_rate,
           COALESCE(r.max_occupancy, rt.max_occupancy) as effective_max_occupancy
    FROM rooms r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({ room });
});

// DELETE /api/rooms/:id
router.delete('/:id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());

  if (!room) return res.status(404).json({ error: 'Room not found' });

  // Check for active bookings
  const activeBooking = db.prepare(`
    SELECT id FROM bookings
    WHERE room_id = ? AND property_id = ? AND status NOT IN ('cancelled','checked_out','no_show')
  `).get(req.params.id, PROPERTY_ID());

  if (activeBooking) {
    return res.status(409).json({ error: 'Cannot delete room with active bookings' });
  }

  db.prepare('DELETE FROM rooms WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
