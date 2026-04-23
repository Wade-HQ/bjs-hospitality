'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/google-hotels/rates?property_id=
router.get('/rates', (req, res) => {
  const { property_id } = req.query;
  if (!property_id) return res.status(400).json({ error: 'property_id is required' });

  const db = getDb();
  const rates = db.prepare(`
    SELECT ghr.*, rt.name as room_type_name
    FROM google_hotel_rates ghr
    LEFT JOIN room_types rt ON rt.id = ghr.room_type_id
    WHERE ghr.property_id = ?
    ORDER BY ghr.updated_at DESC
  `).all(property_id);

  return res.json(rates);
});

// POST /api/google-hotels/rates — upsert rate override
router.post('/rates', (req, res) => {
  const { property_id, room_type_id, display_rate, currency } = req.body;
  if (!property_id || !display_rate) {
    return res.status(400).json({ error: 'property_id and display_rate are required' });
  }

  const db = getDb();

  // Check if exists
  const existing = db.prepare(`
    SELECT id FROM google_hotel_rates WHERE property_id = ? AND room_type_id IS ?
  `).get(property_id, room_type_id || null);

  if (existing) {
    db.prepare(`
      UPDATE google_hotel_rates SET display_rate = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(display_rate, currency || null, existing.id);

    const updated = db.prepare(`SELECT * FROM google_hotel_rates WHERE id = ?`).get(existing.id);
    return res.json(updated);
  } else {
    const result = db.prepare(`
      INSERT INTO google_hotel_rates (property_id, room_type_id, display_rate, currency)
      VALUES (?, ?, ?, ?)
    `).run(property_id, room_type_id || null, display_rate, currency || null);

    const created = db.prepare(`SELECT * FROM google_hotel_rates WHERE id = ?`).get(result.lastInsertRowid);
    return res.status(201).json(created);
  }
});

// GET /api/google-hotels/status?property_id=
router.get('/status', (req, res) => {
  return res.json({
    connected: false,
    message: 'Google Hotel Ads integration not yet connected. Contact support to enable.'
  });
});

module.exports = router;
