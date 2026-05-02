'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateQuotationPdf } = require('../utils/pdf');
const { calculateRatePlan } = require('../utils/rateCalculation');

const router = express.Router();
const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

const WRITE_ROLES = ['owner', 'hotel_manager', 'front_desk', 'accountant'];

function generateQuoteRef(db) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const base = `QUO${yy}${mm}`;
  const last = db.prepare(`SELECT quote_ref FROM quotations WHERE property_id = ? AND quote_ref LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(PROPERTY_ID(), `${base}%`);
  const seq = last ? (parseInt(last.quote_ref.slice(-4)) + 1) : 1;
  return `${base}${String(seq).padStart(4, '0')}`;
}

function calcTax(db, totalForStay) {
  const property = db.prepare('SELECT tax_rate, tax_inclusive FROM properties WHERE id = ?').get(PROPERTY_ID());
  const taxRate = parseFloat(property?.tax_rate ?? 0);
  const taxInclusive = property?.tax_inclusive ?? 1;
  const taxAmount = taxInclusive
    ? Math.round(totalForStay * taxRate / (100 + taxRate))
    : Math.round(totalForStay * taxRate / 100);
  const totalAmount = taxInclusive ? totalForStay : totalForStay + taxAmount;
  return { taxAmount, totalAmount, taxRate, taxInclusive };
}

// GET /api/quotations — list open quotations
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const quotes = db.prepare(`
      SELECT * FROM quotations
      WHERE property_id = ? AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 100
    `).all(PROPERTY_ID());
    return res.json({ quotations: quotes });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/quotations — save a new quotation
router.post('/', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  try {
    const db = getDb();
    const { check_in, check_out, adults, children = 0, rate_plan_id,
            channel_id, region, guest_name, guest_email, guest_phone, special_requests } = req.body;

    if (!rate_plan_id || !check_in || !check_out || !adults) {
      return res.status(400).json({ error: 'rate_plan_id, check_in, check_out, adults are required' });
    }
    const ci = new Date(check_in), co = new Date(check_out);
    if (isNaN(ci) || isNaN(co) || co <= ci) return res.status(400).json({ error: 'Invalid date range' });
    const nights = Math.max(1, Math.round((co - ci) / 86400000));

    const result = calculateRatePlan(db, {
      property_id: PROPERTY_ID(),
      rate_plan_id: parseInt(rate_plan_id),
      adults: parseInt(adults),
      children: parseInt(children),
      nights,
      check_in,
      channel_id: channel_id || null,
      region: region || 'sadc',
    });

    const { taxAmount, totalAmount } = calcTax(db, result.total_for_stay);
    const property = db.prepare('SELECT currency, quote_validity_days FROM properties WHERE id = ?').get(PROPERTY_ID());
    const validDays = property?.quote_validity_days || 14;
    const validUntil = new Date(Date.now() + validDays * 86400000).toISOString().split('T')[0];
    const quoteRef = generateQuoteRef(db);

    const ins = db.prepare(`
      INSERT INTO quotations (
        property_id, quote_ref, guest_name, guest_email, guest_phone,
        room_type_id, room_type_name, rate_plan_id, rate_plan_name,
        check_in, check_out, nights, adults, children, region,
        channel_id, total_per_night, total_for_stay, tax_amount, total_amount,
        currency, season_name, special_requests, valid_until, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).run(
      PROPERTY_ID(), quoteRef,
      guest_name || null, guest_email || null, guest_phone || null,
      result.room_type_id, result.room_type_name,
      parseInt(rate_plan_id), result.rate_plan_name,
      check_in, check_out, nights, parseInt(adults), parseInt(children),
      result.region, channel_id || null,
      result.total_per_night, result.total_for_stay,
      taxAmount, totalAmount,
      property?.currency || result.currency || 'ZAR',
      result.season_applied?.name || null,
      special_requests || null, validUntil
    );

    const saved = db.prepare('SELECT * FROM quotations WHERE id = ?').get(ins.lastInsertRowid);
    return res.status(201).json({ quotation: saved });
  } catch (e) {
    console.error('[quotations POST]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/quotations/pdf — generate PDF (unsaved, for preview)
router.post('/pdf', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { check_in, check_out, adults, children = 0, rate_plan_id,
            channel_id, region, guest_name, guest_email, guest_phone, special_requests } = req.body;

    if (!rate_plan_id || !check_in || !check_out || !adults) {
      return res.status(400).json({ error: 'rate_plan_id, check_in, check_out, adults are required' });
    }
    const ci = new Date(check_in), co = new Date(check_out);
    if (isNaN(ci) || isNaN(co) || co <= ci) return res.status(400).json({ error: 'Invalid date range' });
    const nights = Math.max(1, Math.round((co - ci) / 86400000));

    const result = calculateRatePlan(db, {
      property_id: PROPERTY_ID(),
      rate_plan_id: parseInt(rate_plan_id),
      adults: parseInt(adults),
      children: parseInt(children),
      nights,
      check_in,
      channel_id: channel_id || null,
      region: region || 'sadc',
    });

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());
    const { taxAmount, totalAmount } = calcTax(db, result.total_for_stay);

    const quote = {
      check_in, check_out, nights,
      adults: parseInt(adults), children: parseInt(children),
      room_type_name: result.room_type_name,
      rate_plan_name: result.rate_plan_name,
      region: result.region,
      base_rate_per_person: result.base_rate_per_person,
      meal_total_per_night: result.meal_total_per_night,
      total_per_night: result.total_per_night,
      total_for_stay: result.total_for_stay,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: property?.currency || result.currency || 'ZAR',
      season_name: result.season_applied?.name || null,
      channel_name: result.channel_applied?.name || null,
      guest_name: guest_name || null,
      guest_email: guest_email || null,
      guest_phone: guest_phone || null,
      special_requests: special_requests || null,
    };

    const pdfBuffer = await generateQuotationPdf(quote, property);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="quotation-${check_in}.pdf"`);
    return res.send(pdfBuffer);
  } catch (e) {
    console.error('[quotations/pdf]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/quotations/:id/pdf — generate PDF for saved quotation
router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const quote = db.prepare('SELECT * FROM quotations WHERE id = ? AND property_id = ?').get(req.params.id, PROPERTY_ID());
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());
    const quoteData = {
      check_in: quote.check_in,
      check_out: quote.check_out,
      nights: quote.nights,
      adults: quote.adults,
      children: quote.children,
      room_type_name: quote.room_type_name,
      rate_plan_name: quote.rate_plan_name,
      region: quote.region,
      total_per_night: quote.total_per_night,
      total_for_stay: quote.total_for_stay,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      currency: quote.currency,
      season_name: quote.season_name,
      guest_name: quote.guest_name,
      guest_email: quote.guest_email,
      guest_phone: quote.guest_phone,
      special_requests: quote.special_requests,
    };

    const pdfBuffer = await generateQuotationPdf(quoteData, property);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="quotation-${quote.quote_ref}.pdf"`);
    return res.send(pdfBuffer);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/quotations/:id/convert — convert quotation to booking
router.post('/:id/convert', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  try {
    const db = getDb();
    const quote = db.prepare('SELECT * FROM quotations WHERE id = ? AND property_id = ?').get(req.params.id, PROPERTY_ID());
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });
    if (quote.status !== 'open') return res.status(409).json({ error: `Quotation is already ${quote.status}` });

    // Generate booking ref
    const now = Date.now();
    const bookingRef = `BK${String(now).slice(-8)}`;

    // Find or create guest
    let guestId = null;
    if (quote.guest_name) {
      const [firstName, ...rest] = (quote.guest_name || '').trim().split(' ');
      const lastName = rest.join(' ') || '-';
      const existing = quote.guest_email
        ? db.prepare('SELECT id FROM guests WHERE email = ? AND property_id = ?').get(quote.guest_email, PROPERTY_ID())
        : null;
      if (existing) {
        guestId = existing.id;
      } else {
        const gResult = db.prepare(`
          INSERT INTO guests (property_id, first_name, last_name, email, phone)
          VALUES (?, ?, ?, ?, ?)
        `).run(PROPERTY_ID(), firstName, lastName, quote.guest_email || null, quote.guest_phone || null);
        guestId = gResult.lastInsertRowid;
      }
    }

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());

    // Create booking
    const bookingResult = db.prepare(`
      INSERT INTO bookings (
        booking_ref, source, property_id, room_type_id, guest_id,
        check_in, check_out, nights, adults, children,
        room_rate, meal_total, extras_json,
        subtotal, tax_amount, tax_rate, discount_amount, total_amount,
        currency, commission_rate, commission_amount, net_to_property,
        status, payment_status, special_requests, rate_plan_id
      ) VALUES (?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?, ?, 0, ?, ?, 0, 0, ?, 'provisional', 'unpaid', ?, ?)
    `).run(
      bookingRef, PROPERTY_ID(), quote.room_type_id, guestId,
      quote.check_in, quote.check_out, quote.nights, quote.adults, quote.children,
      quote.total_per_night, quote.total_for_stay,
      quote.tax_amount, property?.tax_rate || 0,
      quote.total_amount, quote.currency, quote.total_amount,
      quote.special_requests || null, quote.rate_plan_id
    );

    const bookingId = bookingResult.lastInsertRowid;

    // Mark quotation as converted
    db.prepare(`UPDATE quotations SET status = 'converted', converted_booking_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(bookingId, quote.id);

    return res.json({ booking_id: bookingId, booking_ref: bookingRef });
  } catch (e) {
    console.error('[quotations convert]', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/quotations/:id — cancel quotation
router.delete('/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  try {
    const db = getDb();
    const quote = db.prepare('SELECT id FROM quotations WHERE id = ? AND property_id = ?').get(req.params.id, PROPERTY_ID());
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });
    db.prepare(`UPDATE quotations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(quote.id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;
