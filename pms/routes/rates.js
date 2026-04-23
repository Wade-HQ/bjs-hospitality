'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/rates?room_type_id=&active=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { room_type_id, active } = req.query;

  let query = `
    SELECT r.*, rt.name as room_type_name
    FROM rates r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.property_id = ?
  `;
  const params = [PROPERTY_ID()];

  if (room_type_id) { query += ' AND r.room_type_id = ?'; params.push(room_type_id); }
  if (active !== undefined) { query += ' AND r.active = ?'; params.push(active === 'true' ? 1 : 0); }

  query += ' ORDER BY rt.name, r.valid_from DESC';

  const rates = db.prepare(query).all(...params);
  return res.json({ rates });
});

// GET /api/rates/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const rate = db.prepare(`
    SELECT r.*, rt.name as room_type_name
    FROM rates r
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE r.id = ? AND r.property_id = ?
  `).get(req.params.id, PROPERTY_ID());

  if (!rate) return res.status(404).json({ error: 'Rate not found' });
  return res.json({ rate });
});

// POST /api/rates
router.post('/', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const {
    room_type_id, name, rate_per_night, currency,
    valid_from, valid_to, min_nights = 1, max_nights,
    days_of_week_json, channel = 'all', active = 1
  } = req.body;

  if (!name || !rate_per_night) {
    return res.status(400).json({ error: 'name and rate_per_night are required' });
  }

  if (room_type_id) {
    const rt = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
      .get(room_type_id, PROPERTY_ID());
    if (!rt) return res.status(400).json({ error: 'Invalid room_type_id' });
  }

  const property = db.prepare('SELECT currency FROM properties WHERE id = ?').get(PROPERTY_ID());

  const result = db.prepare(`
    INSERT INTO rates (
      property_id, room_type_id, name, rate_per_night, currency,
      valid_from, valid_to, min_nights, max_nights,
      days_of_week_json, channel, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    PROPERTY_ID(), room_type_id || null, name.trim(),
    parseFloat(rate_per_night),
    currency || (property ? property.currency : 'USD'),
    valid_from || null, valid_to || null,
    parseInt(min_nights), max_nights ? parseInt(max_nights) : null,
    days_of_week_json || '[0,1,2,3,4,5,6]',
    channel, active ? 1 : 0
  );

  const rate = db.prepare('SELECT * FROM rates WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ rate });
});

// PUT /api/rates/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM rates WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Rate not found' });

  const {
    room_type_id, name, rate_per_night, currency,
    valid_from, valid_to, min_nights, max_nights,
    days_of_week_json, channel, active
  } = req.body;

  db.prepare(`
    UPDATE rates SET
      room_type_id = COALESCE(?, room_type_id),
      name = COALESCE(?, name),
      rate_per_night = COALESCE(?, rate_per_night),
      currency = COALESCE(?, currency),
      valid_from = COALESCE(?, valid_from),
      valid_to = COALESCE(?, valid_to),
      min_nights = COALESCE(?, min_nights),
      max_nights = COALESCE(?, max_nights),
      days_of_week_json = COALESCE(?, days_of_week_json),
      channel = COALESCE(?, channel),
      active = COALESCE(?, active)
    WHERE id = ? AND property_id = ?
  `).run(
    room_type_id || null,
    name ? name.trim() : null,
    rate_per_night !== undefined ? parseFloat(rate_per_night) : null,
    currency || null,
    valid_from !== undefined ? valid_from : null,
    valid_to !== undefined ? valid_to : null,
    min_nights ? parseInt(min_nights) : null,
    max_nights !== undefined ? (max_nights ? parseInt(max_nights) : null) : null,
    days_of_week_json || null,
    channel || null,
    active !== undefined ? (active ? 1 : 0) : null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM rates WHERE id = ?').get(req.params.id);
  return res.json({ rate: updated });
});

// DELETE /api/rates/:id
router.delete('/:id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM rates WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Rate not found' });

  db.prepare('DELETE FROM rates WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
