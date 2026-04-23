'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/users — owner/ota_admin only
router.get('/', requireRole('owner', 'ota_admin'), (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT id, name, email, role, property_access_json, active, force_password_change, created_at
    FROM users ORDER BY name
  `).all();
  return res.json(users);
});

// POST /api/users — owner/ota_admin only
router.post('/', requireRole('owner', 'ota_admin'), (req, res) => {
  const { name, email, password, role, property_access_json, active } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  const db = getDb();

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.trim().toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const hash = bcrypt.hashSync(password, 12);

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, property_access_json, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    email.trim().toLowerCase(),
    hash,
    role || 'front_desk',
    property_access_json ? JSON.stringify(property_access_json) : '[]',
    active !== undefined ? active : 1
  );

  const user = db.prepare(`
    SELECT id, name, email, role, property_access_json, active, created_at FROM users WHERE id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json(user);
});

// PUT /api/users/:id — owner/ota_admin only
router.put('/:id', requireRole('owner', 'ota_admin'), (req, res) => {
  const db = getDb();
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const allowedFields = ['name', 'email', 'role', 'property_access_json', 'active', 'force_password_change'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = field === 'property_access_json' && Array.isArray(req.body[field])
        ? JSON.stringify(req.body[field])
        : req.body[field];
    }
  }

  // Handle password change separately
  if (req.body.password) {
    updates.password_hash = bcrypt.hashSync(req.body.password, 12);
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`
    SELECT id, name, email, role, property_access_json, active, force_password_change, created_at FROM users WHERE id = ?
  `).get(req.params.id);
  return res.json(updated);
});

// DELETE /api/users/:id — owner/ota_admin only (deactivate)
router.delete('/:id', requireRole('owner', 'ota_admin'), (req, res) => {
  const db = getDb();
  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent self-deactivation
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  db.prepare(`UPDATE users SET active = 0 WHERE id = ?`).run(req.params.id);
  // Invalidate all sessions for this user
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(req.params.id);

  return res.json({ ok: true });
});

module.exports = router;
