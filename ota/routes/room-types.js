'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/room-types?property_id=
router.get('/', (req, res) => {
  const { property_id } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (property_id) { conditions.push('property_id = ?'); params.push(property_id); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const roomTypes = db.prepare(`SELECT * FROM room_types ${where} ORDER BY name`).all(...params);
  return res.json(roomTypes);
});

// GET /api/room-types/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const roomType = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(req.params.id);
  if (!roomType) return res.status(404).json({ error: 'Room type not found' });
  return res.json(roomType);
});

// POST /api/room-types
router.post('/', (req, res) => {
  const { property_id, name, description, max_occupancy, base_rate, currency, amenities_json, image_urls_json } = req.body;
  if (!property_id || !name) return res.status(400).json({ error: 'property_id and name are required' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO room_types (property_id, name, description, max_occupancy, base_rate, currency, amenities_json, image_urls_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    property_id, name, description || null,
    max_occupancy || 2, base_rate || 0, currency || null,
    amenities_json ? JSON.stringify(amenities_json) : '[]',
    image_urls_json ? JSON.stringify(image_urls_json) : '[]'
  );

  const roomType = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(result.lastInsertRowid);
  return res.status(201).json(roomType);
});

// PUT /api/room-types/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const roomType = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(req.params.id);
  if (!roomType) return res.status(404).json({ error: 'Room type not found' });

  const allowedFields = ['name', 'description', 'max_occupancy', 'base_rate', 'currency', 'amenities_json', 'image_urls_json'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = (field === 'amenities_json' || field === 'image_urls_json')
        ? JSON.stringify(req.body[field])
        : req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE room_types SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// DELETE /api/room-types/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const roomType = db.prepare(`SELECT * FROM room_types WHERE id = ?`).get(req.params.id);
  if (!roomType) return res.status(404).json({ error: 'Room type not found' });

  db.prepare(`DELETE FROM room_types WHERE id = ?`).run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
