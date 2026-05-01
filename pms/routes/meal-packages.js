'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/meal-packages
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const packages = db.prepare(`
    SELECT * FROM meal_packages WHERE property_id = ? ORDER BY sort_order, name
  `).all(PROPERTY_ID());
  return res.json({ meal_packages: packages });
});

// POST /api/meal-packages
router.post('/', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const { name, price_per_person = 0, is_online = 1, is_sto = 1, is_agent = 1, is_ota = 1, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO meal_packages (property_id, name, price_per_person, is_online, is_sto, is_agent, is_ota, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(PROPERTY_ID(), name.trim(), parseFloat(price_per_person), is_online ? 1 : 0, is_sto ? 1 : 0, is_agent ? 1 : 0, is_ota ? 1 : 0, parseInt(sort_order));

  const pkg = db.prepare('SELECT * FROM meal_packages WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ meal_package: pkg });
});

// PUT /api/meal-packages/:id
router.put('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM meal_packages WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, price_per_person, is_online, is_sto, is_agent, is_ota, sort_order } = req.body;

  db.prepare(`
    UPDATE meal_packages SET
      name = COALESCE(?, name),
      price_per_person = COALESCE(?, price_per_person),
      is_online = COALESCE(?, is_online),
      is_sto = COALESCE(?, is_sto),
      is_agent = COALESCE(?, is_agent),
      is_ota = COALESCE(?, is_ota),
      sort_order = COALESCE(?, sort_order),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(
    name ? name.trim() : null,
    price_per_person !== undefined ? parseFloat(price_per_person) : null,
    is_online !== undefined ? (is_online ? 1 : 0) : null,
    is_sto !== undefined ? (is_sto ? 1 : 0) : null,
    is_agent !== undefined ? (is_agent ? 1 : 0) : null,
    is_ota !== undefined ? (is_ota ? 1 : 0) : null,
    sort_order !== undefined ? parseInt(sort_order) : null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM meal_packages WHERE id = ?').get(req.params.id);
  return res.json({ meal_package: updated });
});

// DELETE /api/meal-packages/:id
router.delete('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM meal_packages WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM meal_packages WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
