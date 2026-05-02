# Kudu PMS — Rates Rebuild + Price Authorization Design

**Date:** 2026-05-02  
**Properties:** Sky Island Resort & Safari · Ponta Membene Lodge  
**Scope:** Two independent subsystems built in sequence.

---

## Part 1: Rates Management Rebuild

### Goal

Tear out the existing rates module (`rates`, `room_type_rates`, `meal_packages`, `seasonal_adjustments`, `google_hotel_rates` tables + routes + UI) and replace it with a layered rate calculation system that supports rate plans, seasons, and channel markups. All pricing remains **per person per night**.

### Architecture: Six Layers

Rates are built in layers. Each layer feeds the next. Only Seasons have date ranges.

| Layer | Name | What it does |
|-------|------|-------------|
| 1 | Room Base Rates | One SADC rate per person per night, per room type. Indefinite. |
| 2 | International Multiplier | One property-level percentage. International = base × (1 + markup/100). |
| 3 | Meal Components | Per-person-per-night costs: Breakfast, Lunch, Dinner, Drinks, etc. |
| 4 | Rate Plans | Combinations of base rate + meal components. Both SADC and International versions generated automatically. |
| 5 | Seasons | Date ranges with a percentage uplift applied to all rate plans and both versions. |
| 6 | Channels | Per-channel markup on top of rate plans. SADC or International base, selectable per channel. |

### Database Schema (new tables, replacing existing)

**Tables to DROP:** `rates`, `room_type_rates`, `meal_packages`, `seasonal_adjustments`, `google_hotel_rates`

**Tables to CREATE:**

```sql
-- Layer 1
CREATE TABLE room_base_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  room_type_name TEXT NOT NULL,        -- snapshot for display
  rate_per_person REAL NOT NULL,       -- SADC rate, per person per night
  currency TEXT NOT NULL DEFAULT 'ZAR',
  max_occupancy INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id, room_type_id)
);

-- Layer 2
CREATE TABLE international_rate_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL UNIQUE,
  markup_percent REAL NOT NULL DEFAULT 30,
  currency TEXT NOT NULL DEFAULT 'USD',
  children_meal_pct REAL NOT NULL DEFAULT 50,  -- children pay X% of meal costs
  children_room_pct REAL NOT NULL DEFAULT 0,   -- children pay X% of room rate (default free)
  active INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Layer 3
CREATE TABLE meal_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,                  -- e.g. Breakfast, Lunch, Dinner, Drinks Package
  cost_per_person REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Layer 4
CREATE TABLE rate_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,                  -- e.g. "Bed & Breakfast", "All Inclusive"
  description TEXT,
  room_type_id INTEGER NOT NULL REFERENCES room_types(id),
  meal_components_json TEXT NOT NULL DEFAULT '[]',  -- array of meal_component ids
  visible_on_website INTEGER NOT NULL DEFAULT 1,
  visible_on_backoffice INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Layer 5
CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,                  -- e.g. "Peak Season 2026", "School Holidays"
  start_date TEXT NOT NULL,            -- YYYY-MM-DD
  end_date TEXT NOT NULL,
  uplift_percent REAL NOT NULL DEFAULT 0,
  applies_to_sadc INTEGER NOT NULL DEFAULT 1,
  applies_to_international INTEGER NOT NULL DEFAULT 1,
  applies_to_channels INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Layer 6
CREATE TABLE channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL,
  name TEXT NOT NULL,                  -- e.g. "Booking.com", "Airbnb", "Agent Rates"
  type TEXT NOT NULL DEFAULT 'ota' CHECK(type IN ('ota','agent','seo','direct')),
  markup_percent REAL NOT NULL DEFAULT 0,
  base_region TEXT NOT NULL DEFAULT 'sadc' CHECK(base_region IN ('sadc','international')),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE channel_rate_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL REFERENCES channels(id),
  rate_plan_id INTEGER NOT NULL REFERENCES rate_plans(id),
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, rate_plan_id)
);
```

### Rate Calculation Engine

All calculations happen at runtime — nothing is stored except base inputs. Always calculate fresh.

**Function signature:**
```js
calculateRatePlan(db, {
  property_id,
  rate_plan_id,
  adults,
  children,           // optional, default 0
  nights,             // optional, default 1 (for display)
  check_in,           // YYYY-MM-DD, for season detection
  region,             // 'sadc' | 'international'
  channel_id,         // optional, for channel rates
}) → {
  rate_plan_id,
  rate_plan_name,
  room_type_id,
  room_type_name,
  region,
  base_rate_per_person,
  meal_total_per_night,
  subtotal_per_night,
  tax_per_night,
  total_per_night,
  total_for_stay,     // × nights
  season_applied,     // null | { name, uplift_percent }
  channel_applied,    // null | { name, markup_percent }
  currency,
}
```

**Steps:**
1. Get `room_base_rate` for the rate plan's `room_type_id`
2. Get `meal_components` for the rate plan's `meal_components_json` ids
3. `meal_total_per_night = sum(component.cost_per_person × (adults + children × children_meal_pct/100))`
4. `room_total_per_night = base_rate × (adults + children × children_room_pct/100)`
5. `subtotal_per_night = room_total_per_night + meal_total_per_night`
6. `tax_per_night = subtotal_per_night × (property.tax_rate / 100)`
7. `total_per_night = subtotal_per_night + tax_per_night`
8. If `region === 'international'`: `total_per_night = total_per_night × (1 + international_markup/100)`
9. Check active seasons where `check_in BETWEEN start_date AND end_date` — if match and `applies_to_{region}`: `total_per_night = total_per_night × (1 + uplift_percent/100)` (stacks multiplicatively if multiple)
10. If `channel_id`: `total_per_night = total_per_night × (1 + channel_markup/100)` (then apply season if `applies_to_channels`)
11. `total_for_stay = total_per_night × nights`
12. Round all currency values to nearest whole number

### API Routes (`pms/routes/rates.js` — full replacement)

```
GET  /api/rates/base                    — list base rates for property
POST /api/rates/base                    — create base rate for a room type
PUT  /api/rates/base/:id                — update base rate

GET  /api/rates/international           — get international settings for property
PUT  /api/rates/international/:id       — update international settings

GET  /api/rates/meals                   — list meal components
POST /api/rates/meals                   — create meal component
PUT  /api/rates/meals/:id               — update
DELETE /api/rates/meals/:id             — soft delete (active=0)

GET  /api/rates/plans                   — list rate plans (?room_type_id= ?website_only=)
POST /api/rates/plans                   — create rate plan
PUT  /api/rates/plans/:id               — update
DELETE /api/rates/plans/:id             — soft delete

GET  /api/rates/seasons                 — list seasons
POST /api/rates/seasons                 — create
PUT  /api/rates/seasons/:id             — update
DELETE /api/rates/seasons/:id           — soft delete

GET  /api/rates/channels                — list channels
POST /api/rates/channels                — create channel
PUT  /api/rates/channels/:id            — update channel
POST /api/rates/channels/:id/plans      — assign rate plans (body: { rate_plan_ids: [] })
PUT  /api/rates/channels/:id/plans/:plan_id — toggle enabled on/off

GET  /api/rates/calculate               — calculate all rate plans for given params
  ?property_id=&room_type_id=&check_in=&check_out=&adults=&children=&channel_id=
  Returns: array of calculated rate plan objects

GET  /api/rates/public                  — no-auth endpoint for website
  ?property_id=&room_type_id=&check_in=&check_out=&adults=&children=
  Returns: only visible_on_website=true plans, SADC and International totals
```

### UI: Six-Tab Rates Dashboard (`/dashboard/rates`)

**Tab 1 — Base Rates**
- Table: Room Type | Max Occupancy | SADC Rate/person/night | International Rate/person/night (calculated) | Last Updated | Edit
- Edit modal: update `rate_per_person`, notes
- Summary card below: current international markup % with Edit button
- International markup edit modal: shows preview of how all room type rates change

**Tab 2 — Meal Components**
- Table: Name | Cost/person/night | Currency | Active | Edit | Deactivate
- Add/Edit modal: name, cost, currency, active toggle, notes
- Soft delete only

**Tab 3 — Rate Plans**
- Grouped by room type. Per plan: Name | Included Meals | SADC Total (2 adults preview) | Intl Total (2 adults preview) | Website toggle | Back Office toggle | Edit
- Create/Edit modal: name, room type, meal components checklist, description, visibility toggles
- Live preview panel in modal: shows SADC and International totals for 1, 2, and max occupancy (e.g. "Bed & Breakfast — R 7,400 / night · 2 adults · VAT incl.")

**Tab 4 — Seasons**
- 12-month calendar overview showing seasons as colored date-range bands
- List below: Name | Start | End | Uplift % | SADC | Intl | Channels | Active | Edit
- Create/Edit modal: name, dates, uplift %, applies-to toggles, active, notes
- Preview in modal: "Bed & Breakfast standard R 7,400 → Peak season R 9,250"
- Soft delete only

**Tab 5 — Channels**
- Default channels seeded on first load: Booking.com, Airbnb, Expedia, Agent Rates, SEO/Website Specials
- Per channel card: name, type, markup %, status, assigned rate plans (with per-plan enable toggle), Edit button
- Edit modal: name, type, markup %, base region (SADC/International), currency, active, notes
- Rate plan assignment: list with toggles, shows calculated channel rate per plan
- "Peak season will apply automatically" note per plan
- Add New Channel button

**Tab 6 — Rate Preview (staff calculator)**
- Inputs: room type, check-in, check-out, adults, children, channel
- Output: one card per available rate plan, updating live
- Card format:
  ```
  Bed & Breakfast
  R 9,250 per night
  R 27,750 for 3 nights
  (Peak Season +25%)
  (tax included)
  ```
- Greyed cards for back-office-only plans; invisible cards for inactive plans

### Display Rules (enforced everywhere)

**Always show:** rate plan name · single all-inclusive total · season name if active · channel name if applicable · round to whole number  
**Never show:** room rate separately · meal costs separately · tax separately · any component breakdown in customer views  
**Tax label:** ZAR → "VAT included" · MZN → "IVA included"  
**Back office only:** a collapsed "Show breakdown" toggle is allowed in detail views

### Integration: Booking System (Steps 11–12)

- `NewBooking.jsx`: replace `room_type_rates` fetch with `GET /api/rates/calculate`. Show rate plan selector instead of region selector + meal package selector.
- `BookingDetail.jsx` edit modal: same — use rate plans from calculate endpoint.
- `bookings` table: add `rate_plan_id` column (nullable for legacy bookings). Store calculated `total_amount` as snapshot at time of booking.
- `pms/utils/pricing.js`: keep for legacy recalculation but mark deprecated; new code uses `calculateRatePlan()` from `pms/utils/rateCalculation.js`.

### Migration

Before dropping old tables:
1. Export existing `room_type_rates`, `meal_packages`, `seasonal_adjustments` to `/opt/bjs-hospitality/rates-backup-[timestamp].json`
2. Seed `room_base_rates` from `room_type_rates` (SADC rates become `rate_per_person`)
3. Seed `meal_components` from `meal_packages`
4. Seed `seasons` from `seasonal_adjustments`
5. Seed `international_rate_settings` with 30% default markup
6. Seed default channels (Booking.com, Airbnb, Expedia, Agent Rates, SEO/Website Specials)
7. Log migration report

---

## Part 2: Price Authorization Workflow

### Goal

Any logged-in user can request a price override or discount on a booking. The booking keeps its original price until an admin or super-admin explicitly authorizes the change. Admins are notified in-app and by email.

### New Table

```sql
CREATE TABLE price_authorization_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('price_override','discount_fixed','discount_percent')),
  original_total REAL NOT NULL,
  requested_value REAL NOT NULL,  -- new total (override) OR discount amount/percent
  calculated_new_total REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','authorized','cancelled')),
  resolved_by_user_id INTEGER REFERENCES users(id),
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Only one pending request per booking at a time (enforced in application logic)
```

Also add to `bookings` table:
```sql
ALTER TABLE bookings ADD COLUMN pending_auth_request_id INTEGER REFERENCES price_authorization_requests(id);
```

### Flow

**Requesting a change (any user):**

1. `BookingDetail.jsx` shows two new buttons in the action row (only for non-cancelled, non-checked-out bookings):
   - **Override Price** — enter a new `total_amount` directly
   - **Apply Discount** — choose Fixed (currency amount) or Percentage, enter value
2. Both require a mandatory **Reason** field.
3. Submitting calls `POST /api/bookings/:id/price-auth`.
4. Server saves the request as `pending`, sets `booking.pending_auth_request_id`.
5. UI shows an amber "Pending Authorization" banner on the booking with: original total, requested total, reason, requester name, submitted time.
6. Both buttons become disabled (replaced by "Cancel Request" button for the requesting user).
7. Email sent to all `admin`/`super_admin` users with property access.
8. Dashboard and sidebar nav show a badge: "N pending authorizations."

**Resolving a request (admin/super-admin only):**

1. Admin sees the pending banner on the booking with **Authorize** and **Cancel** buttons.
2. **Authorize:** Updates `booking.total_amount` to `calculated_new_total`, sets `discount_amount` if applicable, marks request `authorized`, clears `pending_auth_request_id`, writes audit log entry, sends confirmation email to requester.
3. **Cancel:** Marks request `cancelled`, clears `pending_auth_request_id`, booking unchanged, sends cancellation email to requester.

**Constraints:**
- Only one pending request per booking at a time (checked server-side, rejected with 409 if violated).
- A user can cancel their own pending request (calls `DELETE /api/bookings/:id/price-auth`).
- Admins can cancel any request.

### API Routes (added to `pms/routes/bookings.js`)

```
GET  /api/bookings/pending-auth          — list all pending requests for this property (admin only)
POST /api/bookings/:id/price-auth        — submit a price change request
DELETE /api/bookings/:id/price-auth      — cancel pending request (own request or admin)
PUT  /api/bookings/:id/price-auth/authorize   — authorize (admin only)
```

### UI Changes

**`BookingDetail.jsx`:**
- Action row: add "Override Price" and "Apply Discount" buttons (disabled/hidden if pending request exists)
- Pending banner (amber): shows request details + Authorize/Cancel buttons for admin, + Cancel button for requester, read-only for others
- Buttons hidden for cancelled/checked-out bookings

**`Dashboard.jsx`:**
- Stat card: "Pending Authorizations" with count, links to `/dashboard/bookings?pending_auth=true`

**`DashboardLayout.jsx`:**
- Sidebar nav "Bookings" item shows a red badge count if pending authorizations exist

**`Bookings.jsx` list:**
- Amber row highlight for bookings with pending authorization
- Filter option: "Pending Authorization"

### Email Templates

**To admins when request submitted:**
```
Subject: Price Change Request — Booking [REF] requires authorization
Body: [Guest name] booking [REF] ([dates]) — [User] has requested a [type]:
Original total: [amount]
Requested: [amount]
Reason: [reason]
[Link to booking]
```

**To requester on resolution:**
```
Subject: Price Change Request [authorized/cancelled] — Booking [REF]
Body: Your request for [type] on booking [REF] has been [authorized/cancelled] by [admin name].
[New total if authorized] / [original total retained if cancelled]
```

---

## Build Order

### Plan A: Rates Rebuild (build first)
1. Backup existing rates data + export JSON
2. Database migrations (new tables, drop old tables, add `rate_plan_id` to bookings)
3. Rate calculation engine (`pms/utils/rateCalculation.js`)
4. All API routes (`pms/routes/rates.js` rebuilt)
5. Tab 1 — Base Rates UI
6. Tab 2 — Meal Components UI
7. Tab 3 — Rate Plans UI with live preview
8. Tab 4 — Seasons UI with calendar view
9. Tab 5 — Channels UI with plan toggles
10. Tab 6 — Rate Preview calculator
11. Update `/api/rates/public` endpoint
12. Update NewBooking.jsx + BookingDetail edit modal to use new rate plans
13. Code review
14. Simplify code
15. QA sign-off: Desktop 1280px ✓ · Mobile 375px ✓ · Mobile 412px ✓

### Plan B: Price Authorization Workflow (build second)
1. Database migration (new table + bookings column)
2. API routes (4 endpoints)
3. BookingDetail UI (request buttons + pending banner)
4. Dashboard stat card + sidebar badge
5. Bookings list filter + amber row highlight
6. Email notifications (submit + resolve)
7. Code review
8. QA sign-off
