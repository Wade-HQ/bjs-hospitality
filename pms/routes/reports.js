'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/reports/occupancy?month=&year=
router.get('/occupancy', requireAuth, (req, res) => {
  const db = getDb();
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);

  const monthStr = String(month).padStart(2, '0');
  const periodStart = `${year}-${monthStr}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${monthStr}-${daysInMonth}`;

  const totalRooms = db.prepare(`
    SELECT COUNT(*) as c FROM rooms
    WHERE property_id = ? AND status != 'maintenance'
  `).get(PROPERTY_ID()).c;

  const totalRoomNights = totalRooms * daysInMonth;

  // Occupied nights: count days where a booking overlaps each day in the month
  const occupiedNights = db.prepare(`
    SELECT SUM(
      (julianday(MIN(check_out, ?)) - julianday(MAX(check_in, ?)))
    ) as nights
    FROM bookings
    WHERE property_id = ?
      AND status IN ('confirmed','checked_in','checked_out')
      AND check_in <= ? AND check_out >= ?
      AND room_id IS NOT NULL
  `).get(periodEnd, periodStart, PROPERTY_ID(), periodEnd, periodStart);

  const occupiedNightsCount = Math.round(occupiedNights.nights || 0);
  const occupancyRate = totalRoomNights > 0
    ? ((occupiedNightsCount / totalRoomNights) * 100).toFixed(1)
    : 0;

  // Daily breakdown
  const dailyStats = db.prepare(`
    SELECT check_in, check_out, room_id
    FROM bookings
    WHERE property_id = ?
      AND status IN ('confirmed','checked_in','checked_out')
      AND check_in <= ? AND check_out > ?
      AND room_id IS NOT NULL
  `).all(PROPERTY_ID(), periodEnd, periodStart);

  // Build day-by-day occupancy
  const dayMap = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
    dayMap[dateStr] = { date: dateStr, occupied_rooms: 0 };
  }

  for (const b of dailyStats) {
    const ciDate = new Date(b.check_in + 'T00:00:00Z');
    const coDate = new Date(b.check_out + 'T00:00:00Z');
    const pStart = new Date(periodStart + 'T00:00:00Z');
    const pEnd = new Date(periodEnd + 'T00:00:00Z');

    const start = ciDate < pStart ? pStart : ciDate;
    const end = coDate > pEnd ? pEnd : coDate;

    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      if (dayMap[ds]) dayMap[ds].occupied_rooms++;
    }
  }

  const daily = Object.values(dayMap).map(d => ({
    ...d,
    total_rooms: totalRooms,
    occupancy_pct: totalRooms > 0 ? ((d.occupied_rooms / totalRooms) * 100).toFixed(1) : '0.0'
  }));

  // Revenue for the month
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total, currency
    FROM bookings
    WHERE property_id = ?
      AND status IN ('confirmed','checked_in','checked_out')
      AND check_in >= ? AND check_in <= ?
    GROUP BY currency
  `).all(PROPERTY_ID(), periodStart, periodEnd);

  const arrivals = db.prepare(`
    SELECT COUNT(*) as c FROM bookings
    WHERE property_id = ? AND check_in >= ? AND check_in <= ?
      AND status NOT IN ('cancelled','no_show')
  `).get(PROPERTY_ID(), periodStart, periodEnd).c;

  const departures = db.prepare(`
    SELECT COUNT(*) as c FROM bookings
    WHERE property_id = ? AND check_out >= ? AND check_out <= ?
      AND status NOT IN ('cancelled','no_show')
  `).get(PROPERTY_ID(), periodStart, periodEnd).c;

  return res.json({
    period: { year, month, period_start: periodStart, period_end: periodEnd },
    summary: {
      total_rooms: totalRooms,
      total_room_nights: totalRoomNights,
      occupied_nights: occupiedNightsCount,
      occupancy_rate: parseFloat(occupancyRate),
      arrivals,
      departures
    },
    revenue,
    daily
  });
});

// GET /api/reports/revenue?year=
router.get('/revenue', requireAuth, (req, res) => {
  const db = getDb();
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const monthly = db.prepare(`
    SELECT
      strftime('%m', check_in) as month,
      COUNT(*) as booking_count,
      SUM(total_amount) as gross_revenue,
      SUM(net_to_property) as net_revenue,
      SUM(commission_amount) as total_commissions,
      SUM(discount_amount) as total_discounts,
      SUM(nights) as total_nights,
      currency
    FROM bookings
    WHERE property_id = ? AND strftime('%Y', check_in) = ?
      AND status NOT IN ('cancelled','no_show')
    GROUP BY month, currency
    ORDER BY month
  `).all(PROPERTY_ID(), String(year));

  const annual = db.prepare(`
    SELECT
      COUNT(*) as booking_count,
      SUM(total_amount) as gross_revenue,
      SUM(net_to_property) as net_revenue,
      SUM(commission_amount) as total_commissions,
      SUM(discount_amount) as total_discounts,
      SUM(nights) as total_nights,
      currency
    FROM bookings
    WHERE property_id = ? AND strftime('%Y', check_in) = ?
      AND status NOT IN ('cancelled','no_show')
    GROUP BY currency
  `).all(PROPERTY_ID(), String(year));

  const bySource = db.prepare(`
    SELECT
      source,
      COUNT(*) as count,
      SUM(total_amount) as revenue,
      currency
    FROM bookings
    WHERE property_id = ? AND strftime('%Y', check_in) = ?
      AND status NOT IN ('cancelled','no_show')
    GROUP BY source, currency
    ORDER BY revenue DESC
  `).all(PROPERTY_ID(), String(year));

  const payments = db.prepare(`
    SELECT
      payment_method,
      COUNT(*) as count,
      SUM(amount) as total,
      currency
    FROM booking_payments
    WHERE property_id = ? AND strftime('%Y', payment_date) = ?
    GROUP BY payment_method, currency
    ORDER BY total DESC
  `).all(PROPERTY_ID(), String(year));

  return res.json({ year, monthly, annual, by_source: bySource, payments });
});

// GET /api/reports/arrivals-departures?from=&to=
router.get('/arrivals-departures', requireAuth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const from = req.query.from || today;
  const to = req.query.to || today;

  const arrivals = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.nights,
           b.adults, b.children, b.status, b.payment_status, b.source,
           b.special_requests, b.total_amount, b.currency,
           g.first_name, g.last_name, g.email, g.phone, g.nationality, g.vip_flag,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ? AND b.check_in >= ? AND b.check_in <= ?
      AND b.status NOT IN ('cancelled','no_show')
    ORDER BY b.check_in, g.last_name
  `).all(PROPERTY_ID(), from, to);

  const departures = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.nights,
           b.adults, b.children, b.status, b.payment_status, b.source,
           b.total_amount, b.currency,
           g.first_name, g.last_name, g.email, g.phone, g.vip_flag,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ? AND b.check_out >= ? AND b.check_out <= ?
      AND b.status NOT IN ('cancelled','no_show')
    ORDER BY b.check_out, g.last_name
  `).all(PROPERTY_ID(), from, to);

  const inHouse = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.nights,
           b.adults, b.children, b.status, b.payment_status,
           b.total_amount, b.currency,
           g.first_name, g.last_name, g.email, g.phone, g.vip_flag,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ? AND b.status = 'checked_in'
    ORDER BY b.check_out, g.last_name
  `).all(PROPERTY_ID());

  return res.json({
    period: { from, to },
    arrivals,
    departures,
    in_house: inHouse,
    counts: {
      arrivals: arrivals.length,
      departures: departures.length,
      in_house: inHouse.length
    }
  });
});

// GET /api/reports/payments?month=
router.get('/payments', requireAuth, (req, res) => {
  const db = getDb();
  const now = new Date();
  const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const payments = db.prepare(`
    SELECT bp.*,
           b.booking_ref, b.total_amount as booking_total,
           g.first_name, g.last_name
    FROM booking_payments bp
    JOIN bookings b ON b.id = bp.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE bp.property_id = ?
      AND strftime('%Y-%m', bp.payment_date) = ?
    ORDER BY bp.payment_date DESC
  `).all(PROPERTY_ID(), month);

  const summary = db.prepare(`
    SELECT
      payment_method,
      COUNT(*) as count,
      SUM(amount) as total,
      currency
    FROM booking_payments
    WHERE property_id = ? AND strftime('%Y-%m', payment_date) = ?
    GROUP BY payment_method, currency
    ORDER BY total DESC
  `).all(PROPERTY_ID(), month);

  const totals = db.prepare(`
    SELECT SUM(amount) as total, currency
    FROM booking_payments
    WHERE property_id = ? AND strftime('%Y-%m', payment_date) = ?
    GROUP BY currency
  `).all(PROPERTY_ID(), month);

  return res.json({ month, payments, summary, totals });
});

// GET /api/reports/commissions?year=
router.get('/commissions', requireAuth, (req, res) => {
  const db = getDb();
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const byStatus = db.prepare(`
    SELECT oc.status,
           COUNT(*) as count,
           SUM(oc.amount) as total_amount,
           oc.currency
    FROM ota_commissions oc
    JOIN bookings b ON b.id = oc.booking_id
    WHERE oc.hotel_property_id = ?
      AND strftime('%Y', b.check_out) = ?
    GROUP BY oc.status, oc.currency
  `).all(PROPERTY_ID(), String(year));

  const monthly = db.prepare(`
    SELECT
      strftime('%m', b.check_out) as month,
      COUNT(*) as count,
      SUM(oc.amount) as total_amount,
      SUM(CASE WHEN oc.status = 'paid' THEN oc.amount ELSE 0 END) as paid_amount,
      SUM(CASE WHEN oc.status IN ('pending','due','overdue') THEN oc.amount ELSE 0 END) as outstanding_amount,
      oc.currency
    FROM ota_commissions oc
    JOIN bookings b ON b.id = oc.booking_id
    WHERE oc.hotel_property_id = ?
      AND strftime('%Y', b.check_out) = ?
    GROUP BY month, oc.currency
    ORDER BY month
  `).all(PROPERTY_ID(), String(year));

  const overdue = db.prepare(`
    SELECT oc.*,
           b.booking_ref, b.check_out,
           g.first_name, g.last_name
    FROM ota_commissions oc
    JOIN bookings b ON b.id = oc.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE oc.hotel_property_id = ? AND oc.status = 'overdue'
    ORDER BY oc.due_date
  `).all(PROPERTY_ID());

  return res.json({ year, by_status: byStatus, monthly, overdue });
});

// GET /api/reports/guests
router.get('/guests', requireAuth, (req, res) => {
  const db = getDb();

  // Nationality breakdown
  const byNationality = db.prepare(`
    SELECT COALESCE(g.nationality, 'Unknown') as nationality,
           COUNT(DISTINCT g.id) as guest_count,
           COUNT(b.id) as booking_count
    FROM guests g
    LEFT JOIN bookings b ON b.guest_id = g.id AND b.property_id = ?
    WHERE g.property_id = ? OR b.id IS NOT NULL
    GROUP BY nationality
    ORDER BY guest_count DESC
  `).all(PROPERTY_ID(), PROPERTY_ID());

  // VIP guests
  const vipGuests = db.prepare(`
    SELECT g.*,
           COUNT(b.id) as total_bookings,
           SUM(b.total_amount) as total_spent,
           MAX(b.check_in) as last_stay,
           b.currency
    FROM guests g
    LEFT JOIN bookings b ON b.guest_id = g.id AND b.property_id = ?
    WHERE g.vip_flag = 1
      AND (g.property_id = ? OR b.id IS NOT NULL)
    GROUP BY g.id, b.currency
    ORDER BY total_spent DESC
  `).all(PROPERTY_ID(), PROPERTY_ID());

  // Repeat vs new guests
  const repeatStats = db.prepare(`
    SELECT
      SUM(CASE WHEN booking_count > 1 THEN 1 ELSE 0 END) as repeat_guests,
      SUM(CASE WHEN booking_count = 1 THEN 1 ELSE 0 END) as new_guests,
      COUNT(*) as total_guests
    FROM (
      SELECT g.id, COUNT(b.id) as booking_count
      FROM guests g
      JOIN bookings b ON b.guest_id = g.id AND b.property_id = ?
      WHERE b.status NOT IN ('cancelled','no_show')
      GROUP BY g.id
    )
  `).get(PROPERTY_ID());

  // Top spenders
  const topSpenders = db.prepare(`
    SELECT g.id, g.first_name, g.last_name, g.email, g.nationality, g.vip_flag,
           COUNT(b.id) as total_bookings,
           SUM(b.total_amount) as total_spent,
           SUM(b.nights) as total_nights,
           MAX(b.check_in) as last_stay,
           b.currency
    FROM guests g
    JOIN bookings b ON b.guest_id = g.id AND b.property_id = ?
    WHERE b.status NOT IN ('cancelled','no_show')
    GROUP BY g.id, b.currency
    ORDER BY total_spent DESC
    LIMIT 20
  `).all(PROPERTY_ID());

  return res.json({
    by_nationality: byNationality,
    vip_guests: vipGuests,
    repeat_stats: repeatStats,
    top_spenders: topSpenders
  });
});

// GET /api/reports/cancelled?from=&to=
router.get('/cancelled', requireAuth, (req, res) => {
  const db = getDb();
  const now = new Date();
  const from = req.query.from || `${now.getFullYear()}-01-01`;
  const to = req.query.to || now.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT b.id, b.booking_ref, b.source, b.check_in, b.check_out, b.nights,
           b.adults, b.children, b.status, b.payment_status,
           b.total_amount, b.currency, b.updated_at,
           g.first_name, g.last_name,
           (g.first_name || ' ' || COALESCE(g.last_name, '')) as guest_name,
           r.room_number, r.name as room_name,
           rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.property_id = ?
      AND b.status IN ('cancelled','no_show')
      AND b.check_in >= ? AND b.check_in <= ?
    ORDER BY b.updated_at DESC
    LIMIT 500
  `).all(PROPERTY_ID(), from, to);

  return res.json({ bookings: rows, count: rows.length });
});

module.exports = router;
