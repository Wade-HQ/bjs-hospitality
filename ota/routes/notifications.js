'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/notifications?property_id=&read=
router.get('/', (req, res) => {
  const { property_id, read } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (property_id) { conditions.push('property_id = ?'); params.push(property_id); }
  if (read !== undefined) { conditions.push('read_flag = ?'); params.push(read === 'true' ? 1 : 0); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const notifications = db.prepare(`
    SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 100
  `).all(...params);

  return res.json(notifications);
});

// PUT /api/notifications/read-all — must be declared before /:id routes
router.put('/read-all', (req, res) => {
  const { property_id } = req.query;
  const db = getDb();

  if (property_id) {
    db.prepare(`UPDATE notifications SET read_flag = 1 WHERE property_id = ?`).run(property_id);
  } else {
    db.prepare(`UPDATE notifications SET read_flag = 1`).run();
  }

  return res.json({ ok: true });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', (req, res) => {
  const db = getDb();
  const n = db.prepare(`SELECT id FROM notifications WHERE id = ?`).get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found' });

  db.prepare(`UPDATE notifications SET read_flag = 1 WHERE id = ?`).run(req.params.id);
  return res.json({ ok: true });
});

module.exports = router;
