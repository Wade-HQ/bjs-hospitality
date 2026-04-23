'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/notifications?unread=&type=&limit=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { unread, type, limit = 50, page = 1 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT * FROM notifications WHERE property_id = ?
  `;
  const params = [PROPERTY_ID()];

  if (unread === 'true') { query += ' AND read_flag = 0'; }
  if (type) { query += ' AND type = ?'; params.push(type); }

  const countRow = db.prepare(
    query.replace('SELECT *', 'SELECT COUNT(*) as total')
  ).get(...params);

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  const notifications = db.prepare(query).all(...params, parseInt(limit), offset);

  const unreadCount = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE property_id = ? AND read_flag = 0')
    .get(PROPERTY_ID());

  return res.json({
    notifications,
    unread_count: unreadCount.c,
    pagination: {
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRow.total / parseInt(limit))
    }
  });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', requireAuth, (req, res) => {
  const db = getDb();
  const notification = db.prepare('SELECT id FROM notifications WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!notification) return res.status(404).json({ error: 'Notification not found' });

  db.prepare('UPDATE notifications SET read_flag = 1 WHERE id = ? AND property_id = ?')
    .run(req.params.id, PROPERTY_ID());

  return res.json({ ok: true });
});

// PUT /api/notifications/read-all
router.put('/read-all', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read_flag = 1 WHERE property_id = ?').run(PROPERTY_ID());
  return res.json({ ok: true });
});

// DELETE /api/notifications/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const notification = db.prepare('SELECT id FROM notifications WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!notification) return res.status(404).json({ error: 'Notification not found' });

  db.prepare('DELETE FROM notifications WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
