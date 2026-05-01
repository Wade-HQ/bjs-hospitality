# Rates System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `base_rate` on room types with a full rates system supporting International + SADC base rates (PPS model), meal packages, seasonal adjustments, and per-rate visibility toggles.

**Architecture:** Three new DB tables (`room_type_rates`, `meal_packages`, `seasonal_adjustments`) plus three new columns on `bookings`. A shared `utils/pricing.js` helper handles all price calculation. New API routes serve rates data. Settings UI gets a new "Rates" tab. Booking form gains region + meal package selectors with a live price preview.

**Tech Stack:** SQLite via better-sqlite3, Express.js, React 18, Tailwind CSS, axios (via `api/index.js`)

---

## File Map

**Create:**
- `pms/utils/pricing.js` — `calculateBookingPrice(db, params)` helper
- `pms/routes/meal-packages.js` — CRUD for meal packages
- `pms/routes/seasonal-adjustments.js` — CRUD for seasonal adjustments

**Modify:**
- `pms/db/schema.js` — migrations for 3 new tables + 3 new booking columns
- `pms/routes/room-types.js` — add rate sub-routes (GET/PUT per region)
- `pms/routes/bookings.js` — use pricing helper, accept `region`/`meal_package_id`, add price-preview endpoint
- `pms/server.js` — mount 2 new route files
- `pms/client/src/pages/dashboard/Settings.jsx` — new "Rates" tab
- `pms/client/src/pages/dashboard/NewBooking.jsx` — region + meal + price preview
- `pms/client/src/pages/dashboard/BookingDetail.jsx` — show region + meal in Stay panel

---

## Task 1: DB Schema Migrations

**Files:**
- Modify: `pms/db/schema.js`

- [ ] **Step 1: Add the three new tables and booking columns to the migrations block**

In `pms/db/schema.js`, add the following to the `db.exec(...)` CREATE TABLE block (after the existing `booking_audit_log` table, before the closing `);`):

```sql
    CREATE TABLE IF NOT EXISTS room_type_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
      region TEXT NOT NULL CHECK(region IN ('international', 'sadc')),
      rate_per_person REAL NOT NULL DEFAULT 0,
      single_supplement_multiplier REAL NOT NULL DEFAULT 1.5,
      children_pct INTEGER NOT NULL DEFAULT 50,
      is_online INTEGER NOT NULL DEFAULT 1,
      is_sto INTEGER NOT NULL DEFAULT 1,
      is_agent INTEGER NOT NULL DEFAULT 1,
      is_ota INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(room_type_id, region)
    );

    CREATE TABLE IF NOT EXISTS meal_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_per_person REAL NOT NULL DEFAULT 0,
      is_online INTEGER NOT NULL DEFAULT 1,
      is_sto INTEGER NOT NULL DEFAULT 1,
      is_agent INTEGER NOT NULL DEFAULT 1,
      is_ota INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS seasonal_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      pct_change REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
```

- [ ] **Step 2: Add column migrations for bookings table**

After the existing `roomMigrations` loop in `pms/db/schema.js`, add:

```js
  const bookingRateMigrations = [
    `ALTER TABLE bookings ADD COLUMN region TEXT CHECK(region IN ('international', 'sadc'))`,
    `ALTER TABLE bookings ADD COLUMN meal_package_id INTEGER REFERENCES meal_packages(id)`,
    `ALTER TABLE bookings ADD COLUMN meal_total REAL NOT NULL DEFAULT 0`,
  ];
  for (const sql of bookingRateMigrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }
```

- [ ] **Step 3: Seed `room_type_rates` from existing `room_types.base_rate` for all existing room types**

After the `bookingRateMigrations` loop, add:

```js
  // Seed room_type_rates from existing room_types for any room type that doesn't have rates yet
  const roomTypesWithoutRates = db.prepare(`
    SELECT id, base_rate FROM room_types
    WHERE id NOT IN (SELECT DISTINCT room_type_id FROM room_type_rates)
  `).all();
  if (roomTypesWithoutRates.length > 0) {
    const insertRate = db.prepare(`
      INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person)
      VALUES (?, ?, ?)
    `);
    for (const rt of roomTypesWithoutRates) {
      insertRate.run(rt.id, 'international', rt.base_rate || 0);
      insertRate.run(rt.id, 'sadc', rt.base_rate || 0);
    }
    console.log(`[seed] Seeded room_type_rates for ${roomTypesWithoutRates.length} room types`);
  }
```

- [ ] **Step 4: Also insert `room_type_rates` rows when a new room type is created in the seed blocks**

In the `if (needsSkyS)` block, after `insertRoomType.run(...)`, add:
```js
      const rtId = db.prepare('SELECT id FROM room_types WHERE property_id=1 AND name=? ORDER BY id DESC LIMIT 1').get(rt.name)?.id;
      if (rtId) {
        db.prepare('INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person) VALUES (?, ?, ?)').run(rtId, 'international', rt.base_rate || 0);
        db.prepare('INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person) VALUES (?, ?, ?)').run(rtId, 'sadc', rt.base_rate || 0);
      }
```

Repeat for the `if (needsMemS)` block.

- [ ] **Step 5: Restart the server and confirm no errors**

```bash
cd /home/claude/bjs-hospitality/pms && node server.js
```
Expected: `Database migrations complete` with no SQL errors. Ctrl+C to stop.

- [ ] **Step 6: Verify tables exist**

```bash
cd /home/claude/bjs-hospitality/pms && node -e "
const {initDb,getDb}=require('./db/index');
initDb();
const db=getDb();
console.log(db.prepare('SELECT COUNT(*) as c FROM room_type_rates').get());
console.log(db.prepare('SELECT * FROM room_type_rates LIMIT 5').all());
"
```
Expected: `{ c: 8 }` or more (2 per existing room type), plus rows showing international + sadc for each room type.

- [ ] **Step 7: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add db/schema.js
git commit -m "feat(rates): add room_type_rates, meal_packages, seasonal_adjustments tables"
```

---

## Task 2: Pricing Utility

**Files:**
- Create: `pms/utils/pricing.js`

- [ ] **Step 1: Create `pms/utils/pricing.js`**

```js
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
```

- [ ] **Step 2: Verify the utility loads without errors**

```bash
cd /home/claude/bjs-hospitality/pms && node -e "
const {initDb,getDb}=require('./db/index');
initDb();
const db=getDb();
const {calculateBookingPrice}=require('./utils/pricing');
const result = calculateBookingPrice(db, {
  property_id: 1,
  room_type_id: 1,
  region: 'international',
  check_in: '2026-06-01',
  check_out: '2026-06-04',
  nights: 3,
  adults: 2,
  children: 0,
  meal_package_id: null,
});
console.log(result);
"
```
Expected: An object with `adjusted_rate`, `accommodation_subtotal`, `meal_total`, `subtotal`, `tax_amount`, `total_amount`, `season_name`. Values should be non-zero (room type 1 has a `base_rate`).

- [ ] **Step 3: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add utils/pricing.js
git commit -m "feat(rates): add calculateBookingPrice utility"
```

---

## Task 3: Room Type Rates API

**Files:**
- Modify: `pms/routes/room-types.js`

- [ ] **Step 1: Add GET and PUT rate endpoints to `pms/routes/room-types.js`**

Add these two routes after the existing `PUT /:id` route (before `DELETE /:id`):

```js
// GET /api/room-types/:id/rates — fetch both rates for a room type
router.get('/:id/rates', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Room type not found' });

  const rates = db.prepare(`
    SELECT * FROM room_type_rates WHERE room_type_id = ? ORDER BY region
  `).all(req.params.id);

  // Ensure both regions exist — create missing ones with 0
  const regions = ['international', 'sadc'];
  const result = {};
  for (const region of regions) {
    const r = rates.find(x => x.region === region);
    if (r) {
      result[region] = r;
    } else {
      const ins = db.prepare(`
        INSERT INTO room_type_rates (room_type_id, region, rate_per_person)
        VALUES (?, ?, 0)
      `).run(req.params.id, region);
      result[region] = db.prepare('SELECT * FROM room_type_rates WHERE id = ?').get(ins.lastInsertRowid);
    }
  }

  return res.json({ rates: result });
});

// PUT /api/room-types/:id/rates/:region — update a rate
router.put('/:id/rates/:region', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const { region } = req.params;
  if (!['international', 'sadc'].includes(region)) {
    return res.status(400).json({ error: 'region must be international or sadc' });
  }

  const existing = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Room type not found' });

  const {
    rate_per_person, single_supplement_multiplier, children_pct,
    is_online, is_sto, is_agent, is_ota
  } = req.body;

  // Upsert
  db.prepare(`
    INSERT INTO room_type_rates (room_type_id, region, rate_per_person, single_supplement_multiplier, children_pct, is_online, is_sto, is_agent, is_ota)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_type_id, region) DO UPDATE SET
      rate_per_person = COALESCE(excluded.rate_per_person, rate_per_person),
      single_supplement_multiplier = COALESCE(excluded.single_supplement_multiplier, single_supplement_multiplier),
      children_pct = COALESCE(excluded.children_pct, children_pct),
      is_online = COALESCE(excluded.is_online, is_online),
      is_sto = COALESCE(excluded.is_sto, is_sto),
      is_agent = COALESCE(excluded.is_agent, is_agent),
      is_ota = COALESCE(excluded.is_ota, is_ota),
      updated_at = CURRENT_TIMESTAMP
  `).run(
    req.params.id, region,
    rate_per_person !== undefined ? parseFloat(rate_per_person) : 0,
    single_supplement_multiplier !== undefined ? parseFloat(single_supplement_multiplier) : 1.5,
    children_pct !== undefined ? parseInt(children_pct) : 50,
    is_online !== undefined ? (is_online ? 1 : 0) : 1,
    is_sto !== undefined ? (is_sto ? 1 : 0) : 1,
    is_agent !== undefined ? (is_agent ? 1 : 0) : 1,
    is_ota !== undefined ? (is_ota ? 1 : 0) : 1
  );

  const updated = db.prepare('SELECT * FROM room_type_rates WHERE room_type_id = ? AND region = ?')
    .get(req.params.id, region);
  return res.json({ rate: updated });
});
```

Also update `POST /api/room-types` to auto-create both rate rows when a new room type is created. Add this after the `INSERT INTO room_types` run, before the final response:

```js
  // Auto-create rate rows for both regions
  const insertRate = db.prepare(`
    INSERT OR IGNORE INTO room_type_rates (room_type_id, region, rate_per_person)
    VALUES (?, ?, ?)
  `);
  insertRate.run(result.lastInsertRowid, 'international', parseFloat(base_rate) || 0);
  insertRate.run(result.lastInsertRowid, 'sadc', parseFloat(base_rate) || 0);
```

- [ ] **Step 2: Restart server and verify rates endpoints**

```bash
# In one terminal: cd /home/claude/bjs-hospitality/pms && node server.js
# In another terminal (get auth token first, or test with curl using a session):
curl -s http://localhost:3101/api/room-types/1/rates \
  -H "Cookie: pms_token=YOUR_TOKEN" | python3 -m json.tool
```
Expected: JSON with `{ rates: { international: {...}, sadc: {...} } }` both showing `rate_per_person` values.

- [ ] **Step 3: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add routes/room-types.js
git commit -m "feat(rates): add GET/PUT rate sub-routes to room-types"
```

---

## Task 4: Meal Packages API

**Files:**
- Create: `pms/routes/meal-packages.js`
- Modify: `pms/server.js`

- [ ] **Step 1: Create `pms/routes/meal-packages.js`**

```js
'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/meal-packages
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const packages = db.prepare(`
    SELECT * FROM meal_packages WHERE property_id = ? ORDER BY sort_order, name
  `).all(PROPERTY_ID());
  return res.json({ meal_packages: packages });
});

// POST /api/meal-packages
router.post('/', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const { name, price_per_person = 0, is_online = 1, is_sto = 1, is_agent = 1, is_ota = 1, sort_order = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO meal_packages (property_id, name, price_per_person, is_online, is_sto, is_agent, is_ota, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(PROPERTY_ID(), name.trim(), parseFloat(price_per_person), is_online ? 1 : 0, is_sto ? 1 : 0, is_agent ? 1 : 0, is_ota ? 1 : 0, parseInt(sort_order));

  const pkg = db.prepare('SELECT * FROM meal_packages WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ meal_package: pkg });
});

// PUT /api/meal-packages/:id
router.put('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM meal_packages WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, price_per_person, is_online, is_sto, is_agent, is_ota, sort_order } = req.body;

  db.prepare(`
    UPDATE meal_packages SET
      name = COALESCE(?, name),
      price_per_person = COALESCE(?, price_per_person),
      is_online = COALESCE(?, is_online),
      is_sto = COALESCE(?, is_sto),
      is_agent = COALESCE(?, is_agent),
      is_ota = COALESCE(?, is_ota),
      sort_order = COALESCE(?, sort_order),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(
    name ? name.trim() : null,
    price_per_person !== undefined ? parseFloat(price_per_person) : null,
    is_online !== undefined ? (is_online ? 1 : 0) : null,
    is_sto !== undefined ? (is_sto ? 1 : 0) : null,
    is_agent !== undefined ? (is_agent ? 1 : 0) : null,
    is_ota !== undefined ? (is_ota ? 1 : 0) : null,
    sort_order !== undefined ? parseInt(sort_order) : null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM meal_packages WHERE id = ?').get(req.params.id);
  return res.json({ meal_package: updated });
});

// DELETE /api/meal-packages/:id
router.delete('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM meal_packages WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM meal_packages WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Mount the route in `pms/server.js`**

After `app.use('/api/settings', require('./routes/settings'));`, add:

```js
app.use('/api/meal-packages',         require('./routes/meal-packages'));
app.use('/api/seasonal-adjustments',  require('./routes/seasonal-adjustments'));
```

(Task 5 will create the seasonal-adjustments file — add the mount now so it's ready.)

- [ ] **Step 3: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add routes/meal-packages.js server.js
git commit -m "feat(rates): add meal-packages CRUD API"
```

---

## Task 5: Seasonal Adjustments API

**Files:**
- Create: `pms/routes/seasonal-adjustments.js`

- [ ] **Step 1: Create `pms/routes/seasonal-adjustments.js`**

```js
'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/seasonal-adjustments
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const seasons = db.prepare(`
    SELECT * FROM seasonal_adjustments WHERE property_id = ? ORDER BY start_date
  `).all(PROPERTY_ID());
  return res.json({ seasonal_adjustments: seasons });
});

// POST /api/seasonal-adjustments
router.post('/', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const { name, pct_change, start_date, end_date } = req.body;
  if (!name || pct_change === undefined || !start_date || !end_date) {
    return res.status(400).json({ error: 'name, pct_change, start_date, end_date are required' });
  }
  if (new Date(end_date) <= new Date(start_date)) {
    return res.status(400).json({ error: 'end_date must be after start_date' });
  }

  const result = db.prepare(`
    INSERT INTO seasonal_adjustments (property_id, name, pct_change, start_date, end_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(PROPERTY_ID(), name.trim(), parseFloat(pct_change), start_date, end_date);

  const season = db.prepare('SELECT * FROM seasonal_adjustments WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ seasonal_adjustment: season });
});

// PUT /api/seasonal-adjustments/:id
router.put('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM seasonal_adjustments WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, pct_change, start_date, end_date } = req.body;

  db.prepare(`
    UPDATE seasonal_adjustments SET
      name = COALESCE(?, name),
      pct_change = COALESCE(?, pct_change),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND property_id = ?
  `).run(
    name ? name.trim() : null,
    pct_change !== undefined ? parseFloat(pct_change) : null,
    start_date || null,
    end_date || null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM seasonal_adjustments WHERE id = ?').get(req.params.id);
  return res.json({ seasonal_adjustment: updated });
});

// DELETE /api/seasonal-adjustments/:id
router.delete('/:id', requireAuth, requireRole('owner', 'hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM seasonal_adjustments WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM seasonal_adjustments WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Restart server and confirm both new routes mount without errors**

```bash
cd /home/claude/bjs-hospitality/pms && node server.js
```
Expected: Server starts on port 3101 with no `MODULE_NOT_FOUND` errors.

- [ ] **Step 3: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add routes/seasonal-adjustments.js
git commit -m "feat(rates): add seasonal-adjustments CRUD API"
```

---

## Task 6: Update Bookings — Pricing + Price Preview

**Files:**
- Modify: `pms/routes/bookings.js`

- [ ] **Step 1: Import the pricing utility at the top of `pms/routes/bookings.js`**

After the existing requires, add:

```js
const { calculateBookingPrice } = require('../utils/pricing');
```

- [ ] **Step 2: Add price-preview endpoint**

Add this route after the existing `GET /api/bookings` route and before `GET /api/bookings/:id`:

```js
// GET /api/bookings/price-preview
router.get('/price-preview', requireAuth, (req, res) => {
  const db = getDb();
  const { room_type_id, region, check_in, check_out, adults, children, meal_package_id } = req.query;

  if (!room_type_id || !check_in || !check_out || !adults) {
    return res.json({ adjusted_rate: 0, accommodation_subtotal: 0, meal_total: 0, subtotal: 0, tax_amount: 0, total_amount: 0, season_name: null });
  }

  const ciDate = new Date(check_in);
  const coDate = new Date(check_out);
  if (isNaN(ciDate) || isNaN(coDate) || coDate <= ciDate) {
    return res.json({ adjusted_rate: 0, accommodation_subtotal: 0, meal_total: 0, subtotal: 0, tax_amount: 0, total_amount: 0, season_name: null });
  }

  const nights = Math.round((coDate - ciDate) / (1000 * 60 * 60 * 24));

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
    return res.json({ adjusted_rate: 0, accommodation_subtotal: 0, meal_total: 0, subtotal: 0, tax_amount: 0, total_amount: 0, season_name: null });
  }
});
```

- [ ] **Step 3: Update `POST /api/bookings` to accept `region` and `meal_package_id`, and use the pricing utility**

In the `POST /` handler, add `region` and `meal_package_id` to the destructured `req.body`:

```js
    region = 'international',
    meal_package_id,
```

Replace the existing financial calculation block (from `const roomRate = getRoomRate(...)` through `const netToProperty = ...`) with:

```js
  // Calculate financials using the new pricing utility
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

  const roomRate = pricing.adjusted_rate;
  const mealTotal = pricing.meal_total;
  const subtotal = pricing.subtotal;
  const taxAmount = pricing.tax_amount;
  const totalAmount = pricing.total_amount;

  const effectiveCommissionRate = commission_rate !== undefined
    ? parseFloat(commission_rate)
    : (source !== 'direct' ? (property.commission_rate_percent || 15) : 0);

  const commissionAmount = totalAmount * (effectiveCommissionRate / 100);
  const netToProperty = totalAmount - commissionAmount;
```

Update the INSERT statement to include the new columns. Replace the INSERT and its `.run()` call with:

```js
  const bookingResult = db.prepare(`
    INSERT INTO bookings (
      booking_ref, source, property_id, room_id, room_type_id, guest_id,
      check_in, check_out, nights, adults, children,
      room_rate, meal_package_id, meal_total, extras_json,
      subtotal, tax_amount, tax_rate, discount_amount, total_amount,
      currency, commission_rate, commission_amount, net_to_property,
      status, payment_status, special_requests, internal_notes,
      channel_booking_ref, region
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    region || 'international'
  );
```

- [ ] **Step 4: Restart server and test the price preview endpoint**

```bash
# Start server in background
cd /home/claude/bjs-hospitality/pms && node server.js &

# Test price preview (no auth needed for this test — use a valid cookie if available)
# This should return zeroes since we can't auth without token
curl "http://localhost:3101/api/bookings/price-preview?room_type_id=1&region=international&check_in=2026-06-01&check_out=2026-06-04&adults=2"
```
Expected: Returns a JSON object (may return zeroes if auth fails — that's expected for this curl test).

- [ ] **Step 5: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add routes/bookings.js utils/pricing.js
git commit -m "feat(rates): wire pricing utility into bookings, add price-preview endpoint"
```

---

## Task 7: Settings UI — Rates Tab

**Files:**
- Modify: `pms/client/src/pages/dashboard/Settings.jsx`

This is the largest UI task. Read the full current Settings.jsx before editing.

- [ ] **Step 1: Add state and data loading for rates section**

In the `Settings` component, add new state variables after the existing state declarations:

```jsx
  const [mealPackages, setMealPackages] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [roomTypeRates, setRoomTypeRates] = useState({}); // { [roomTypeId]: { international: {...}, sadc: {...} } }
  const [mealModal, setMealModal] = useState(false);
  const [mealForm, setMealForm] = useState({ name: '', price_per_person: '', is_online: true, is_sto: true, is_agent: true, is_ota: true });
  const [seasonModal, setSeasonModal] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ name: '', pct_change: '', start_date: '', end_date: '' });
```

Update the `load` function to also fetch rates data:

```jsx
  const load = () => {
    api.get('/api/rooms').then(r => setRooms(r.data?.rooms || []));
    api.get('/api/room-types').then(r => {
      const rts = r.data?.room_types || [];
      setRoomTypes(rts);
      // Load rates for each room type
      Promise.all(rts.map(rt => api.get(`/api/room-types/${rt.id}/rates`)))
        .then(results => {
          const ratesMap = {};
          results.forEach((res, i) => { ratesMap[rts[i].id] = res.data?.rates || {}; });
          setRoomTypeRates(ratesMap);
        });
    });
    api.get('/api/meal-packages').then(r => setMealPackages(r.data?.meal_packages || []));
    api.get('/api/seasonal-adjustments').then(r => setSeasons(r.data?.seasonal_adjustments || []));
  };
```

- [ ] **Step 2: Add the "Rates" tab to the tab strip**

Find the tab strip array and add a rates entry:

```jsx
{[['rooms', '🛏 Rooms & Types'], ['rates', '💲 Rates'], ['property', '🏨 Property'], ['finance', '💰 Finance'], ['email', '📧 Email']].map(...)}
```

- [ ] **Step 3: Add rate-saving handler functions**

Add these helper functions after `deleteRoomType`:

```jsx
  const saveRoomTypeRate = async (roomTypeId, region, data) => {
    try {
      await api.put(`/api/room-types/${roomTypeId}/rates/${region}`, data);
      addToast('Rate saved');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error saving rate', 'error'); }
  };

  const saveMealPackage = async () => {
    try {
      if (mealForm.id) await api.put(`/api/meal-packages/${mealForm.id}`, mealForm);
      else await api.post('/api/meal-packages', mealForm);
      addToast('Meal package saved');
      setMealModal(false);
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const deleteMealPackage = async (id) => {
    if (!window.confirm('Delete this meal package?')) return;
    try {
      await api.delete(`/api/meal-packages/${id}`);
      addToast('Deleted');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const saveSeason = async () => {
    try {
      if (seasonForm.id) await api.put(`/api/seasonal-adjustments/${seasonForm.id}`, seasonForm);
      else await api.post('/api/seasonal-adjustments', seasonForm);
      addToast('Season saved');
      setSeasonModal(false);
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };

  const deleteSeason = async (id) => {
    if (!window.confirm('Delete this seasonal adjustment?')) return;
    try {
      await api.delete(`/api/seasonal-adjustments/${id}`);
      addToast('Deleted');
      load();
    } catch (e) { addToast(e.response?.data?.error || 'Error', 'error'); }
  };
```

- [ ] **Step 4: Add the Rates section JSX**

Add this block after the `{activeSection === 'rooms' && (...)}` block and before the `{['property', 'finance', 'email']...}` block:

```jsx
      {/* ── RATES ── */}
      {activeSection === 'rates' && (
        <div className="space-y-6">

          {/* Room Type Base Rates */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Base Rates by Room Type</h2>
              <p className="text-xs text-gray-400 mt-0.5">Per person per night. International and SADC rates apply separately.</p>
            </div>
            {roomTypes.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No room types yet.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {roomTypes.map(rt => {
                  const rates = roomTypeRates[rt.id] || {};
                  const intl = rates.international || {};
                  const sadc = rates.sadc || {};
                  return (
                    <RoomTypeRateRow
                      key={rt.id}
                      rt={rt}
                      intl={intl}
                      sadc={sadc}
                      currency={property?.currency || 'ZAR'}
                      onSave={(region, data) => saveRoomTypeRate(rt.id, region, data)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Meal Packages */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Meal Packages</h2>
                <p className="text-xs text-gray-400 mt-0.5">Fixed per person per night — not affected by seasonal adjustments.</p>
              </div>
              <button onClick={() => { setMealForm({ name: '', price_per_person: '', is_online: true, is_sto: true, is_agent: true, is_ota: true }); setMealModal(true); }}
                className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90">+ Add Package</button>
            </div>
            {mealPackages.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No meal packages yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    {['Name', 'Price/person/night', 'Online', 'STO', 'Agent', 'OTA', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {mealPackages.map(mp => (
                    <tr key={mp.id}>
                      <td className="px-4 py-3 font-medium">{mp.name}</td>
                      <td className="px-4 py-3">{property?.currency} {Number(mp.price_per_person).toLocaleString()}</td>
                      {['is_online','is_sto','is_agent','is_ota'].map(k => (
                        <td key={k} className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${mp[k] ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                            {mp[k] ? 'On' : 'Off'}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => { setMealForm({ ...mp, is_online: !!mp.is_online, is_sto: !!mp.is_sto, is_agent: !!mp.is_agent, is_ota: !!mp.is_ota }); setMealModal(true); }}
                            className="text-xs text-teal hover:underline">Edit</button>
                          <button onClick={() => deleteMealPackage(mp.id)}
                            className="text-xs text-red-400 hover:underline">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Seasonal Adjustments */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-800">Seasonal Adjustments</h2>
                <p className="text-xs text-gray-400 mt-0.5">% adjustment applied to accommodation rates only. Positive = peak uplift, negative = low-season discount.</p>
              </div>
              <button onClick={() => { setSeasonForm({ name: '', pct_change: '', start_date: '', end_date: '' }); setSeasonModal(true); }}
                className="text-sm bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90">+ Add Season</button>
            </div>
            {seasons.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No seasonal adjustments yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>{['Name', '% Change', 'From', 'To', ''].map(h => <th key={h} className="px-4 py-3 text-left">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {seasons.map((s, i) => {
                    const overlaps = seasons.some((other, j) => j !== i &&
                      new Date(s.start_date) <= new Date(other.end_date) &&
                      new Date(s.end_date) >= new Date(other.start_date));
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-medium">
                          {overlaps && <span title="Overlapping dates — first match wins" className="text-amber-500 mr-1">⚠</span>}
                          {s.name}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${s.pct_change >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                            {s.pct_change >= 0 ? '+' : ''}{s.pct_change}%
                          </span>
                        </td>
                        <td className="px-4 py-3">{s.start_date}</td>
                        <td className="px-4 py-3">{s.end_date}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => { setSeasonForm(s); setSeasonModal(true); }}
                              className="text-xs text-teal hover:underline">Edit</button>
                            <button onClick={() => deleteSeason(s.id)}
                              className="text-xs text-red-400 hover:underline">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add the `RoomTypeRateRow` sub-component**

Add this component definition just above the `export default function Settings()` line:

```jsx
function RoomTypeRateRow({ rt, intl, sadc, currency, onSave }) {
  const [editing, setEditing] = useState(null); // 'international' | 'sadc' | null
  const [draft, setDraft] = useState({});

  const startEdit = (region, rate) => {
    setEditing(region);
    setDraft({
      rate_per_person: rate.rate_per_person ?? 0,
      single_supplement_multiplier: rate.single_supplement_multiplier ?? 1.5,
      children_pct: rate.children_pct ?? 50,
      is_online: rate.is_online !== 0,
      is_sto: rate.is_sto !== 0,
      is_agent: rate.is_agent !== 0,
      is_ota: rate.is_ota !== 0,
    });
  };

  const save = () => {
    onSave(editing, {
      ...draft,
      is_online: draft.is_online ? 1 : 0,
      is_sto: draft.is_sto ? 1 : 0,
      is_agent: draft.is_agent ? 1 : 0,
      is_ota: draft.is_ota ? 1 : 0,
    });
    setEditing(null);
  };

  const visibilityLabel = (rate) => {
    const flags = [rate.is_online && 'Online', rate.is_sto && 'STO', rate.is_agent && 'Agent', rate.is_ota && 'OTA'].filter(Boolean);
    return flags.length ? flags.join(' · ') : 'Hidden';
  };

  return (
    <div className="px-6 py-5">
      <div className="font-semibold text-gray-800 mb-3">{rt.name}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[['international', 'International', intl], ['sadc', 'SADC', sadc]].map(([region, label, rate]) => (
          <div key={region} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
              {editing === region ? (
                <div className="flex gap-2">
                  <button onClick={save} className="text-xs bg-gold text-white px-2 py-1 rounded">Save</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => startEdit(region, rate)} className="text-xs text-teal hover:underline">Edit</button>
              )}
            </div>
            {editing === region ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Rate/person/night ({currency})</label>
                  <input type="number" step="0.01" value={draft.rate_per_person}
                    onChange={e => setDraft(p => ({ ...p, rate_per_person: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Single supplement ×</label>
                    <input type="number" step="0.1" value={draft.single_supplement_multiplier}
                      onChange={e => setDraft(p => ({ ...p, single_supplement_multiplier: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Children % of adult</label>
                    <input type="number" step="1" min="0" max="100" value={draft.children_pct}
                      onChange={e => setDraft(p => ({ ...p, children_pct: e.target.value }))}
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  {[['is_online','Online'],['is_sto','STO'],['is_agent','Agent'],['is_ota','OTA']].map(([k,l]) => (
                    <label key={k} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={!!draft[k]} onChange={e => setDraft(p => ({ ...p, [k]: e.target.checked }))} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold text-primary">{currency} {Number(rate.rate_per_person || 0).toLocaleString()}<span className="text-xs text-gray-400 font-normal">/person/night</span></div>
                <div className="text-xs text-gray-400 mt-1">Single: ×{rate.single_supplement_multiplier ?? 1.5} · Children: {rate.children_pct ?? 50}%</div>
                <div className="text-xs text-gray-400 mt-0.5">{visibilityLabel(rate)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add Meal Package and Season modals**

Add these two modals just before the closing `</div>` of the Settings return:

```jsx
      {/* Meal Package Modal */}
      <Modal open={mealModal} onClose={() => setMealModal(false)} title={mealForm.id ? 'Edit Meal Package' : 'Add Meal Package'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={mealForm.name} onChange={e => setMealForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. B&B, Half Board, Full Board"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price per person per night ({property?.currency})</label>
            <input type="number" step="0.01" value={mealForm.price_per_person}
              onChange={e => setMealForm(p => ({ ...p, price_per_person: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-4">
            {[['is_online','Online'],['is_sto','STO'],['is_agent','Agent'],['is_ota','OTA']].map(([k,l]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={!!mealForm[k]} onChange={e => setMealForm(p => ({ ...p, [k]: e.target.checked }))} />
                {l}
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setMealModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveMealPackage} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>

      {/* Season Modal */}
      <Modal open={seasonModal} onClose={() => setSeasonModal(false)} title={seasonForm.id ? 'Edit Season' : 'Add Seasonal Adjustment'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={seasonForm.name} onChange={e => setSeasonForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Peak Season Dec–Jan"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">% Adjustment (positive = peak uplift, negative = discount)</label>
            <input type="number" step="0.1" value={seasonForm.pct_change}
              onChange={e => setSeasonForm(p => ({ ...p, pct_change: e.target.value }))}
              placeholder="e.g. 20 or -15"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input type="date" value={seasonForm.start_date} onChange={e => setSeasonForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input type="date" value={seasonForm.end_date} onChange={e => setSeasonForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setSeasonModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={saveSeason} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-medium">Save</button>
        </div>
      </Modal>
```

- [ ] **Step 7: Build the frontend and check for errors**

```bash
cd /home/claude/bjs-hospitality/pms/client && npm run build 2>&1 | tail -20
```
Expected: Build completes with no errors. Warnings are OK.

- [ ] **Step 8: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add client/src/pages/dashboard/Settings.jsx
git commit -m "feat(rates): add Rates tab to Settings with room type rates, meal packages, seasonal adjustments"
```

---

## Task 8: NewBooking Form — Region + Meal Package + Price Preview

**Files:**
- Modify: `pms/client/src/pages/dashboard/NewBooking.jsx`

- [ ] **Step 1: Add region and meal package state to the form**

Update the initial `form` state to include the new fields:

```jsx
  const [form, setForm] = useState({
    check_in: '', check_out: '', room_type_id: '', room_id: '',
    adults: 1, children: 0, special_requests: '',
    source: 'direct', status: 'confirmed', region: 'international', meal_package_id: '',
    guest: { first_name:'', last_name:'', email:'', phone:'', nationality:'', id_type:'passport', id_number:'' }
  });
```

Add state for meal packages and price preview:

```jsx
  const [mealPackages, setMealPackages] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
```

- [ ] **Step 2: Load meal packages on mount**

Add to the first `useEffect`:

```jsx
  useEffect(() => {
    api.get('/api/room-types').then(r => setRoomTypes(r.data?.room_types || []));
    api.get('/api/meal-packages').then(r => setMealPackages(r.data?.meal_packages || []));
  }, []);
```

- [ ] **Step 3: Add price preview fetch effect**

Add a new `useEffect` that fires when pricing-relevant fields change:

```jsx
  useEffect(() => {
    const { room_type_id, region, check_in, check_out, adults, children, meal_package_id } = form;
    if (!room_type_id || !check_in || !check_out || !adults) { setPreview(null); return; }
    const ci = new Date(check_in), co = new Date(check_out);
    if (co <= ci) { setPreview(null); return; }

    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams({ room_type_id, region, check_in, check_out, adults, children: children || 0 });
        if (meal_package_id) params.set('meal_package_id', meal_package_id);
        const r = await api.get(`/api/bookings/price-preview?${params}`);
        setPreview(r.data);
      } catch { setPreview(null); }
      finally { setPreviewLoading(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [form.room_type_id, form.region, form.check_in, form.check_out, form.adults, form.children, form.meal_package_id]);
```

- [ ] **Step 4: Add region and meal package fields to the Stay Details section**

In the Stay Details grid, add after the room type / room selectors and before the adults / children fields:

```jsx
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Region / Rate</label>
              <select value={form.region} onChange={e => setField('region', e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="international">International</option>
                <option value="sadc">SADC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meal Package</label>
              <select value={form.meal_package_id} onChange={e => setField('meal_package_id', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Room Only (no meals)</option>
                {mealPackages.map(mp => (
                  <option key={mp.id} value={mp.id}>{mp.name}</option>
                ))}
              </select>
            </div>
```

- [ ] **Step 5: Add the price preview panel**

Add this block between the Stay Details card and the Guest Information card (after the closing `</div>` of the first card):

```jsx
        {/* Price Preview */}
        {(preview || previewLoading) && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
            {previewLoading ? (
              <div className="text-sm text-gray-400 text-center">Calculating…</div>
            ) : preview && (
              <>
                <h2 className="font-semibold text-gray-700 mb-3 text-sm">Price Breakdown</h2>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Accommodation</span>
                    <span className="font-medium">{preview.accommodation_subtotal?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {preview.meal_total > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Meals</span>
                      <span className="font-medium">{preview.meal_total?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="text-gray-500">Subtotal</span>
                    <span>{preview.subtotal?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tax</span>
                    <span>{preview.tax_amount?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-1">
                    <span className="font-semibold text-primary">Total</span>
                    <span className="font-bold text-primary text-base">{preview.total_amount?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {preview.season_name && (
                    <div className="text-xs text-amber-600 mt-1">* {preview.season_name} adjustment applied</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
```

- [ ] **Step 6: Build and verify no errors**

```bash
cd /home/claude/bjs-hospitality/pms/client && npm run build 2>&1 | tail -20
```
Expected: Build completes with no errors.

- [ ] **Step 7: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add client/src/pages/dashboard/NewBooking.jsx
git commit -m "feat(rates): add region, meal package, and price preview to new booking form"
```

---

## Task 9: BookingDetail — Show Region and Meal Package

**Files:**
- Modify: `pms/client/src/pages/dashboard/BookingDetail.jsx`

- [ ] **Step 1: Add region and meal package to the Stay panel**

In the Stay panel's `dl` list, find the array passed to `.map()`:

```jsx
{[['Room', b.room_number ? `Room ${b.room_number}` : '—'], ['Type', b.room_type_name],['Check-in', b.check_in],['Check-out', b.check_out],['Nights', b.nights],['Guests', `${b.adults}A ${b.children}C`]].map(...)}
```

Replace it with:

```jsx
{[
  ['Room', b.room_number ? `Room ${b.room_number}` : '—'],
  ['Type', b.room_type_name],
  ['Region', b.region ? (b.region === 'sadc' ? 'SADC' : 'International') : '—'],
  ['Check-in', b.check_in],
  ['Check-out', b.check_out],
  ['Nights', b.nights],
  ['Guests', `${b.adults}A ${b.children}C`],
].map(([k,v]) => (
  <div key={k} className="flex justify-between"><dt className="text-gray-400">{k}</dt><dd className="font-medium">{v}</dd></div>
))}
```

- [ ] **Step 2: Add meal total to the Financials panel if non-zero**

In the Financials panel's array, add a `Meals` row conditionally. Replace the array with:

```jsx
{[
  ['Rate/night', `${b.currency} ${Number(b.room_rate).toLocaleString()}`],
  ['Subtotal (acc.)', `${b.currency} ${Number(b.subtotal - (b.meal_total || 0)).toLocaleString()}`],
  ...(b.meal_total > 0 ? [['Meals', `${b.currency} ${Number(b.meal_total).toLocaleString()}`]] : []),
  ['Tax', `${b.currency} ${Number(b.tax_amount).toLocaleString()}`],
  ['Total', `${b.currency} ${Number(b.total_amount).toLocaleString()}`],
].map(([k,v]) => (
  <div key={k} className="flex justify-between"><dt className="text-gray-400">{k}</dt><dd className="font-medium">{v}</dd></div>
))}
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/claude/bjs-hospitality/pms/client && npm run build 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /home/claude/bjs-hospitality/pms
git add client/src/pages/dashboard/BookingDetail.jsx
git commit -m "feat(rates): show region and meal breakdown in booking detail"
```

---

## Self-Review Checklist

After all tasks are complete, verify:

- [ ] Can set International and SADC rates for each room type in Settings → Rates
- [ ] Can add a meal package (e.g. "B&B" at ZAR 350/person/night) in Settings → Rates
- [ ] Can add a seasonal adjustment (e.g. "Peak +20%") with date range in Settings → Rates
- [ ] New booking form shows Region selector and Meal Package dropdown
- [ ] Price preview panel appears and updates as dates/occupancy changes
- [ ] Booking creation succeeds and stores `region`, `meal_total`, correct `total_amount`
- [ ] BookingDetail shows Region and, if applicable, Meals line in Financials
- [ ] Seasonal adjustments note appears in price preview when active dates selected
- [ ] Meal package prices are NOT affected when base rates change
