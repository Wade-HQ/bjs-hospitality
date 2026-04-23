'use strict';
const { getDb } = require('../db/index');

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.bjs_session;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();
  const now = new Date().toISOString();

  const session = db.prepare(`
    SELECT s.id as session_id, s.token, s.expires_at,
           u.id, u.name, u.email, u.role, u.property_access_json, u.active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
  `).get(token, now);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    property_access_json: session.property_access_json
  };

  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
