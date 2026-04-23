'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/rates?property_id=&room_type_id=
router.get('/', (req, res) => {
  const { property_id, room_type_id } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (property_id) { conditions.push('r.property_id = ?'); params.push(property_id); }
  if (room_type_id) { conditions.push('r.room_type_id = ?'); params.push(room_type_id); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rates = db.prepare(`
    SELECT r.*, rt.name as room_type_name
    FROM rates r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    ${where}
    ORDER BY r.valid_from DESC, r.name
  `).all(...params);

  return res.json(rates);
});

// GET /api/rates/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const rate = db.prepare(`SELECT * FROM rates WHERE id = ?`).get(req.params.id);
  if (!rate) return res.status(404).json({ error: 'Rate not found' });
  return res.json(rate);
});

// POST /api/rates
router.post('/', (req, res) => {
  const {
    property_id, room_type_id, name, rate_per_night, currency,
    valid_from, valid_to, min_nights, max_nights, days_of_week_json, channel, active
  } = req.body;

  if (!property_id || !name || !rate_per_night) {
    return res.status(400).json({ error: 'property_id, name and rate_per_night are required' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO rates (property_id, room_type_id, name, rate_per_night, currency,
      valid_from, valid_to, min_nights, max_nights, days_of_week_json, channel, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    property_id, room_type_id || null, name, rate_per_night, currency || null,
    valid_from || null, valid_to || null,
    min_nights || 1, max_nights || null,
    days_of_week_json ? JSON.stringify(days_of_week_json) : '[0,1,2,3,4,5,6]',
    channel || 'all', active !== undefined ? active : 1
  );

  const rate = db.prepare(`SELECT * FROM rates WHERE id = ?`).get(result.lastInsertRowid);
  return res.status(201).json(rate);
});

// PUT /api/rates/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const rate = db.prepare(`SELECT * FROM rates WHERE id = ?`).get(req.params.id);
  if (!rate) return res.status(404).json({ error: 'Rate not found' });

  const allowedFields = [
    'name', 'rate_per_night', 'currency', 'valid_from', 'valid_to',
    'min_nights', 'max_nights', 'days_of_week_json', 'channel', 'active', 'room_type_id'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = field === 'days_of_week_json' && Array.isArray(req.body[field])
        ? JSON.stringify(req.body[field])
        : req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE rates SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT * FROM rates WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// DELETE /api/rates/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const rate = db.prepare(`SELECT * FROM rates WHERE id = ?`).get(req.params.id);
  if (!rate) return res.status(404).json({ error: 'Rate not found' });

  db.prepare(`DELETE FROM rates WHERE id = ?`).run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
