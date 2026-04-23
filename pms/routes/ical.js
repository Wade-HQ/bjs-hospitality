'use strict';
const express = require('express');
const https = require('https');
const http = require('http');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateIcal, parseIcal } = require('../utils/ical');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/ical/:room_id
router.get('/:room_id', (req, res) => {
  const db = getDb();

  // Verify room belongs to this property
  const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND property_id = ?')
    .get(req.params.room_id, PROPERTY_ID());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const icalContent = generateIcal(db, req.params.room_id);
  if (!icalContent) return res.status(404).json({ error: 'Could not generate calendar' });

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="room-${req.params.room_id}.ics"`);
  return res.send(icalContent);
});

// GET /api/settings/ical-feeds
router.get('/settings/feeds', requireAuth, (req, res) => {
  const db = getDb();
  const feeds = db.prepare(`
    SELECT f.*, r.room_number, rt.name as room_type_name
    FROM ical_feeds f
    LEFT JOIN rooms r ON r.id = f.room_id
    LEFT JOIN room_types rt ON rt.id = r.room_type_id
    WHERE f.property_id = ?
    ORDER BY r.room_number, f.channel
  `).all(PROPERTY_ID());
  return res.json({ feeds });
});

// POST /api/settings/ical-feeds
router.post('/settings/feeds', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const { room_id, channel, feed_url, sync_interval_minutes = 60, active = 1 } = req.body;

  if (!room_id || !channel || !feed_url) {
    return res.status(400).json({ error: 'room_id, channel, and feed_url are required' });
  }

  // Verify room belongs to this property
  const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND property_id = ?')
    .get(room_id, PROPERTY_ID());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  // Upsert: update if feed exists for this room+channel, else insert
  const existing = db.prepare('SELECT id FROM ical_feeds WHERE property_id = ? AND room_id = ? AND channel = ?')
    .get(PROPERTY_ID(), room_id, channel);

  let feedId;
  if (existing) {
    db.prepare(`
      UPDATE ical_feeds SET
        feed_url = ?, sync_interval_minutes = ?, active = ?
      WHERE id = ?
    `).run(feed_url, parseInt(sync_interval_minutes), active ? 1 : 0, existing.id);
    feedId = existing.id;
  } else {
    const result = db.prepare(`
      INSERT INTO ical_feeds (property_id, room_id, channel, feed_url, sync_interval_minutes, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(PROPERTY_ID(), room_id, channel, feed_url, parseInt(sync_interval_minutes), active ? 1 : 0);
    feedId = result.lastInsertRowid;
  }

  const feed = db.prepare('SELECT * FROM ical_feeds WHERE id = ?').get(feedId);
  return res.json({ feed });
});

// POST /api/sync/ical-import
router.post('/sync/import', requireAuth, requireRole('owner','hotel_manager'), async (req, res) => {
  const db = getDb();
  const { feed_id, room_id, feed_url: directUrl, channel } = req.body;

  let feedUrl, targetRoomId;

  if (feed_id) {
    const feed = db.prepare('SELECT * FROM ical_feeds WHERE id = ? AND property_id = ?')
      .get(feed_id, PROPERTY_ID());
    if (!feed) return res.status(404).json({ error: 'Feed not found' });
    feedUrl = feed.feed_url;
    targetRoomId = feed.room_id;
  } else if (directUrl && room_id) {
    feedUrl = directUrl;
    targetRoomId = room_id;
    // Verify room
    const room = db.prepare('SELECT id FROM rooms WHERE id = ? AND property_id = ?')
      .get(room_id, PROPERTY_ID());
    if (!room) return res.status(404).json({ error: 'Room not found' });
  } else {
    return res.status(400).json({ error: 'feed_id or (feed_url + room_id) required' });
  }

  // Fetch the iCal URL
  let icalText = '';
  try {
    icalText = await fetchUrl(feedUrl);
  } catch (err) {
    return res.status(502).json({ error: `Failed to fetch iCal URL: ${err.message}` });
  }

  // Parse events
  const events = parseIcal(icalText);

  let created = 0;
  let skipped = 0;

  for (const event of events) {
    if (!event.dtstart || !event.dtend) { skipped++; continue; }

    // Check if a block already exists with this UID
    const existingBlock = db.prepare(`
      SELECT id FROM availability_blocks
      WHERE room_id = ? AND property_id = ? AND start_date = ? AND end_date = ?
    `).get(targetRoomId, PROPERTY_ID(), event.dtstart, event.dtend);

    if (existingBlock) { skipped++; continue; }

    db.prepare(`
      INSERT INTO availability_blocks (property_id, room_id, start_date, end_date, reason, notes)
      VALUES (?, ?, ?, ?, 'channel_sync', ?)
    `).run(
      PROPERTY_ID(), targetRoomId,
      event.dtstart, event.dtend,
      event.summary ? event.summary.slice(0, 255) : (channel || 'iCal import')
    );
    created++;
  }

  // Update last_synced on feed
  if (feed_id) {
    db.prepare('UPDATE ical_feeds SET last_synced = CURRENT_TIMESTAMP WHERE id = ?').run(feed_id);
  }

  return res.json({
    ok: true,
    events_found: events.length,
    blocks_created: created,
    skipped
  });
});

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', () => reject(new Error('Request timed out')));
  });
}

module.exports = router;
