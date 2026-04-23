'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const bcrypt = require('bcrypt');

const PROPERTY_ID = parseInt(process.env.PROPERTY_ID || '1', 10);

router.get('/', requireAuth, (req, res) => {
  try {
    const prop = getDb().prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID);
    if (!prop) return res.status(404).json({ error: 'Property not found' });
    res.json(prop);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  try {
    const db = getDb();
    const f = req.body;
    const fields = ['name','address','country','timezone','contact_email','contact_phone',
      'tax_label','tax_rate','invoice_prefix','invoice_counter','payment_instructions',
      'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from'];
    const sets = fields.map(k => `${k} = COALESCE(?, ${k})`).join(', ');
    const vals = fields.map(k => f[k] !== undefined ? f[k] : null);
    db.prepare(`UPDATE properties SET ${sets} WHERE id = ?`).run(...vals, PROPERTY_ID);
    res.json(db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  try {
    const users = getDb().prepare('SELECT id,name,email,role,property_access_json,active,created_at FROM users WHERE active=1').all();
    res.json(users.filter(u => { try { return JSON.parse(u.property_access_json||'[]').includes(PROPERTY_ID); } catch { return false; } }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', requireAuth, requireRole('owner', 'hotel_manager'), async (req, res) => {
  try {
    const db = getDb();
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      const access = JSON.parse(existing.property_access_json || '[]');
      if (!access.includes(PROPERTY_ID)) access.push(PROPERTY_ID);
      db.prepare('UPDATE users SET property_access_json = ? WHERE id = ?').run(JSON.stringify(access), existing.id);
      return res.json({ id: existing.id, message: 'Access granted' });
    }
    const hash = await bcrypt.hash(password, 12);
    const r = db.prepare('INSERT INTO users (name,email,password_hash,role,property_access_json,force_password_change) VALUES (?,?,?,?,?,1)')
      .run(name, email, hash, role || 'front_desk', JSON.stringify([PROPERTY_ID]));
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const access = JSON.parse(user.property_access_json || '[]').filter(id => id !== PROPERTY_ID);
    db.prepare('UPDATE users SET property_access_json = ? WHERE id = ?').run(JSON.stringify(access), user.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ical-feeds', requireAuth, (req, res) => {
  try {
    const feeds = getDb().prepare('SELECT f.*, r.room_number FROM ical_feeds f LEFT JOIN rooms r ON r.id = f.room_id WHERE f.property_id = ?').all(PROPERTY_ID);
    res.json(feeds);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ical-feeds', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  try {
    const db = getDb();
    const { room_id, channel, feed_url, sync_interval_minutes } = req.body;
    const ex = db.prepare('SELECT * FROM ical_feeds WHERE property_id=? AND room_id=? AND channel=?').get(PROPERTY_ID, room_id, channel);
    if (ex) { db.prepare('UPDATE ical_feeds SET feed_url=?, sync_interval_minutes=? WHERE id=?').run(feed_url, sync_interval_minutes||60, ex.id); return res.json({ id: ex.id }); }
    const r = db.prepare('INSERT INTO ical_feeds (property_id,room_id,channel,feed_url,sync_interval_minutes) VALUES (?,?,?,?,?)').run(PROPERTY_ID, room_id, channel, feed_url, sync_interval_minutes||60);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
