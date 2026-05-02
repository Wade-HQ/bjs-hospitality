'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendBookingConfirmation, sendBookingCancellation } = require('../utils/email');
const { calculateBookingPrice } = require('../utils/pricing');
const { calculateRatePlan } = require('../utils/rateCalculation');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// ---- helpers ----

function generateBookingRef(db) {
  const year = new Date().getFullYear();
  // Find max booking ref counter for this year at this property
  const row = db.prepare(`
    SELECT booking_ref FROM bookings
    WHERE booking_ref LIKE 'BJS-${year}-%' AND property_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(PROPERTY_ID());

  let counter = 1;
  if (row) {
    const parts = row.booking_ref.split('-');
    const last = parseInt(parts[2], 10);
    if (!isNaN(last)) counter = last + 1;
  }
  return `BJS-${year}-${String(counter).padStart(5, '0')}`;
}

function checkAvailability(db, roomId, checkIn, checkOut, excludeBookingId = null) {
  let query = `
    SELECT id FROM bookings
    WHERE room_id = ? AND property_id = ?
      AND status NOT IN ('cancelled','no_show')
      AND check_in < ? AND check_out > ?
  `;
  const params = [roomId, PROPERTY_ID(), checkOut, checkIn];

  if (excludeBookingId) {
    query += ' AND id != ?';
    params.push(excludeBookingId);
  }

  const conflictingBooking = db.prepare(query).get(...params);
  if (conflictingBooking) return false;

  // Check availability blocks
  const block = db.prepare(`
    SELECT id FROM availability_blocks
    WHERE room_id = ? AND property_id = ?
      AND start_date < ? AND end_date > ?
  `).get(roomId, PROPERTY_ID(), checkOut, checkIn);

  return !block;
}

function getRoomRate(db, roomTypeId, checkIn, checkOut, nights, source) {
  // Try to find a matching rate
  const channel = source === 'direct' ? 'direct' : 'ota';
  const rate = db.prepare(`
    SELECT rate_per_night FROM rates
    WHERE property_id = ? AND room_type_id = ?
      AND active = 1
      AND (channel = 'all' OR channel = ?)
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to >= ?)
      AND (min_nights IS NULL OR min_nights <= ?)
      AND (max_nights IS NULL OR max_nights >= ?)
    ORDER BY channel DESC, valid_from DESC
    LIMIT 1
  `).get(PROPERTY_ID(), roomTypeId, channel, checkIn, checkOut, nights, nights);

  if (rate) return rate.rate_per_night;

  // Fall back to room_type base_rate
  const rt = db.prepare('SELECT base_rate FROM room_types WHERE id = ? AND property_id = ?')
    .get(roomTypeId, PROPERTY_ID());
  return rt ? rt.base_rate : 0;
}

function getBookingById(db, id) {
  return db.prepare(`
    SELECT b.*,
           g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
           g.nationality, g.id_type, g.id_number, g.vip_flag,
           r.room_number, r.floor, r.status as room_status,
           rt.name as room_type_name, rt.max_occupancy,
           p.name as property_name, p.currency as property_currency,
           p.tax_label, p.tax_rate as property_tax_rate
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN properties p ON p.id = b.property_id
    WHERE b.id = ? AND b.property_id = ?
  `).get(id, PROPERTY_ID());
}

// ---- routes ----

// GET /api/bookings
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const {
    status, payment_status, from, to, check_in, check_out,
    source, room_type_id, room_type, guest_id, search,
    page = 1, limit = 50
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [PROPERTY_ID()];
  let where = 'b.property_id = ?';

  if (status) { where += ' AND b.status = ?'; params.push(status); }
  if (payment_status) { where += ' AND b.payment_status = ?'; params.push(payment_status); }
  if (source) { where += ' AND b.source = ?'; params.push(source); }
  const rtId = room_type_id || room_type;
  if (rtId) { where += ' AND b.room_type_id = ?'; params.push(rtId); }
  if (guest_id) { where += ' AND b.guest_id = ?'; params.push(guest_id); }
  if (from) { where += ' AND b.check_out >= ?'; params.push(from); }
  if (to) { where += ' AND b.check_in <= ?'; params.push(to); }
  if (check_in) { where += ' AND b.check_in = ?'; params.push(check_in); }
  if (check_out) { where += ' AND b.check_out = ?'; params.push(check_out); }
  if (search) {
    where += ` AND (b.booking_ref LIKE ? OR g.first_name LIKE ? OR g.last_name LIKE ?
                    OR g.email LIKE ? OR g.phone LIKE ? OR b.channel_booking_ref LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE ${where}
  `).get(...params);

  const rows = db.prepare(`
    SELECT b.id, b.booking_ref, b.source, b.check_in, b.check_out, b.nights,
           b.adults, b.children, b.status, b.payment_status,
           b.total_amount, b.currency, b.room_rate,
           b.commission_amount, b.net_to_property,
           b.room_id, b.room_type_id, b.guest_id,
           b.channel_booking_ref, b.special_requests,
           b.created_at, b.updated_at,
           g.first_name, g.last_name,
           (g.first_name || ' ' || g.last_name) as guest_name,
           g.email as guest_email, g.phone as guest_phone, g.vip_flag,
           r.room_number, r.name as room_name,
           rt.name as room_type_name,
           (b.total_amount - COALESCE((
             SELECT SUM(bp.amount) FROM booking_payments bp WHERE bp.booking_id = b.id
           ), 0)) as balance_due
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE ${where}
    ORDER BY b.check_in DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  return res.json({
    bookings: rows,
    pagination: {
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRow.total / parseInt(limit))
    }
  });
});

// GET /api/bookings/price-preview
router.get('/price-preview', requireAuth, (req, res) => {
  const db = getDb();
  const { room_type_id, region, check_in, check_out, adults, children, meal_package_id, rate_plan_id } = req.query;

  const empty = { adjusted_rate: 0, accommodation_subtotal: 0, meal_total: 0, subtotal: 0, tax_amount: 0, total_amount: 0, season_name: null };

  if (!check_in || !check_out || !adults) return res.json(empty);

  const ciDate = new Date(check_in);
  const coDate = new Date(check_out);
  if (isNaN(ciDate) || isNaN(coDate) || coDate <= ciDate) return res.json(empty);

  const nights = Math.max(1, Math.round((coDate - ciDate) / (1000 * 60 * 60 * 24)));

  // New rate plan path
  if (rate_plan_id) {
    try {
      const result = calculateRatePlan(db, {
        property_id: PROPERTY_ID(),
        rate_plan_id: parseInt(rate_plan_id),
        adults: parseInt(adults),
        children: parseInt(children || 0),
        nights,
        check_in,
      });
      const property = db.prepare('SELECT tax_rate FROM properties WHERE id = ?').get(PROPERTY_ID());
      const taxRate = property?.tax_rate || 0;
      const taxAmount = Math.round(result.total_for_stay * (taxRate / 100));
      return res.json({
        ...result,
        accommodation_subtotal: result.total_for_stay - result.meal_total_per_night * nights,
        meal_total: result.meal_total_per_night * nights,
        subtotal: result.total_for_stay,
        tax_amount: taxAmount,
        total_amount: result.total_for_stay + taxAmount,
        season_name: result.season_applied?.name || null,
      });
    } catch (e) {
      return res.json(empty);
    }
  }

  // Legacy path: region + meal_package_id
  if (!room_type_id) return res.json(empty);

  try {
    const result = calculateBookingPrice(db, {
      property_id: PROPERTY_ID(),
      room_type_id: parseInt(room_type_id),
      region: region || 'international',
      check_in,
      check_out,
      nights,
      adults: parseInt(adults) || 1,
      children: parseInt(children) || 0,
      meal_package_id: meal_package_id ? parseInt(meal_package_id) : null,
    });
    return res.json(result);
  } catch (e) {
    return res.json(empty);
  }
});

// GET /api/bookings/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const booking = getBookingById(db, req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const payments = db.prepare(`
    SELECT bp.*, u.name as created_by_name
    FROM booking_payments bp
    LEFT JOIN users u ON u.id = bp.created_by
    WHERE bp.booking_id = ? AND bp.property_id = ?
    ORDER BY bp.payment_date DESC
  `).all(req.params.id, PROPERTY_ID());

  const invoices = db.prepare(`
    SELECT id, invoice_number, status, total_amount, currency, due_date, paid_date, issued_to, created_at
    FROM invoices
    WHERE booking_id = ? AND property_id = ?
    ORDER BY created_at DESC
  `).all(req.params.id, PROPERTY_ID());

  const commission = db.prepare(`
    SELECT * FROM ota_commissions WHERE booking_id = ? AND hotel_property_id = ?
  `).get(req.params.id, PROPERTY_ID());

  const auditLog = db.prepare(`
    SELECT bal.*, u.name as user_name
    FROM booking_audit_log bal
    LEFT JOIN users u ON u.id = bal.user_id
    WHERE bal.booking_id = ?
    ORDER BY bal.created_at DESC
  `).all(req.params.id);

  // Parse JSON fields
  let extras = [];
  try { extras = JSON.parse(booking.extras_json || '[]'); } catch (e) {}

  return res.json({
    booking: { ...booking, extras },
    payments,
    invoices,
    commission,
    auditLog
  });
});

// POST /api/bookings
router.post('/', requireAuth, requireRole('owner','hotel_manager','front_desk','accountant'), (req, res) => {
  const db = getDb();
  const {
    source = 'direct',
    room_id,
    room_type_id,
    guest_id,
    // Guest fields if creating new guest
    first_name, last_name, email, phone, nationality,
    id_type, id_number, id_expiry, date_of_birth,
    address, city, country, vip_flag, guest_notes,
    // Booking fields
    check_in, check_out,
    adults = 1, children = 0,
    special_requests, internal_notes,
    channel_booking_ref,
    extras_json,
    discount_amount = 0,
    commission_rate,
    // Payment (optional)
    payment_amount, payment_method, payment_date, payment_reference, payment_notes,
    region,
    meal_package_id,
    rate_plan_id,
  } = req.body;

  if (!check_in || !check_out) {
    return res.status(400).json({ error: 'check_in and check_out are required' });
  }
  if (!room_id && !room_type_id) {
    return res.status(400).json({ error: 'room_id or room_type_id is required' });
  }
  // region is required only when not using rate_plan_id
  if (!rate_plan_id && region && !['international', 'sadc'].includes(region)) {
    return res.status(400).json({ error: 'region must be international or sadc' });
  }
  if (!guest_id && (!first_name || !last_name)) {
    return res.status(400).json({ error: 'guest_id or guest first/last name required' });
  }

  const ciDate = new Date(check_in);
  const coDate = new Date(check_out);
  if (coDate <= ciDate) {
    return res.status(400).json({ error: 'check_out must be after check_in' });
  }

  const nights = Math.round((coDate - ciDate) / (1000 * 60 * 60 * 24));

  // Resolve room: if room_id given, check it directly; if only room_type_id, auto-assign first available
  let resolvedRoomId = room_id ? parseInt(room_id, 10) : null;

  if (resolvedRoomId) {
    const available = checkAvailability(db, resolvedRoomId, check_in, check_out);
    if (!available) {
      return res.status(409).json({ error: 'Room is not available for the selected dates' });
    }
  } else if (room_type_id) {
    // Auto-assign: find first available room of this type
    const candidates = db.prepare(`
      SELECT id FROM rooms
      WHERE room_type_id = ? AND property_id = ? AND status != 'blocked'
      ORDER BY room_number
    `).all(room_type_id, PROPERTY_ID());

    for (const c of candidates) {
      if (checkAvailability(db, c.id, check_in, check_out)) {
        resolvedRoomId = c.id;
        break;
      }
    }
    if (!resolvedRoomId) {
      return res.status(409).json({ error: 'No rooms available for this room type on the selected dates' });
    }
  }

  // Resolve room_type_id from room if not provided
  let resolvedRoomTypeId = room_type_id ? parseInt(room_type_id, 10) : null;
  if (resolvedRoomId && !resolvedRoomTypeId) {
    const r = db.prepare('SELECT room_type_id FROM rooms WHERE id = ? AND property_id = ?')
      .get(resolvedRoomId, PROPERTY_ID());
    if (r) resolvedRoomTypeId = r.room_type_id;
  }

  // Resolve or create guest
  let resolvedGuestId = guest_id;
  if (!resolvedGuestId) {
    // Try to find existing guest by email or id_number at this property
    let existingGuest = null;
    if (email) {
      existingGuest = db.prepare(`
        SELECT id FROM guests WHERE email = ? AND property_id = ?
      `).get(email.trim().toLowerCase(), PROPERTY_ID());
    }
    if (!existingGuest && id_number) {
      existingGuest = db.prepare(`
        SELECT id FROM guests WHERE id_number = ? AND property_id = ?
      `).get(id_number, PROPERTY_ID());
    }

    if (existingGuest) {
      resolvedGuestId = existingGuest.id;
    } else {
      const guestResult = db.prepare(`
        INSERT INTO guests (property_id, first_name, last_name, email, phone, nationality,
          id_type, id_number, id_expiry, date_of_birth, address, city, country, vip_flag, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        PROPERTY_ID(),
        first_name.trim(), last_name.trim(),
        email ? email.trim().toLowerCase() : null,
        phone || null, nationality || null,
        id_type || null, id_number || null, id_expiry || null,
        date_of_birth || null, address || null, city || null, country || null,
        vip_flag ? 1 : 0, guest_notes || null
      );
      resolvedGuestId = guestResult.lastInsertRowid;
    }
  }

  // Get property for defaults
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());

  // Calculate financials using the pricing utility
  let roomRate, mealTotal, subtotal, taxAmount, totalAmount, seasonName;
  if (rate_plan_id) {
    // New rate plan path
    try {
      const rpResult = calculateRatePlan(db, {
        property_id: PROPERTY_ID(),
        rate_plan_id: parseInt(rate_plan_id),
        adults: parseInt(adults),
        children: parseInt(children || 0),
        nights,
        check_in,
      });
      const property = db.prepare('SELECT tax_rate FROM properties WHERE id = ?').get(PROPERTY_ID());
      const taxRate = property?.tax_rate || 0;
      const taxAmt = Math.round(rpResult.total_for_stay * (taxRate / 100));
      roomRate = rpResult.total_per_night;
      mealTotal = rpResult.meal_total_per_night * nights;
      subtotal = rpResult.total_for_stay;
      taxAmount = taxAmt;
      totalAmount = rpResult.total_for_stay + taxAmt;
      seasonName = rpResult.season_applied?.name || null;
    } catch (e) {
      console.error('[bookings] rate plan pricing error:', e.message);
      return res.status(400).json({ error: e.message });
    }
  } else {
    // Legacy path: region + meal_package_id
    try {
      const pricing = calculateBookingPrice(db, {
        property_id: PROPERTY_ID(),
        room_type_id: resolvedRoomTypeId,
        region: region || 'international',
        check_in,
        check_out,
        nights,
        adults: parseInt(adults),
        children: parseInt(children || 0),
        meal_package_id: meal_package_id ? parseInt(meal_package_id) : null,
      });
      roomRate = pricing.adjusted_rate;
      mealTotal = pricing.meal_total;
      subtotal = pricing.subtotal;
      taxAmount = pricing.tax_amount;
      totalAmount = pricing.total_amount;
      seasonName = null;
    } catch (e) {
      console.error('[bookings] pricing error:', e.message);
      return res.status(422).json({ error: `Pricing error: ${e.message}` });
    }
  }

  const effectiveCommissionRate = commission_rate !== undefined
    ? parseFloat(commission_rate)
    : (source !== 'direct' ? (property.commission_rate_percent || 15) : 0);

  const commissionAmount = totalAmount * (effectiveCommissionRate / 100);
  const netToProperty = totalAmount - commissionAmount;

  // Generate booking ref
  const bookingRef = generateBookingRef(db);

  // Insert booking
  const bookingResult = db.prepare(`
    INSERT INTO bookings (
      booking_ref, source, property_id, room_id, room_type_id, guest_id,
      check_in, check_out, nights, adults, children,
      room_rate, meal_package_id, meal_total, extras_json,
      subtotal, tax_amount, tax_rate, discount_amount, total_amount,
      currency, commission_rate, commission_amount, net_to_property,
      status, payment_status, special_requests, internal_notes, channel_booking_ref, region,
      rate_plan_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    bookingRef, source, PROPERTY_ID(),
    resolvedRoomId || null, resolvedRoomTypeId || null, resolvedGuestId,
    check_in, check_out, nights, parseInt(adults), parseInt(children || 0),
    roomRate,
    meal_package_id ? parseInt(meal_package_id) : null,
    mealTotal,
    extras_json || '[]',
    subtotal, taxAmount,
    property.tax_rate || 0,
    parseFloat(discount_amount || 0), totalAmount,
    property.currency || 'USD',
    effectiveCommissionRate, commissionAmount, netToProperty,
    'confirmed', 'unpaid',
    special_requests || null, internal_notes || null,
    channel_booking_ref || null,
    rate_plan_id ? null : (region || 'international'),
    rate_plan_id ? parseInt(rate_plan_id) : null
  );

  const newBookingId = bookingResult.lastInsertRowid;

  // Mark room as occupied if check-in is today
  if (resolvedRoomId) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (check_in === todayStr) {
      db.prepare(`UPDATE rooms SET status = 'occupied' WHERE id = ? AND property_id = ?`)
        .run(resolvedRoomId, PROPERTY_ID());
    }
  }

  // If OTA source: create commission record
  if (source === 'ota_internal' || (source !== 'direct' && effectiveCommissionRate > 0)) {
    const dueDate = new Date(check_out);
    dueDate.setDate(dueDate.getDate() + 14); // due 14 days after checkout
    db.prepare(`
      INSERT INTO ota_commissions (booking_id, hotel_property_id, amount, currency, status, due_date)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(
      newBookingId, PROPERTY_ID(), commissionAmount,
      property.currency || 'USD', dueDate.toISOString().slice(0, 10)
    );
  }

  // Audit log
  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, new_value)
    VALUES (?, ?, 'created', ?)
  `).run(newBookingId, req.user.id, JSON.stringify({ booking_ref: bookingRef, status: 'confirmed' }));

  // Notification
  const guest = db.prepare('SELECT first_name, last_name, email FROM guests WHERE id = ?').get(resolvedGuestId);
  createNotification(
    db, 'new_booking', 'New Booking',
    `Booking ${bookingRef} for ${guest.first_name} ${guest.last_name} (${check_in} → ${check_out})`,
    newBookingId, 'bookings'
  );

  // Send guest confirmation email (non-blocking)
  if (guest.email) {
    const createdBooking = getBookingById(db, newBookingId);
    sendBookingConfirmation({
      ...createdBooking,
      guest_email: guest.email,
      first_name:  guest.first_name,
    }, property).catch(() => {});
  }

  // Optional initial payment
  if (payment_amount && parseFloat(payment_amount) > 0) {
    db.prepare(`
      INSERT INTO booking_payments (booking_id, property_id, amount, currency, payment_method, payment_date, reference, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newBookingId, PROPERTY_ID(),
      parseFloat(payment_amount), property.currency || 'USD',
      payment_method || 'bank_transfer',
      payment_date || new Date().toISOString().slice(0, 10),
      payment_reference || null, payment_notes || null,
      req.user.id
    );

    // Update payment status
    if (parseFloat(payment_amount) >= totalAmount) {
      db.prepare(`UPDATE bookings SET payment_status = 'fully_paid' WHERE id = ?`).run(newBookingId);
    } else {
      db.prepare(`UPDATE bookings SET payment_status = 'deposit_paid' WHERE id = ?`).run(newBookingId);
    }
  }

  const created = getBookingById(db, newBookingId);
  return res.status(201).json({ booking: created });
});

// PUT /api/bookings/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','front_desk','accountant'), (req, res) => {
  const db = getDb();
  const existing = getBookingById(db, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const {
    room_id, room_type_id, check_in, check_out,
    adults, children, special_requests, internal_notes,
    channel_booking_ref, status, payment_status,
    discount_amount, extras_json,
    guest_id, region, meal_package_id, source, rate_plan_id,
  } = req.body;

  if (guest_id !== undefined) {
    const guestExists = db.prepare(`
      SELECT g.id FROM guests g
      WHERE g.id = ? AND (g.property_id = ? OR EXISTS (
        SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
      ))
    `).get(guest_id, PROPERTY_ID(), PROPERTY_ID());
    if (!guestExists) return res.status(400).json({ error: 'Guest not found' });
  }
  if (region !== undefined && !['international', 'sadc'].includes(region)) {
    return res.status(400).json({ error: 'region must be international or sadc' });
  }
  const VALID_SOURCES = ['direct', 'ota_internal', 'booking_com', 'airbnb', 'expedia', 'google'];
  if (source !== undefined && source !== null && source !== '' && !VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `source must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  // If changing dates or room, check availability
  const newCheckIn = check_in || existing.check_in;
  const newCheckOut = check_out || existing.check_out;
  const newRoomId = room_id !== undefined ? room_id : existing.room_id;

  if (newRoomId && (check_in || check_out || room_id !== undefined)) {
    const available = checkAvailability(db, newRoomId, newCheckIn, newCheckOut, existing.id);
    if (!available) {
      return res.status(409).json({ error: 'Room is not available for the selected dates' });
    }
  }

  // Recalculate financials if dates/discount changed
  let subtotal = existing.subtotal;
  let taxAmount = existing.tax_amount;
  let totalAmount = existing.total_amount;
  let nights = existing.nights;

  if (check_in || check_out || discount_amount !== undefined || extras_json !== undefined ||
      region !== undefined || meal_package_id !== undefined ||
      rate_plan_id !== undefined ||
      adults !== undefined || children !== undefined) {
    const ciDate = new Date(newCheckIn);
    const coDate = new Date(newCheckOut);
    nights = Math.round((coDate - ciDate) / (1000 * 60 * 60 * 24));
    const extras = (() => {
      const src = extras_json !== undefined ? extras_json : existing.extras_json;
      try { return JSON.parse(src || '[]'); } catch { return []; }
    })();
    const extrasTotal = extras.reduce((sum, e) => sum + ((e.quantity || 1) * (e.unit_price || 0)), 0);
    const disc = discount_amount !== undefined ? parseFloat(discount_amount) : (existing.discount_amount || 0);

    // Determine effective rate_plan_id: new value, existing value, or null
    const effectiveRatePlanId = rate_plan_id !== undefined
      ? (rate_plan_id || null)
      : (existing.rate_plan_id || null);

    if (effectiveRatePlanId) {
      // New rate plan path
      try {
        const rpResult = calculateRatePlan(db, {
          property_id: PROPERTY_ID(),
          rate_plan_id: parseInt(effectiveRatePlanId),
          adults: parseInt(adults !== undefined ? adults : existing.adults),
          children: parseInt(children !== undefined ? children : (existing.children || 0)),
          nights,
          check_in: newCheckIn,
        });
        const taxRate = existing.tax_rate || 0;
        const taxAmt = Math.round(rpResult.total_for_stay * (taxRate / 100));
        subtotal = rpResult.total_for_stay + extrasTotal - disc;
        taxAmount = subtotal * (taxRate / 100);
        totalAmount = subtotal + taxAmount;
      } catch (e) {
        subtotal = existing.subtotal;
        taxAmount = existing.tax_amount;
        totalAmount = existing.total_amount;
      }
    } else {
      // Legacy path
      try {
        const pricing = calculateBookingPrice(db, {
          property_id: PROPERTY_ID(),
          room_type_id: room_type_id || existing.room_type_id,
          region: region !== undefined ? region : (existing.region || 'international'),
          check_in: newCheckIn,
          check_out: newCheckOut,
          nights,
          adults: parseInt(adults !== undefined ? adults : existing.adults),
          children: parseInt(children !== undefined ? children : existing.children),
          meal_package_id: meal_package_id !== undefined ? meal_package_id : existing.meal_package_id,
        });
        subtotal = pricing.accommodation_subtotal + pricing.meal_total + extrasTotal - disc;
        const taxRate = existing.tax_rate || 0;
        taxAmount = subtotal * (taxRate / 100);
        totalAmount = subtotal + taxAmount;
      } catch (e) {
        subtotal = existing.subtotal;
        taxAmount = existing.tax_amount;
        totalAmount = existing.total_amount;
      }
    }
  }

  const oldValues = JSON.stringify({
    status: existing.status, room_id: existing.room_id,
    check_in: existing.check_in, check_out: existing.check_out
  });

  db.prepare(`
    UPDATE bookings SET
      room_id = COALESCE(?, room_id),
      room_type_id = COALESCE(?, room_type_id),
      check_in = COALESCE(?, check_in),
      check_out = COALESCE(?, check_out),
      nights = ?,
      adults = COALESCE(?, adults),
      children = COALESCE(?, children),
      subtotal = ?,
      tax_amount = ?,
      total_amount = ?,
      discount_amount = COALESCE(?, discount_amount),
      extras_json = COALESCE(?, extras_json),
      special_requests = COALESCE(?, special_requests),
      internal_notes = COALESCE(?, internal_notes),
      channel_booking_ref = COALESCE(?, channel_booking_ref),
      status = COALESCE(?, status),
      payment_status = COALESCE(?, payment_status),
      guest_id = COALESCE(?, guest_id),
      region = COALESCE(?, region),
      meal_package_id = COALESCE(?, meal_package_id),
      source = COALESCE(?, source),
      rate_plan_id = COALESCE(?, rate_plan_id),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(
    room_id || null, room_type_id || null,
    check_in || null, check_out || null,
    nights,
    adults || null, children !== undefined ? parseInt(children) : null,
    subtotal, taxAmount, totalAmount,
    discount_amount !== undefined ? parseFloat(discount_amount) : null,
    extras_json || null,
    special_requests || null, internal_notes || null,
    channel_booking_ref || null,
    status || null, payment_status || null,
    guest_id !== undefined ? guest_id : null, region !== undefined ? region : null,
    meal_package_id !== undefined ? (meal_package_id || null) : null, source || null,
    rate_plan_id !== undefined ? (rate_plan_id ? parseInt(rate_plan_id) : null) : null,
    req.params.id, PROPERTY_ID()
  );

  const newValues = JSON.stringify({ status: status || existing.status, check_in: newCheckIn, check_out: newCheckOut });
  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'updated', ?, ?)
  `).run(req.params.id, req.user.id, oldValues, newValues);

  const updated = getBookingById(db, req.params.id);
  return res.json({ booking: updated });
});

// DELETE /api/bookings/:id (cancel)
router.delete('/:id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = getBookingById(db, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  db.prepare(`
    UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(req.params.id, PROPERTY_ID());

  if (existing.room_id) {
    db.prepare(`UPDATE rooms SET status = 'available' WHERE id = ? AND property_id = ?`)
      .run(existing.room_id, PROPERTY_ID());
  }

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'cancelled', ?, ?)
  `).run(req.params.id, req.user.id, existing.status, 'cancelled');

  createNotification(
    db, 'cancellation', 'Booking Cancelled',
    `Booking ${existing.booking_ref} has been cancelled`,
    existing.id, 'bookings'
  );

  return res.json({ ok: true });
});

// POST /api/bookings/:id/check-in
router.post('/:id/check-in', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const existing = getBookingById(db, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  if (!['confirmed', 'provisional'].includes(existing.status)) {
    return res.status(400).json({ error: `Cannot check in a booking with status: ${existing.status}` });
  }

  db.prepare(`
    UPDATE bookings SET status = 'checked_in', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(req.params.id, PROPERTY_ID());

  if (existing.room_id) {
    db.prepare(`UPDATE rooms SET status = 'occupied' WHERE id = ? AND property_id = ?`)
      .run(existing.room_id, PROPERTY_ID());
  }

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'checked_in', ?, 'checked_in')
  `).run(req.params.id, req.user.id, existing.status);

  createNotification(
    db, 'check_in_today', 'Guest Checked In',
    `${existing.first_name} ${existing.last_name} checked in (${existing.booking_ref})`,
    existing.id, 'bookings'
  );

  const updated = getBookingById(db, req.params.id);
  return res.json({ booking: updated });
});

// POST /api/bookings/:id/check-out
router.post('/:id/check-out', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const existing = getBookingById(db, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  if (existing.status !== 'checked_in') {
    return res.status(400).json({ error: `Cannot check out a booking with status: ${existing.status}` });
  }

  // Check outstanding balance
  const payments = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as paid_total
    FROM booking_payments WHERE booking_id = ? AND property_id = ?
  `).get(req.params.id, PROPERTY_ID());

  const outstandingBalance = existing.total_amount - (payments.paid_total || 0);
  const hasOutstandingBalance = outstandingBalance > 0.01;

  db.prepare(`
    UPDATE bookings SET status = 'checked_out', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(req.params.id, PROPERTY_ID());

  if (existing.room_id) {
    db.prepare(`UPDATE rooms SET status = 'available' WHERE id = ? AND property_id = ?`)
      .run(existing.room_id, PROPERTY_ID());
  }

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'checked_out', ?, 'checked_out')
  `).run(req.params.id, req.user.id, existing.status);

  createNotification(
    db, 'check_out_today', 'Guest Checked Out',
    `${existing.first_name} ${existing.last_name} checked out (${existing.booking_ref})${hasOutstandingBalance ? ` - Outstanding balance: ${existing.currency} ${outstandingBalance.toFixed(2)}` : ''}`,
    existing.id, 'bookings'
  );

  const updated = getBookingById(db, req.params.id);
  return res.json({ booking: updated, hasOutstandingBalance, outstandingBalance });
});

// POST /api/bookings/:id/cancel
router.post('/:id/cancel', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const existing = getBookingById(db, req.params.id);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  if (['cancelled', 'checked_out'].includes(existing.status)) {
    return res.status(400).json({ error: `Cannot cancel a booking with status: ${existing.status}` });
  }

  const { reason } = req.body;

  db.prepare(`
    UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(req.params.id, PROPERTY_ID());

  if (existing.room_id) {
    db.prepare(`UPDATE rooms SET status = 'available' WHERE id = ? AND property_id = ?`)
      .run(existing.room_id, PROPERTY_ID());
  }

  db.prepare(`
    INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value)
    VALUES (?, ?, 'cancelled', ?, ?)
  `).run(req.params.id, req.user.id, existing.status, JSON.stringify({ status: 'cancelled', reason: reason || null }));

  createNotification(
    db, 'cancellation', 'Booking Cancelled',
    `Booking ${existing.booking_ref} cancelled${reason ? ': ' + reason : ''}`,
    existing.id, 'bookings'
  );

  // Send cancellation email to guest (non-blocking)
  const guestForCancel   = db.prepare(`SELECT first_name, last_name, email FROM guests WHERE id = ?`).get(existing.guest_id);
  const propertyForEmail = db.prepare(`SELECT name, contact_email, contact_phone FROM properties WHERE id = ?`).get(PROPERTY_ID());
  if (guestForCancel?.email && propertyForEmail) {
    sendBookingCancellation({
      ...existing,
      guest_email: guestForCancel.email,
      first_name:  guestForCancel.first_name,
    }, propertyForEmail, reason || null).catch(() => {});
  }

  const updated = getBookingById(db, req.params.id);
  return res.json({ booking: updated });
});

// POST /api/bookings/:id/swap-room
router.post('/:id/swap-room', requireAuth, requireRole('owner','hotel_manager','front_desk'), (req, res) => {
  const db = getDb();
  const { target_room_id } = req.body;
  if (!target_room_id) return res.status(400).json({ error: 'target_room_id is required' });

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  if (['cancelled', 'checked_out', 'no_show'].includes(booking.status)) {
    return res.status(400).json({ error: 'Cannot swap room on a completed/cancelled booking' });
  }

  const targetRoom = db.prepare('SELECT * FROM rooms WHERE id = ? AND property_id = ?')
    .get(target_room_id, PROPERTY_ID());
  if (!targetRoom) return res.status(404).json({ error: 'Target room not found' });

  const doSwap = db.transaction(() => {
    const conflict = db.prepare(`
      SELECT id, booking_ref FROM bookings
      WHERE room_id = ? AND property_id = ? AND id != ?
        AND status NOT IN ('cancelled','no_show','checked_out')
        AND check_in < ? AND check_out > ?
    `).get(target_room_id, PROPERTY_ID(), booking.id, booking.check_out, booking.check_in);
    if (conflict) return { conflict };

    db.prepare('UPDATE bookings SET room_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(target_room_id, booking.id);

    try {
      db.prepare(`INSERT INTO booking_audit_log (booking_id, user_id, action, old_value, new_value) VALUES (?, ?, 'room_swapped', ?, ?)`)
        .run(booking.id, req.user.id, String(booking.room_id), String(target_room_id));
    } catch (e) { console.error('audit log write failed:', e.message); }

    return { conflict: null };
  });

  const swapResult = doSwap();
  if (swapResult.conflict) {
    return res.status(409).json({ error: `Room already booked (${swapResult.conflict.booking_ref}) for those dates` });
  }

  const updated = getBookingById(db, booking.id);
  return res.json({ booking: updated, message: `Moved to room ${targetRoom.room_number || targetRoom.name}` });
});

module.exports = router;
