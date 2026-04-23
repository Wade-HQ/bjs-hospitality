'use strict';
const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/channel-sync/log?property_id=
router.get('/log', (req, res) => {
  const { property_id } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (property_id) { conditions.push('property_id = ?'); params.push(property_id); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const logs = db.prepare(`
    SELECT csl.*, b.booking_ref
    FROM channel_sync_log csl
    LEFT JOIN bookings b ON b.id = csl.booking_id
    ${where}
    ORDER BY csl.synced_at DESC
    LIMIT 200
  `).all(...params);

  return res.json(logs);
});

// Fetch a URL and return its text content
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https://') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse iCal VEVENT entries from raw iCal text
function parseIcalVEvents(icalText) {
  const events = [];
  const lines = icalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Unfold lines (continuation lines start with space/tab)
  const unfolded = lines.replace(/\n[ \t]/g, '');

  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = veventRegex.exec(unfolded)) !== null) {
    const block = match[1];
    const get = (key) => {
      const m = block.match(new RegExp(`^${key}[;:][^\n]*?:(.*?)$`, 'm'));
      return m ? m[1].trim() : null;
    };

    const dtstart = get('DTSTART') || get('DTSTART;VALUE=DATE');
    const dtend = get('DTEND') || get('DTEND;VALUE=DATE');
    const summary = get('SUMMARY');
    const uid = get('UID');

    if (dtstart && dtend) {
      // Normalise to YYYY-MM-DD
      const normalise = (d) => {
        if (!d) return null;
        d = d.replace(/T.*$/, ''); // strip time
        if (d.length === 8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
        return d;
      };
      events.push({
        uid,
        summary,
        start_date: normalise(dtstart),
        end_date: normalise(dtend)
      });
    }
  }
  return events;
}

// POST /api/sync/ical-import
router.post('/ical-import', async (req, res) => {
  const { property_id, room_id, ical_url } = req.body;
  if (!property_id || !room_id || !ical_url) {
    return res.status(400).json({ error: 'property_id, room_id and ical_url are required' });
  }

  const db = getDb();
  let blocksCreated = 0;
  let errorMessage = null;

  try {
    const icalText = await fetchUrl(ical_url);
    const events = parseIcalVEvents(icalText);

    for (const event of events) {
      if (!event.start_date || !event.end_date) continue;

      // Check for existing block with same dates (avoid duplicates)
      const existing = db.prepare(`
        SELECT id FROM availability_blocks
        WHERE room_id = ? AND start_date = ? AND end_date = ? AND reason = 'channel_sync'
      `).get(room_id, event.start_date, event.end_date);

      if (!existing) {
        db.prepare(`
          INSERT INTO availability_blocks (property_id, room_id, start_date, end_date, reason, notes)
          VALUES (?, ?, ?, ?, 'channel_sync', ?)
        `).run(property_id, room_id, event.start_date, event.end_date, event.summary || 'Channel sync block');
        blocksCreated++;
      }
    }

    // Log success
    db.prepare(`
      INSERT INTO channel_sync_log (property_id, channel, direction, status, payload_json)
      VALUES (?, 'ical_import', 'inbound', 'success', ?)
    `).run(property_id, JSON.stringify({ ical_url, events_parsed: events.length, blocks_created: blocksCreated }));

    return res.json({ ok: true, events_parsed: events.length, blocks_created: blocksCreated });

  } catch (err) {
    errorMessage = err.message;

    db.prepare(`
      INSERT INTO channel_sync_log (property_id, channel, direction, status, error_message)
      VALUES (?, 'ical_import', 'inbound', 'failed', ?)
    `).run(property_id, errorMessage);

    return res.status(500).json({ error: 'iCal import failed: ' + errorMessage });
  }
});

// POST /api/sync/inbound — log inbound sync from any channel
router.post('/inbound', (req, res) => {
  const { property_id, booking_id, channel, payload } = req.body;
  if (!property_id || !channel) {
    return res.status(400).json({ error: 'property_id and channel are required' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO channel_sync_log (property_id, booking_id, channel, direction, status, payload_json)
    VALUES (?, ?, ?, 'inbound', 'pending', ?)
  `).run(property_id, booking_id || null, channel, payload ? JSON.stringify(payload) : null);

  return res.status(201).json({ log_id: result.lastInsertRowid, status: 'pending' });
});

module.exports = router;
