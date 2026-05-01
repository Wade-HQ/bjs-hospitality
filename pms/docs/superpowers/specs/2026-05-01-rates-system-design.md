# Rates System Redesign — Design Spec

## Goal

Replace the single flat `base_rate` on room types with a full rates system supporting two regional base rates (International + SADC), meal packages, seasonal adjustments, and per-rate visibility controls.

## Architecture

Four concerns, cleanly separated:
- **Accommodation rates** — per room type, per region, PPS model
- **Meal packages** — property-level, manually set, immune to all automation
- **Seasonal adjustments** — percentage modifiers with date ranges, apply to accommodation only
- **Booking form** — collects region + meal package; stores locked-in prices at booking time

## Tech Stack

- SQLite (existing PMS schema)
- Express.js routes (existing `/api/` pattern)
- React frontend (existing dashboard components)

---

## Section 1: Database Schema

### New table: `room_type_rates`

Replaces `room_types.base_rate`. One row per room type per region.

```sql
CREATE TABLE room_type_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  region TEXT NOT NULL CHECK(region IN ('international', 'sadc')),
  rate_per_person DECIMAL(10,2) NOT NULL DEFAULT 0,
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
```

### New table: `meal_packages`

Property-level meal rates. Never touched by seasonal adjustments or base rate changes.

```sql
CREATE TABLE meal_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_per_person DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_online INTEGER NOT NULL DEFAULT 1,
  is_sto INTEGER NOT NULL DEFAULT 1,
  is_agent INTEGER NOT NULL DEFAULT 1,
  is_ota INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### New table: `seasonal_adjustments`

Percentage uplift or discount over a date range. Applied at booking time to accommodation rates only.

```sql
CREATE TABLE seasonal_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pct_change REAL NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Additions to `bookings` table

```sql
ALTER TABLE bookings ADD COLUMN region TEXT CHECK(region IN ('international', 'sadc'));
ALTER TABLE bookings ADD COLUMN meal_package_id INTEGER REFERENCES meal_packages(id);
ALTER TABLE bookings ADD COLUMN meal_total DECIMAL(10,2) NOT NULL DEFAULT 0;
```

`region` — which rate was used (locked at booking time).
`meal_package_id` — reference to which package was selected (nullable = room only).
`meal_total` — meal cost locked in at booking time; not recalculated even if meal prices change later.

### Migration: seed `room_type_rates` from existing `room_types.base_rate`

On schema migration, for every existing room type insert two rows into `room_type_rates` — one `international` and one `sadc` — both seeded with the current `base_rate` value. The `base_rate` column on `room_types` is left in place (backwards compat) but no longer used for pricing.

---

## Section 2: Pricing Calculation Logic

Implemented as a shared helper `calculateBookingPrice(params)` in `pms/utils/pricing.js`, used by both the booking creation route and the price-preview API endpoint.

```
Input:
  room_type_id, region, check_in, check_out, adults, children, meal_package_id

Step 1 — Base rate
  SELECT rate_per_person, single_supplement_multiplier, children_pct
  FROM room_type_rates
  WHERE room_type_id = ? AND region = ?

Step 2 — Seasonal adjustment
  SELECT pct_change FROM seasonal_adjustments
  WHERE property_id = ? AND start_date <= check_in AND end_date >= check_in
  ORDER BY id LIMIT 1
  (first match wins; UI warns on overlapping seasons)

  adjusted_rate = rate_per_person * (1 + pct_change / 100)
  If no season active: adjusted_rate = rate_per_person

Step 3 — Nightly occupancy cost
  If adults == 1:
    nightly_accommodation = adjusted_rate * single_supplement_multiplier
  Else:
    nightly_accommodation = adjusted_rate * adults
  nightly_accommodation += adjusted_rate * (children_pct / 100) * children

Step 4 — Multiply by nights
  nights = days between check_in and check_out
  accommodation_subtotal = nightly_accommodation * nights

Step 5 — Meals
  If meal_package_id:
    SELECT price_per_person FROM meal_packages WHERE id = ?
    meal_total = price_per_person * (adults + children) * nights
  Else:
    meal_total = 0

Step 6 — Tax and total
  subtotal = accommodation_subtotal + meal_total
  tax_amount = subtotal * (property.tax_rate / 100)
  total_amount = subtotal + tax_amount

Output:
  adjusted_rate (stored as room_rate on booking)
  accommodation_subtotal
  meal_total
  subtotal
  tax_amount
  total_amount
  season_name (null if no season active — used for UI preview note)
```

The `room_rate` column on `bookings` stores `adjusted_rate` — the per-person nightly rate after seasonal adjustment, locked at booking time.

---

## Section 3: API Endpoints

### Rates endpoints (new)

```
GET    /api/room-types/:id/rates         — fetch both rates for a room type
PUT    /api/room-types/:id/rates/:region — update international or sadc rate
```

### Meal packages (new)

```
GET    /api/meal-packages                — list for property
POST   /api/meal-packages                — create
PUT    /api/meal-packages/:id            — update
DELETE /api/meal-packages/:id            — delete
PATCH  /api/meal-packages/:id/order      — update sort_order
```

### Seasonal adjustments (new)

```
GET    /api/seasonal-adjustments         — list for property
POST   /api/seasonal-adjustments         — create
PUT    /api/seasonal-adjustments/:id     — update
DELETE /api/seasonal-adjustments/:id     — delete
```

### Price preview (new)

```
GET /api/bookings/price-preview
  ?room_type_id=&region=&check_in=&check_out=&adults=&children=&meal_package_id=
  → { adjusted_rate, accommodation_subtotal, meal_total, subtotal, tax_amount, total_amount, season_name }
```

Used by the booking form to show a live price breakdown before submitting.

### Bookings (modified)

`POST /api/bookings` — now accepts `region` (required) and `meal_package_id` (optional). Runs `calculateBookingPrice()` server-side to populate `room_rate`, `meal_total`, `subtotal`, `tax_amount`, `total_amount`. Client-side preview is for UX only; server always recalculates.

---

## Section 4: Frontend — Booking Form Changes

### New fields in `NewBooking.jsx`

In Stay Details, add after room type selector:

- **Region** (required select): International / SADC
- **Meal Package** (optional select): "Room Only" + list from `/api/meal-packages`

### Price preview panel

Below the Stay Details card, a read-only breakdown updates live as the user changes dates, room type, region, adults, children, or meal package. Debounced API call to `/api/bookings/price-preview` (300ms).

```
Accommodation:  ZAR 2,000/person/night × 2 adults × 3 nights   ZAR 12,000
Meals (B&B):    ZAR  450/person/night  × 2 adults × 3 nights   ZAR  2,700
                                                    ─────────────────────
Subtotal:                                                       ZAR 14,700
Tax (15%):                                                      ZAR  2,205
Total:                                                          ZAR 16,905
```

If a seasonal adjustment is active: small note below subtotal — *"Peak Season Dec–Jan: +20% applied"*.

If form is incomplete (no room type / dates / region selected): panel shows placeholder dashes.

### BookingDetail changes

- Stay panel: add Region row and Meal Package row
- Financials panel: break out Accommodation and Meals as separate line items

---

## Section 5: Frontend — Settings UI Changes

### Room Types (existing settings section — modified)

Each room type expands to show a rates sub-section:

| | International | SADC |
|---|---|---|
| Rate/person/night | ZAR [____] | ZAR [____] |
| Online | ☑ | ☑ |
| STO | ☑ | ☑ |
| Agent | ☑ | ☑ |
| OTA | ☑ | ☑ |

Below both rate columns, shared per room type:
- Single supplement: [1.5]× (solo guest pays this multiple of the per-person rate)
- Children under 13: [50]% of adult rate

### New section: Meal Packages

Inline-editable table. Add / edit / delete. Columns: Name, Price/person/night, Online, STO, Agent, OTA. Rows reorderable by sort_order.

### New section: Seasonal Adjustments

Inline-editable table. Columns: Name, % Change (green if positive, amber if negative), From, To, Delete. Overlapping date ranges flagged with a warning icon next to the affected rows (still permitted — first match wins at booking time).

---

## Data Integrity Rules

- Every room type must have exactly two `room_type_rates` rows (international + sadc). Created automatically when a new room type is created. Cannot be deleted independently — only cascade-deleted when the room type is deleted.
- `meal_package_id` on bookings is nullable — room-only bookings are valid.
- `region` on bookings is required for all new bookings. Existing bookings (pre-migration) have `region = NULL` — treated as 'international' in display.
- Overlapping seasonal adjustments: allowed, first by `id` wins. UI warns but does not block.
- Meal prices are locked at booking creation time via `meal_total` — changing a meal package price later does not affect existing bookings.
