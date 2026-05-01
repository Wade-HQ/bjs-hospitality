'use strict';

/**
 * calculateBookingPrice — compute all financial fields for a booking.
 *
 * Returns: { adjusted_rate, accommodation_subtotal, meal_total,
 *            subtotal, tax_amount, total_amount, season_name }
 */
function calculateBookingPrice(db, {
  property_id,
  room_type_id,
  region,
  check_in,
  check_out,
  nights,
  adults,
  children,
  meal_package_id,
}) {
  // 1. Base rate
  const rtr = db.prepare(`
    SELECT rate_per_person, single_supplement_multiplier, children_pct
    FROM room_type_rates
    WHERE room_type_id = ? AND region = ?
  `).get(room_type_id, region || 'international');

  const ratePerPerson = rtr ? rtr.rate_per_person : 0;
  const singleMultiplier = rtr ? rtr.single_supplement_multiplier : 1.5;
  const childrenPct = rtr ? rtr.children_pct : 50;

  // 2. Seasonal adjustment (first match on check_in date)
  const season = db.prepare(`
    SELECT name, pct_change FROM seasonal_adjustments
    WHERE property_id = ? AND start_date <= ? AND end_date >= ?
    ORDER BY id LIMIT 1
  `).get(property_id, check_in, check_in);

  const pctChange = season ? season.pct_change : 0;
  const adjustedRate = ratePerPerson * (1 + pctChange / 100);

  // 3. Nightly occupancy cost
  let nightlyAccommodation;
  if (parseInt(adults) === 1) {
    nightlyAccommodation = adjustedRate * singleMultiplier;
  } else {
    nightlyAccommodation = adjustedRate * parseInt(adults);
  }
  nightlyAccommodation += adjustedRate * (childrenPct / 100) * parseInt(children || 0);

  // 4. Accommodation subtotal
  const accommodationSubtotal = nightlyAccommodation * parseInt(nights);

  // 5. Meals
  let mealTotal = 0;
  if (meal_package_id) {
    const mp = db.prepare('SELECT price_per_person FROM meal_packages WHERE id = ? AND property_id = ?')
      .get(meal_package_id, property_id);
    if (mp) {
      mealTotal = mp.price_per_person * (parseInt(adults) + parseInt(children || 0)) * parseInt(nights);
    }
  }

  // 6. Tax
  const property = db.prepare('SELECT tax_rate FROM properties WHERE id = ?').get(property_id);
  const taxRate = property ? (property.tax_rate || 0) : 0;
  const subtotal = accommodationSubtotal + mealTotal;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  return {
    adjusted_rate: adjustedRate,
    accommodation_subtotal: accommodationSubtotal,
    meal_total: mealTotal,
    subtotal,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    season_name: season ? season.name : null,
  };
}

module.exports = { calculateBookingPrice };
