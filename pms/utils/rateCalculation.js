'use strict';

/**
 * calculateRatePlan — 6-layer pricing engine for the new rate_plan_id model.
 *
 * Layers:
 *   1. Room base rate (SADC per-person)
 *   2. International markup (if region = international)
 *   3. Meal components (per person, with optional international markup)
 *   4. Season uplift (date-range based, with applies_to_* flags)
 *   5. Channel markup (OTA/agent, applied after season)
 *   6. Nights multiplier → total_for_stay
 *
 * All currency values returned pre-tax, rounded to nearest whole number.
 * Caller is responsible for applying tax at booking creation time.
 */
function calculateRatePlan(db, params) {
  // ── Input parsing ───────────────────────────────────────────────────────────
  const property_id  = parseInt(params.property_id);
  const rate_plan_id = parseInt(params.rate_plan_id);
  const adults       = parseInt(params.adults);
  const children     = parseInt(params.children  ?? 0);
  const nights       = parseInt(params.nights    ?? 1);
  const check_in     = params.check_in;   // 'YYYY-MM-DD'
  const channel_id   = params.channel_id != null ? parseInt(params.channel_id) : null;

  if (channel_id !== null && !Number.isFinite(channel_id)) {
    throw new Error('channel_id must be a positive integer');
  }

  if (!Number.isFinite(property_id)  || property_id  < 1) throw new Error('property_id must be a positive integer');
  if (!Number.isFinite(rate_plan_id) || rate_plan_id < 1) throw new Error('rate_plan_id must be a positive integer');
  if (!Number.isFinite(adults)       || adults       < 1) throw new Error('adults must be >= 1');
  if (!Number.isFinite(children)     || children     < 0) throw new Error('children must be >= 0');
  if (!Number.isFinite(nights)       || nights       < 1) throw new Error('nights must be >= 1');
  if (!check_in || !/^\d{4}-\d{2}-\d{2}$/.test(check_in))  throw new Error('check_in must be YYYY-MM-DD');

  // ── Step 1: Load rate plan ──────────────────────────────────────────────────
  const ratePlan = db.prepare(
    'SELECT * FROM rate_plans WHERE id = ? AND property_id = ?'
  ).get(rate_plan_id, property_id);

  if (!ratePlan) throw new Error('Rate plan not found');

  // ── Step 2: Load room base rate ─────────────────────────────────────────────
  const roomType = db.prepare(
    'SELECT * FROM room_types WHERE id = ? AND property_id = ?'
  ).get(ratePlan.room_type_id, property_id);

  if (!roomType) throw new Error(`Room type ${ratePlan.room_type_id} not found`);

  const roomBaseRate = db.prepare(
    'SELECT * FROM room_base_rates WHERE room_type_id = ? AND property_id = ?'
  ).get(ratePlan.room_type_id, property_id);

  if (!roomBaseRate) throw new Error('No base rate for room type');

  // ── Step 3: Load international rate settings ────────────────────────────────
  const intlSettings = db.prepare(
    'SELECT * FROM international_rate_settings WHERE property_id = ?'
  ).get(property_id) || { markup_percent: 30, children_meal_pct: 50, children_room_pct: 0 };

  const markupPct      = parseFloat(intlSettings.markup_percent      ?? 30);
  const childrenMealPct = parseFloat(intlSettings.children_meal_pct  ?? 50);
  const childrenRoomPct = parseFloat(intlSettings.children_room_pct  ?? 0);

  // ── Step 4: Determine region ────────────────────────────────────────────────
  let region = 'sadc';
  let channelRow = null;

  if (channel_id != null) {
    channelRow = db.prepare(
      'SELECT * FROM channels WHERE id = ? AND property_id = ?'
    ).get(channel_id, property_id);
    if (channelRow) {
      region = channelRow.base_region || 'sadc';
    }
  }

  const isIntl = region === 'international';

  // ── Step 5: Compute room rate per night ─────────────────────────────────────
  const ratePerPerson = parseFloat(roomBaseRate.rate_per_person);
  const adultRoomCost    = ratePerPerson * adults;
  const childrenRoomCost = ratePerPerson * (children * childrenRoomPct / 100);
  let roomRatePerNight   = adultRoomCost + childrenRoomCost;

  if (isIntl) {
    roomRatePerNight = roomRatePerNight * (1 + markupPct / 100);
  }

  // ── Step 6: Compute meal total per night ────────────────────────────────────
  let mealTotalPerNight = 0;
  let mealComponentIds = [];

  try {
    mealComponentIds = JSON.parse(ratePlan.meal_components_json || '[]');
  } catch (_) {
    mealComponentIds = [];
  }

  if (Array.isArray(mealComponentIds) && mealComponentIds.length > 0) {
    const getMeal = db.prepare(
      'SELECT cost_per_person FROM meal_components WHERE id = ? AND active = 1'
    );
    for (const mcId of mealComponentIds) {
      const mc = getMeal.get(parseInt(mcId));
      if (mc) {
        const cost = parseFloat(mc.cost_per_person);
        mealTotalPerNight += cost * (adults + children * childrenMealPct / 100);
      }
    }
    if (isIntl) {
      mealTotalPerNight = mealTotalPerNight * (1 + markupPct / 100);
    }
  }

  // ── Step 7: Subtotal per night (pre-season, pre-channel) ────────────────────
  const subtotalPerNight = roomRatePerNight + mealTotalPerNight;

  // ── Step 8: Apply season uplift ─────────────────────────────────────────────
  const season = db.prepare(`
    SELECT * FROM seasons
    WHERE property_id = ?
      AND start_date <= ?
      AND end_date   >= ?
      AND active = 1
    ORDER BY id LIMIT 1
  `).get(property_id, check_in, check_in);

  let seasonApplied = null;
  let totalPerNight  = subtotalPerNight;

  if (season) {
    // Determine if the season applies to this booking's region/channel context
    let seasonApplies = false;
    if (channel_id != null && channelRow) {
      // Booking is via a channel — check applies_to_channels
      seasonApplies = !!season.applies_to_channels;
    } else if (isIntl) {
      seasonApplies = !!season.applies_to_international;
    } else {
      // sadc / direct
      seasonApplies = !!season.applies_to_sadc;
    }

    if (seasonApplies) {
      const uplift = parseFloat(season.uplift_percent ?? 0);
      totalPerNight = subtotalPerNight * (1 + uplift / 100);
      seasonApplied = {
        name:            season.name,
        uplift_percent:  uplift,
      };
    }
  }

  // ── Step 9: Apply channel markup (after season) ─────────────────────────────
  let channelApplied = null;

  if (channel_id != null && channelRow) {
    const channelMarkup = parseFloat(channelRow.markup_percent ?? 0);
    if (channelMarkup !== 0) {
      totalPerNight  = totalPerNight * (1 + channelMarkup / 100);
      channelApplied = {
        name:           channelRow.name,
        markup_percent: channelMarkup,
      };
    }
  }

  // ── Step 10: Total for stay ─────────────────────────────────────────────────
  const totalForStay = totalPerNight * nights;

  // ── Step 11: Round all currency values ──────────────────────────────────────
  const roundedRoomRatePerPerson  = Math.round(ratePerPerson);
  const roundedMealTotal          = Math.round(mealTotalPerNight);
  const roundedSubtotal           = Math.round(subtotalPerNight);
  const roundedTotalPerNight      = Math.round(totalPerNight);
  const roundedTotalForStay       = Math.round(totalForStay);

  // ── Step 12: Load tax rate from properties ──────────────────────────────────
  const property = db.prepare('SELECT tax_rate, currency FROM properties WHERE id = ?').get(property_id);
  const taxRate  = property ? parseFloat(property.tax_rate ?? 0) : 0;
  const currency = property ? (property.currency || 'ZAR') : 'ZAR';

  // ── Return ───────────────────────────────────────────────────────────────────
  return {
    rate_plan_id:                   ratePlan.id,
    rate_plan_name:                 ratePlan.name,
    room_type_id:                   ratePlan.room_type_id,
    room_type_name:                 roomType ? roomType.name : roomBaseRate.room_type_name,
    region,
    base_rate_per_person:           roundedRoomRatePerPerson,
    international_markup_percent:   isIntl ? markupPct : null,
    meal_total_per_night:           roundedMealTotal,
    subtotal_per_night:             roundedSubtotal,
    season_applied:                 seasonApplied,
    channel_applied:                channelApplied,
    total_per_night:                roundedTotalPerNight,
    total_for_stay:                 roundedTotalForStay,
    tax_rate:                       taxRate,
    currency,
  };
}

module.exports = { calculateRatePlan };
