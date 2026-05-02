'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');
const { generateQuotationPdf } = require('../utils/pdf');
const { calculateRatePlan } = require('../utils/rateCalculation');

const router = express.Router();
const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// POST /api/quotations/pdf
// Body: { rate_plan_id, check_in, check_out, adults, children, channel_id?,
//         region?, guest_name?, guest_email?, guest_phone?, special_requests? }
router.post('/pdf', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const { check_in, check_out, adults, children = 0, rate_plan_id,
            channel_id, region, guest_name, guest_email, guest_phone,
            special_requests } = req.body;

    if (!rate_plan_id || !check_in || !check_out || !adults) {
      return res.status(400).json({ error: 'rate_plan_id, check_in, check_out, adults are required' });
    }

    const ci = new Date(check_in), co = new Date(check_out);
    if (isNaN(ci) || isNaN(co) || co <= ci) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    const nights = Math.max(1, Math.round((co - ci) / 86400000));

    const result = calculateRatePlan(db, {
      property_id: PROPERTY_ID(),
      rate_plan_id,
      adults,
      children,
      nights,
      check_in,
      channel_id: channel_id || null,
      region: region || 'sadc',
    });

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());
    const taxRate = parseFloat(property.tax_rate ?? 0);
    const taxInclusive = property.tax_inclusive ?? 1;
    const totalForStay = result.total_for_stay;
    const taxAmount = taxInclusive
      ? Math.round(totalForStay * taxRate / (100 + taxRate))
      : Math.round(totalForStay * taxRate / 100);
    const totalAmount = taxInclusive ? totalForStay : totalForStay + taxAmount;

    const quote = {
      check_in,
      check_out,
      nights,
      adults: parseInt(adults),
      children: parseInt(children),
      room_type_name: result.room_type_name,
      rate_plan_name: result.rate_plan_name,
      region: result.region,
      base_rate_per_person: result.base_rate_per_person,
      meal_total_per_night: result.meal_total_per_night,
      total_per_night: result.total_per_night,
      total_for_stay: totalForStay,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      currency: result.currency,
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
    res.send(pdfBuffer);
  } catch (e) {
    console.error('[quotations/pdf]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
