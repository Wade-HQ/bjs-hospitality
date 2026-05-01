'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/seasonal-adjustments
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const seasons = db.prepare(`
    SELECT * FROM seasonal_adjustments WHERE property_id = ? ORDER BY start_date
  `).all(PROPERTY_ID());
  return res.json({ seasonal_adjustments: seasons });
});

// POST /api/seasonal-adjustments
router.post('/', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const { name, pct_change, start_date, end_date } = req.body;
  if (!name || pct_change === undefined || !start_date || !end_date) {
    return res.status(400).json({ error: 'name, pct_change, start_date, end_date are required' });
  }
  if (new Date(end_date) <= new Date(start_date)) {
    return res.status(400).json({ error: 'end_date must be after start_date' });
  }

  const result = db.prepare(`
    INSERT INTO seasonal_adjustments (property_id, name, pct_change, start_date, end_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(PROPERTY_ID(), name.trim(), parseFloat(pct_change), start_date, end_date);

  const season = db.prepare('SELECT * FROM seasonal_adjustments WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ seasonal_adjustment: season });
});

// PUT /api/seasonal-adjustments/:id
router.put('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM seasonal_adjustments WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, pct_change, start_date, end_date } = req.body;

  db.prepare(`
    UPDATE seasonal_adjustments SET
      name = COALESCE(?, name),
      pct_change = COALESCE(?, pct_change),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(
    name ? name.trim() : null,
    pct_change !== undefined ? parseFloat(pct_change) : null,
    start_date || null,
    end_date || null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM seasonal_adjustments WHERE id = ?').get(req.params.id);
  return res.json({ seasonal_adjustment: updated });
});

// DELETE /api/seasonal-adjustments/:id
router.delete('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM seasonal_adjustments WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM seasonal_adjustments WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
