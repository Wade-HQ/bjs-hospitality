'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { generateIcal } = require('../utils/ical');

// GET /api/ical/:room_id — public, no auth required
router.get('/:room_id', (req, res) => {
  const db = getDb();
  const room = db.prepare(`SELECT id, room_number FROM rooms WHERE id = ?`).get(req.params.room_id);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  try {
    const icalStr = generateIcal(db, room.id);
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="room-${room.room_number}.ics"`);
    return res.send(icalStr);
  } catch (err) {
    console.error('iCal generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate iCal' });
  }
});

module.exports = router;
