'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/room-types
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const types = db.prepare(`
    SELECT rt.*,
      (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id AND r.property_id = ?) as room_count
    FROM room_types rt
    WHERE rt.property_id = ?
    ORDER BY rt.name
  `).all(PROPERTY_ID(), PROPERTY_ID());
  return res.json({ room_types: types });
});

// GET /api/room-types/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const type = db.prepare('SELECT * FROM room_types WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!type) return res.status(404).json({ error: 'Room type not found' });

  const rooms = db.prepare('SELECT * FROM rooms WHERE room_type_id = ? AND property_id = ? ORDER BY room_number')
    .all(req.params.id, PROPERTY_ID());

  return res.json({ room_type: type, rooms });
});

// POST /api/room-types
router.post('/', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const {
    name, description, max_occupancy = 2, base_rate = 0,
    currency, amenities_json, image_urls_json
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const property = db.prepare('SELECT currency FROM properties WHERE id = ?').get(PROPERTY_ID());

  const result = db.prepare(`
    INSERT INTO room_types (
      property_id, name, description, max_occupancy, base_rate,
      currency, amenities_json, image_urls_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    PROPERTY_ID(), name.trim(), description || null,
    parseInt(max_occupancy), parseFloat(base_rate),
    currency || (property ? property.currency : 'USD'),
    amenities_json || '[]', image_urls_json || '[]'
  );

  // Auto-create rate rows for both regions
  const insertRate = db.prepare(`
    INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person)
    VALUES (?, ?, ?)
  `);
  insertRate.run(result.lastInsertRowid, 'international', parseFloat(base_rate) || 0);
  insertRate.run(result.lastInsertRowid, 'sadc', parseFloat(base_rate) || 0);

  const type = db.prepare('SELECT * FROM room_types WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ room_type: type });
});

// PUT /api/room-types/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Room type not found' });

  const {
    name, description, max_occupancy, base_rate,
    currency, amenities_json, image_urls_json
  } = req.body;

  db.prepare(`
    UPDATE room_types SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      max_occupancy = COALESCE(?, max_occupancy),
      base_rate = COALESCE(?, base_rate),
      currency = COALESCE(?, currency),
      amenities_json = COALESCE(?, amenities_json),
      image_urls_json = COALESCE(?, image_urls_json)
    WHERE id = ? AND property_id = ?
  `).run(
    name ? name.trim() : null,
    description !== undefined ? description : null,
    max_occupancy ? parseInt(max_occupancy) : null,
    base_rate !== undefined ? parseFloat(base_rate) : null,
    currency || null,
    amenities_json || null,
    image_urls_json || null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM room_types WHERE id = ?').get(req.params.id);
  return res.json({ room_type: updated });
});

// DEPRECATED: room_type_rates table dropped in rates-rebuild migration
// Use /api/rates/base instead
router.get('/:id/rates', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Legacy rates endpoint removed — use /api/rates/base instead' });
});
router.put('/:id/rates/:region', requireAuth, (req, res) => {
  res.status(410).json({ error: 'Legacy rates endpoint removed — use /api/rates/base instead' });
});

// DELETE /api/room-types/:id
router.delete('/:id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Room type not found' });

  // Null out room_type_id on any rooms that reference this type before deleting
  db.prepare('UPDATE rooms SET room_type_id = NULL WHERE room_type_id = ? AND property_id = ?')
    .run(req.params.id, PROPERTY_ID());

  db.prepare('DELETE FROM room_types WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
