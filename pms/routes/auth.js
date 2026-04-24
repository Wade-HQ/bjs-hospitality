'use strict';
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const SSO_SECRET = process.env.SSO_SECRET || '';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = getDb();
  const propertyId = parseInt(process.env.PROPERTY_ID, 10);

  const user = db.prepare(`
    SELECT id, name, email, password_hash, role, property_access_json, active, force_password_change
    FROM users
    WHERE email = ? AND active = 1
  `).get(email.trim().toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check property access
  let propertyAccess = [];
  try {
    propertyAccess = JSON.parse(user.property_access_json || '[]');
  } catch (e) {
    propertyAccess = [];
  }

  if (!propertyAccess.includes(propertyId)) {
    return res.status(403).json({ error: 'You do not have access to this property' });
  }

  // Create session token (7-day expiry)
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, token, expiresAt);

  res.cookie('bjs_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      force_password_change: user.force_password_change === 1
    }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.bjs_session;
  if (token) {
    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie('bjs_session');
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const match = bcrypt.compareSync(current_password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Current password incorrect' });
  }

  const newHash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?')
    .run(newHash, req.user.id);

  return res.json({ ok: true });
});

// GET /api/auth/sso — authenticate via BJS portal SSO cookie
router.get('/sso', (req, res) => {
  if (!SSO_SECRET) return res.status(503).json({ error: 'SSO not configured' });

  const ssoToken = req.query._sso || (req.cookies && req.cookies.bjs_sso);
  if (!ssoToken) {
    if (req.query.redirect) return res.redirect(302, req.query.redirect + '?sso_error=no_token');
    return res.status(401).json({ error: 'No SSO token' });
  }

  let payload;
  try {
    payload = jwt.verify(ssoToken, SSO_SECRET);
  } catch (_) {
    return res.status(401).json({ error: 'Invalid SSO token' });
  }

  // Map portal role to PMS role — any valid portal user gets access
  const role = payload.roles && payload.roles.pms;
  let appRole = 'front_desk';
  if (payload.isSuperAdmin || payload.isAdmin || role === 'super_admin' || role === 'admin') {
    appRole = 'hotel_manager';
  }

  try {
  const propertyId = parseInt(process.env.PROPERTY_ID, 10) || 1;
  const db = getDb();
  const email = payload.email.trim().toLowerCase();

  // Find or create the user in PMS's user table
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    db.prepare(`INSERT INTO users (name, email, password_hash, role, property_access_json, active, force_password_change)
      VALUES (?, ?, ?, ?, '[1,2]', 1, 0)`)
      .run(payload.name, email, hash, appRole);
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  } else {
    db.prepare('UPDATE users SET name = ?, role = ? WHERE email = ?')
      .run(payload.name, appRole, email);
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }

  // Verify property access
  let propertyAccess = [];
  try { propertyAccess = JSON.parse(user.property_access_json || '[]'); } catch (_) {}
  if (!propertyAccess.includes(propertyId)) {
    return res.status(403).json({ error: 'No access to this property' });
  }

  // Create session
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);

  res.cookie('bjs_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  });

  if (req.query.redirect) {
    return res.redirect(302, req.query.redirect);
  }
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, force_password_change: false }
  });
});

module.exports = router;
