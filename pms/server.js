'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

// ── Load .env ────────────────────────────────────────────
const PROPERTY_ID = process.env.PROPERTY_ID || '1';
const envFile = path.join(__dirname, PROPERTY_ID === '2' ? '.env.membene' : '.env.sky-island');
const fallbackEnv = path.join(__dirname, '.env');
const envPath = fs.existsSync(envFile) ? envFile : (fs.existsSync(fallbackEnv) ? fallbackEnv : null);
if (envPath) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

const PORT = parseInt(process.env.PORT || (PROPERTY_ID === '2' ? '3102' : '3101'), 10);
const UPLOADS_PATH = process.env.UPLOADS_PATH || '/opt/bjs-hospitality/uploads';

// ── DB init ───────────────────────────────────────────────
const { initDb, getDb } = require('./db/index');
const { updateCommissionStatuses } = require('./utils/commissions');
const { createNotification } = require('./utils/notifications');

// ── Express setup ─────────────────────────────────────────
const app = express();
app.use(cors({ origin: process.env.APP_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_PATH));

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/bookings',     require('./routes/bookings'));
app.use('/api/guests',       require('./routes/guests'));
app.use('/api/rooms',        require('./routes/rooms'));
app.use('/api/room-types',   require('./routes/room-types'));
app.use('/api/rates',        require('./routes/rates'));
app.use('/api/availability', require('./routes/availability'));
app.use('/api/invoices',     require('./routes/invoices'));
app.use('/api/payments',     require('./routes/payments'));
app.use('/api/commissions',  require('./routes/commissions'));
app.use('/api/notifications',require('./routes/notifications'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/ical',         require('./routes/ical'));
app.use('/api/settings',     require('./routes/settings'));
app.use('/api/meal-packages', require('./routes/meal-packages'));
app.use('/api/seasonal-adjustments',  require('./routes/seasonal-adjustments'));

// ─── GET /api/health ─────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    const propertyId = process.env.PROPERTY_ID || 'unknown';
    res.json({
      status: 'ok',
      app: `kudu-pms-property-${propertyId}`,
      version: '1.0.0',
      db: 'connected',
      db_path: process.env.DATABASE_PATH || '/opt/bjs-hospitality/database/hospitality.db',
      property_id: propertyId,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ status: 'error', db: 'failed', error: e.message });
  }
});

// ── Serve built React frontend ────────────────────────────
const distPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
}

// ── Startup ───────────────────────────────────────────────
(async () => {
  const db = await initDb();
  console.log(`PMS ready — property_id=${PROPERTY_ID} on port ${PORT}`);

  // Commission status updates
  updateCommissionStatuses(db);
  setInterval(() => updateCommissionStatuses(db), 60 * 60 * 1000);

  // Daily check-in/check-out notifications (poll every minute)
  let lastNotifDay = null;
  setInterval(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    if (lastNotifDay === today) return;
    if (now.getHours() !== 0) return;
    lastNotifDay = today;
    const db2 = getDb();
    const arrivals = db2.prepare(`SELECT b.id, g.first_name, g.last_name FROM bookings b
      JOIN guests g ON g.id = b.guest_id
      WHERE b.property_id = ? AND b.check_in = ? AND b.status IN ('confirmed','provisional')`).all(PROPERTY_ID, today);
    arrivals.forEach(b => createNotification(db2, 'check_in_today',
      `Check-in: ${b.first_name} ${b.last_name}`, `Arrival today`, b.id, 'booking'));

    const departures = db2.prepare(`SELECT b.id, g.first_name, g.last_name FROM bookings b
      JOIN guests g ON g.id = b.guest_id
      WHERE b.property_id = ? AND b.check_out = ? AND b.status = 'checked_in'`).all(PROPERTY_ID, today);
    departures.forEach(b => createNotification(db2, 'check_out_today',
      `Check-out: ${b.first_name} ${b.last_name}`, `Departure today`, b.id, 'booking'));
  }, 60 * 1000);

  app.listen(PORT, () => console.log(`PMS listening on port ${PORT}`));
})();
