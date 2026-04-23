'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/reports/occupancy?property_id=&month=&year=
router.get('/occupancy', (req, res) => {
  const { property_id, month, year } = req.query;
  if (!property_id) return res.status(400).json({ error: 'property_id is required' });

  const db = getDb();
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const period = `${y}-${String(m).padStart(2, '0')}`;

  // Total rooms for property
  const totalRooms = db.prepare(`SELECT COUNT(*) as count FROM rooms WHERE property_id = ?`).get(property_id).count;

  // Days in period
  const daysInMonth = new Date(y, parseInt(m), 0).getDate();
  const totalRoomNights = totalRooms * daysInMonth;

  // Booked nights per day
  const bookings = db.prepare(`
    SELECT check_in, check_out, nights, status
    FROM bookings
    WHERE property_id = ?
      AND status IN ('confirmed','checked_in','checked_out')
      AND strftime('%Y-%m', check_in) = ?
  `).all(property_id, period);

  // Build day-by-day occupancy
  const dailyOccupancy = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${period}-${String(d).padStart(2, '0')}`;
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM bookings
      WHERE property_id = ?
        AND status IN ('confirmed','checked_in','checked_out')
        AND check_in <= ? AND check_out > ?
    `).get(property_id, dateStr, dateStr).count;
    dailyOccupancy[dateStr] = { date: dateStr, occupied: count, total: totalRooms, rate: totalRooms > 0 ? Math.round((count / totalRooms) * 100) : 0 };
  }

  const totalOccupied = bookings.reduce((sum, b) => sum + (b.nights || 0), 0);
  const occupancyRate = totalRoomNights > 0 ? Math.round((totalOccupied / totalRoomNights) * 100) : 0;

  return res.json({
    period,
    total_rooms: totalRooms,
    days_in_month: daysInMonth,
    total_room_nights: totalRoomNights,
    total_occupied_nights: totalOccupied,
    occupancy_rate_percent: occupancyRate,
    daily: Object.values(dailyOccupancy)
  });
});

// GET /api/reports/revenue?property_id=&year=
router.get('/revenue', (req, res) => {
  const { property_id, year } = req.query;
  if (!property_id) return res.status(400).json({ error: 'property_id is required' });

  const db = getDb();
  const y = year || new Date().getFullYear();

  const monthly = db.prepare(`
    SELECT
      strftime('%m', check_in) as month,
      COUNT(*) as bookings,
      SUM(total_amount) as total_revenue,
      SUM(commission_amount) as total_commission,
      SUM(net_to_property) as net_revenue,
      SUM(tax_amount) as total_tax,
      currency
    FROM bookings
    WHERE property_id = ?
      AND status NOT IN ('cancelled','no_show')
      AND strftime('%Y', check_in) = ?
    GROUP BY strftime('%m', check_in), currency
    ORDER BY month
  `).all(property_id, String(y));

  const annual = db.prepare(`
    SELECT
      COUNT(*) as total_bookings,
      COALESCE(SUM(total_amount), 0) as total_revenue,
      COALESCE(SUM(commission_amount), 0) as total_commission,
      COALESCE(SUM(net_to_property), 0) as net_revenue,
      currency
    FROM bookings
    WHERE property_id = ?
      AND status NOT IN ('cancelled','no_show')
      AND strftime('%Y', check_in) = ?
    GROUP BY currency
  `).all(property_id, String(y));

  return res.json({ year: y, monthly, annual });
});

// GET /api/reports/arrivals-departures?property_id=&from=&to=
router.get('/arrivals-departures', (req, res) => {
  const { property_id, from, to } = req.query;
  if (!property_id || !from || !to) return res.status(400).json({ error: 'property_id, from and to are required' });

  const db = getDb();

  const arrivals = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.nights, b.adults, b.children,
           b.status, b.payment_status, b.total_amount, b.currency,
           g.first_name, g.last_name, g.email, g.phone, g.nationality,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ?
      AND b.check_in >= ? AND b.check_in <= ?
      AND b.status NOT IN ('cancelled','no_show')
    ORDER BY b.check_in
  `).all(property_id, from, to);

  const departures = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.nights, b.adults, b.children,
           b.status, b.payment_status, b.total_amount, b.currency,
           g.first_name, g.last_name, g.email, g.phone,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ?
      AND b.check_out >= ? AND b.check_out <= ?
      AND b.status NOT IN ('cancelled','no_show')
    ORDER BY b.check_out
  `).all(property_id, from, to);

  return res.json({ arrivals, departures, period: { from, to } });
});

// GET /api/reports/payments?property_id=&month=
router.get('/payments', (req, res) => {
  const { property_id, month } = req.query;
  if (!property_id) return res.status(400).json({ error: 'property_id is required' });

  const db = getDb();

  const conditions = ['bp.property_id = ?'];
  const params = [property_id];

  if (month) {
    conditions.push(`strftime('%Y-%m', bp.payment_date) = ?`);
    params.push(month);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const payments = db.prepare(`
    SELECT bp.*, b.booking_ref, g.first_name, g.last_name
    FROM booking_payments bp
    LEFT JOIN bookings b ON b.id = bp.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    ${where}
    ORDER BY bp.payment_date DESC
  `).all(...params);

  const summary = db.prepare(`
    SELECT
      payment_method,
      COUNT(*) as count,
      SUM(amount) as total,
      currency
    FROM booking_payments bp
    ${where}
    GROUP BY payment_method, currency
    ORDER BY total DESC
  `).all(...params);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) as grand_total,
      currency
    FROM booking_payments bp
    ${where}
    GROUP BY currency
  `).all(...params);

  return res.json({ payments, summary, totals });
});

// GET /api/reports/commissions?property_id=&year=
router.get('/commissions', (req, res) => {
  const { property_id, year } = req.query;
  if (!property_id) return res.status(400).json({ error: 'property_id is required' });

  const db = getDb();
  const y = year || new Date().getFullYear();

  const monthly = db.prepare(`
    SELECT
      strftime('%m', c.due_date) as month,
      c.status,
      COUNT(*) as count,
      SUM(c.amount) as total_amount,
      c.currency
    FROM ota_commissions c
    WHERE c.hotel_property_id = ?
      AND strftime('%Y', c.due_date) = ?
    GROUP BY strftime('%m', c.due_date), c.status, c.currency
    ORDER BY month
  `).all(property_id, String(y));

  const annual = db.prepare(`
    SELECT
      c.status,
      COUNT(*) as count,
      COALESCE(SUM(c.amount), 0) as total_amount,
      c.currency
    FROM ota_commissions c
    WHERE c.hotel_property_id = ?
      AND strftime('%Y', c.due_date) = ?
    GROUP BY c.status, c.currency
  `).all(property_id, String(y));

  return res.json({ year: y, monthly, annual });
});

module.exports = router;
