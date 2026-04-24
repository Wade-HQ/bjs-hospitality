'use strict';
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const SSO_SECRET = process.env.SSO_SECRET || '';

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

  // Map portal role to OTA role — any valid portal user gets access
  const role = payload.roles && payload.roles.ota;
  let appRole = 'front_desk';
  if (payload.isSuperAdmin || payload.isAdmin || role === 'super_admin' || role === 'admin') {
    appRole = 'ota_admin';
  }

  try {
    const db = getDb();
    const email = payload.email.trim().toLowerCase();

    // Find or create the user in OTA's user table
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      const hash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
      db.prepare(`INSERT INTO users (name, email, password_hash, role, property_access_json, active, force_password_change)
        VALUES (?, ?, ?, ?, '[1,2]', 1, 0)`)
        .run(payload.name, email, hash, appRole);
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    } else {
      // Keep name and role in sync with portal
      db.prepare('UPDATE users SET name = ?, role = ? WHERE email = ?')
        .run(payload.name, appRole, email);
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }

    // Create a session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= datetime("now")').run(user.id);
    db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, sessionToken, expiresAt);

    res.cookie('bjs_session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      expires: new Date(expiresAt),
      path: '/'
    });

    if (req.query.redirect) {
      return res.redirect(302, req.query.redirect);
    }
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, force_password_change: false }
    });
  } catch (ssoErr) {
    console.error('[SSO] Error after JWT verify:', ssoErr.message, ssoErr.stack);
    return res.status(500).json({ error: 'SSO session creation failed', detail: ssoErr.message });
  }
});

module.exports = router;
