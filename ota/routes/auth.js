'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const db = getDb();

  const user = db.prepare(`
    SELECT id, name, email, password_hash, role, property_access_json, active, force_password_change
    FROM users WHERE email = ? AND active = 1
  `).get(email.trim().toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Clean up expired sessions for this user
  db.prepare(`DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime('now')`).run(user.id);

  // Generate new session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)
  `).run(user.id, token, expiresAt);

  // Set session cookie
  res.cookie('bjs_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/'
  });

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      force_password_change: user.force_password_change === 1
    },
    token
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.bjs_session;
  if (token) {
    const db = getDb();
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  }
  res.clearCookie('bjs_session', { path: '/' });
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
