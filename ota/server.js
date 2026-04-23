'use strict';

// ---------------------------------------------------------------------------
// Load .env manually (no dotenv dependency)
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

// ---------------------------------------------------------------------------
// Core dependencies
// ---------------------------------------------------------------------------
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const { initDb, getDb } = require('./db/index');
const { updateCommissionStatuses } = require('./utils/commissions');
const { createNotification } = require('./utils/notifications');

// ---------------------------------------------------------------------------
// Route imports
// ---------------------------------------------------------------------------
const authRouter         = require('./routes/auth');
const publicRouter       = require('./routes/public');
const bookingsRouter     = require('./routes/bookings');
const guestsRouter       = require('./routes/guests');
const roomsRouter        = require('./routes/rooms');
const roomTypesRouter    = require('./routes/room-types');
const ratesRouter        = require('./routes/rates');
const availabilityRouter = require('./routes/availability');
const invoicesRouter     = require('./routes/invoices');
const paymentsRouter     = require('./routes/payments');
const commissionsRouter  = require('./routes/commissions');
const notificationsRouter = require('./routes/notifications');
const reportsRouter      = require('./routes/reports');
const icalRouter         = require('./routes/ical');
const googleHotelsRouter = require('./routes/google-hotels');
const channelSyncRouter  = require('./routes/channel-sync');
const usersRouter        = require('./routes/users');
const propertiesRouter   = require('./routes/properties');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
const PORT = parseInt(process.env.PORT || '3100', 10);
const UPLOADS_PATH = process.env.UPLOADS_PATH || '/opt/bjs-hospitality/uploads';
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');

app.use(cors({
  origin: process.env.APP_URL || true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
app.use('/uploads', express.static(UPLOADS_PATH));

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/auth',           authRouter);
app.use('/api/public',         publicRouter);
app.use('/api/bookings',       bookingsRouter);
app.use('/api/guests',         guestsRouter);
app.use('/api/rooms',          roomsRouter);
app.use('/api/room-types',     roomTypesRouter);
app.use('/api/rates',          ratesRouter);
app.use('/api/availability',   availabilityRouter);
app.use('/api/invoices',       invoicesRouter);
app.use('/api/payments',       paymentsRouter);
app.use('/api/commissions',    commissionsRouter);
app.use('/api/notifications',  notificationsRouter);
app.use('/api/reports',        reportsRouter);
app.use('/api/ical',           icalRouter);
app.use('/api/google-hotels',  googleHotelsRouter);
app.use('/api/channel-sync',   channelSyncRouter);
app.use('/api/sync',           channelSyncRouter);
app.use('/api/users',          usersRouter);
app.use('/api/properties',     propertiesRouter);

// ---------------------------------------------------------------------------
// SPA fallback — only for non-API routes
// ---------------------------------------------------------------------------
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexHtml = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  return res.status(200).json({ status: 'BJS OTA API running', version: '1.0.0' });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 10MB)' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup tasks
// ---------------------------------------------------------------------------
async function start() {
  try {
    // Init database and run migrations
    const db = await initDb();
    console.log('[DB] Database ready at', process.env.DATABASE_PATH || '/opt/bjs-hospitality/database/hospitality.db');

    // Ensure upload directories exist
    const uploadDirs = [
      path.join(UPLOADS_PATH, 'documents', 'guests'),
      path.join(UPLOADS_PATH, 'images', 'properties')
    ];
    for (const dir of uploadDirs) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    // Run commission status update on startup
    updateCommissionStatuses(db);
    console.log('[Commissions] Status update complete');

    // Schedule commission check every hour
    setInterval(() => {
      try {
        updateCommissionStatuses(getDb());
      } catch (err) {
        console.error('[Commissions] Hourly update error:', err.message);
      }
    }, 60 * 60 * 1000);

    // ---------------------------------------------------------------------------
    // Daily check-in/check-out notifications at midnight
    // ---------------------------------------------------------------------------
    let lastNotificationDate = null;

    setInterval(() => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // Fire at 00:00 local server time, once per day
      if (hours === 0 && minutes === 0 && lastNotificationDate !== todayStr) {
        lastNotificationDate = todayStr;

        try {
          const db = getDb();

          // Today's check-ins
          const checkIns = db.prepare(`
            SELECT b.id, b.booking_ref, b.property_id, g.first_name, g.last_name
            FROM bookings b
            LEFT JOIN guests g ON g.id = b.guest_id
            WHERE b.check_in = ? AND b.status IN ('confirmed','provisional')
          `).all(todayStr);

          for (const b of checkIns) {
            createNotification(
              db, b.property_id, 'check_in_today',
              'Check-in Today',
              `${b.first_name || ''} ${b.last_name || ''} — Booking ${b.booking_ref} checks in today`,
              b.id, 'booking'
            );
          }

          // Today's check-outs
          const checkOuts = db.prepare(`
            SELECT b.id, b.booking_ref, b.property_id, g.first_name, g.last_name
            FROM bookings b
            LEFT JOIN guests g ON g.id = b.guest_id
            WHERE b.check_out = ? AND b.status IN ('checked_in')
          `).all(todayStr);

          for (const b of checkOuts) {
            createNotification(
              db, b.property_id, 'check_out_today',
              'Check-out Today',
              `${b.first_name || ''} ${b.last_name || ''} — Booking ${b.booking_ref} checks out today`,
              b.id, 'booking'
            );
          }

          if (checkIns.length || checkOuts.length) {
            console.log(`[Notifications] ${checkIns.length} check-ins, ${checkOuts.length} check-outs notified for ${todayStr}`);
          }
        } catch (err) {
          console.error('[Notifications] Daily notification error:', err.message);
        }
      }
    }, 60 * 1000); // check every minute

    // ---------------------------------------------------------------------------
    // Start server
    // ---------------------------------------------------------------------------
    app.listen(PORT, () => {
      console.log(`[Server] BJS OTA API running on port ${PORT}`);
      console.log(`[Server] Uploads path: ${UPLOADS_PATH}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (err) {
    console.error('[FATAL] Startup failed:', err.message);
    process.exit(1);
  }
}

start();
