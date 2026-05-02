'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const { calculateRatePlan } = require('../utils/rateCalculation');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);
const WRITE_ROLES = ['owner', 'hotel_manager', 'accountant'];

// ─────────────────────────────────────────────────────────────────────────────
// BASE RATES
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/base — list base rates joined with room_type name + computed international_rate
router.get('/base', requireAuth, (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const baseRates = db.prepare(`
    SELECT rbr.*, rt.name AS room_type_name
    FROM room_base_rates rbr
    JOIN room_types rt ON rt.id = rbr.room_type_id
    WHERE rbr.property_id = ?
    ORDER BY rt.name
  `).all(pid);

  const intlSettings = db.prepare(
    'SELECT markup_percent FROM international_rate_settings WHERE property_id = ?'
  ).get(pid) || { markup_percent: 30 };

  const markupPct = parseFloat(intlSettings.markup_percent ?? 30);

  const result = baseRates.map(r => ({
    ...r,
    international_rate: Math.round(parseFloat(r.rate_per_person) * (1 + markupPct / 100)),
  }));

  return res.json({ base_rates: result });
});

// PUT /api/rates/base/:id — update base rate
router.put('/base/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM room_base_rates WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Base rate not found' });

  const { rate_per_person, notes, max_occupancy } = req.body;

  if (rate_per_person !== undefined) {
    const rpp = parseFloat(rate_per_person);
    if (!Number.isFinite(rpp) || rpp < 0) {
      return res.status(400).json({ error: 'rate_per_person must be a non-negative number' });
    }
  }

  db.prepare(`
    UPDATE room_base_rates SET
      rate_per_person = COALESCE(?, rate_per_person),
      notes           = COALESCE(?, notes),
      max_occupancy   = COALESCE(?, max_occupancy)
    WHERE id = ? AND property_id = ?
  `).run(
    rate_per_person !== undefined ? parseFloat(rate_per_person) : null,
    notes           !== undefined ? notes : null,
    max_occupancy   !== undefined ? parseInt(max_occupancy) : null,
    req.params.id, pid
  );

  const updated = db.prepare('SELECT * FROM room_base_rates WHERE id = ?').get(req.params.id);
  return res.json({ base_rate: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// INTERNATIONAL RATE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/international — get international settings for property
router.get('/international', requireAuth, (req, res) => {
  const db = getDb();
  const settings = db.prepare(
    'SELECT * FROM international_rate_settings WHERE property_id = ?'
  ).get(PROPERTY_ID());

  return res.json({ international_settings: settings || null });
});

// PUT /api/rates/international/:id — update international settings
router.put('/international/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM international_rate_settings WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'International rate settings not found' });

  const { markup_percent, children_meal_pct, children_room_pct } = req.body;

  if (markup_percent !== undefined && !Number.isFinite(parseFloat(markup_percent))) {
    return res.status(400).json({ error: 'markup_percent must be a number' });
  }
  if (children_meal_pct !== undefined && !Number.isFinite(parseFloat(children_meal_pct))) {
    return res.status(400).json({ error: 'children_meal_pct must be a number' });
  }
  if (children_room_pct !== undefined && !Number.isFinite(parseFloat(children_room_pct))) {
    return res.status(400).json({ error: 'children_room_pct must be a number' });
  }

  db.prepare(`
    UPDATE international_rate_settings SET
      markup_percent    = COALESCE(?, markup_percent),
      children_meal_pct = COALESCE(?, children_meal_pct),
      children_room_pct = COALESCE(?, children_room_pct)
    WHERE id = ? AND property_id = ?
  `).run(
    markup_percent    !== undefined ? parseFloat(markup_percent)    : null,
    children_meal_pct !== undefined ? parseFloat(children_meal_pct) : null,
    children_room_pct !== undefined ? parseFloat(children_room_pct) : null,
    req.params.id, pid
  );

  const updated = db.prepare(
    'SELECT * FROM international_rate_settings WHERE id = ?'
  ).get(req.params.id);
  return res.json({ international_settings: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// MEAL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/meals — list all meal components (active and inactive)
router.get('/meals', requireAuth, (req, res) => {
  const db = getDb();
  const meals = db.prepare(
    'SELECT * FROM meal_components WHERE property_id = ? ORDER BY name'
  ).all(PROPERTY_ID());
  return res.json({ meal_components: meals });
});

// POST /api/rates/meals — create meal component
router.post('/meals', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const { name, cost_per_person, notes, active = 1 } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const cost = parseFloat(cost_per_person);
  if (!Number.isFinite(cost) || cost < 0) {
    return res.status(400).json({ error: 'cost_per_person must be a non-negative number' });
  }

  const result = db.prepare(`
    INSERT INTO meal_components (property_id, name, cost_per_person, notes, active)
    VALUES (?, ?, ?, ?, ?)
  `).run(pid, name.trim(), cost, notes || null, active ? 1 : 0);

  const meal = db.prepare('SELECT * FROM meal_components WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ meal_component: meal });
});

// PUT /api/rates/meals/:id — update meal component
router.put('/meals/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM meal_components WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Meal component not found' });

  const { name, cost_per_person, notes, active } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }

  if (cost_per_person !== undefined) {
    const cost = parseFloat(cost_per_person);
    if (!Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: 'cost_per_person must be a non-negative number' });
    }
  }

  db.prepare(`
    UPDATE meal_components SET
      name           = COALESCE(?, name),
      cost_per_person = COALESCE(?, cost_per_person),
      notes          = COALESCE(?, notes),
      active         = COALESCE(?, active)
    WHERE id = ? AND property_id = ?
  `).run(
    name            ? name.trim() : null,
    cost_per_person !== undefined ? parseFloat(cost_per_person) : null,
    notes           !== undefined ? notes : null,
    active          !== undefined ? (active ? 1 : 0) : null,
    req.params.id, pid
  );

  const updated = db.prepare('SELECT * FROM meal_components WHERE id = ?').get(req.params.id);
  return res.json({ meal_component: updated });
});

// DELETE /api/rates/meals/:id — soft delete (set active=0)
router.delete('/meals/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM meal_components WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Meal component not found' });

  db.prepare('UPDATE meal_components SET active = 0 WHERE id = ? AND property_id = ?')
    .run(req.params.id, pid);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// RATE PLANS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/plans — list rate plans (?room_type_id= ?active_only=)
router.get('/plans', requireAuth, (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const { room_type_id, active_only } = req.query;

  let query = 'SELECT * FROM rate_plans WHERE property_id = ?';
  const params = [pid];

  if (room_type_id) { query += ' AND room_type_id = ?'; params.push(room_type_id); }
  if (active_only === 'true' || active_only === '1') { query += ' AND active = 1'; }

  query += ' ORDER BY name';

  const plans = db.prepare(query).all(...params);
  return res.json({ rate_plans: plans });
});

// POST /api/rates/plans — create rate plan
router.post('/plans', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const {
    room_type_id, name, meal_components_json = '[]',
    visible_on_website = 0, visible_on_backoffice = 1, active = 1, description
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!room_type_id) {
    return res.status(400).json({ error: 'room_type_id is required' });
  }

  // Validate room_type belongs to property
  const rt = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
    .get(room_type_id, pid);
  if (!rt) return res.status(400).json({ error: 'Invalid room_type_id' });

  // Validate meal_components_json
  try {
    const parsed = JSON.parse(meal_components_json);
    if (!Array.isArray(parsed) || !parsed.every(v => Number.isInteger(v))) {
      throw new Error();
    }
  } catch (_) {
    return res.status(400).json({ error: 'meal_components_json must be a valid JSON array of integers' });
  }

  const result = db.prepare(`
    INSERT INTO rate_plans (property_id, room_type_id, name, meal_components_json, visible_on_website, visible_on_backoffice, active, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pid, room_type_id, name.trim(), meal_components_json,
    visible_on_website ? 1 : 0, visible_on_backoffice ? 1 : 0, active ? 1 : 0, description || null
  );

  const plan = db.prepare('SELECT * FROM rate_plans WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ rate_plan: plan });
});

// PUT /api/rates/plans/:id — update rate plan
router.put('/plans/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM rate_plans WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Rate plan not found' });

  const { name, room_type_id, meal_components_json, visible_on_website, visible_on_backoffice, active, description } = req.body;

  if (meal_components_json !== undefined) {
    try {
      const parsed = JSON.parse(meal_components_json);
      if (!Array.isArray(parsed) || !parsed.every(v => Number.isInteger(v))) {
        throw new Error();
      }
    } catch (_) {
      return res.status(400).json({ error: 'meal_components_json must be a valid JSON array of integers' });
    }
  }

  if (room_type_id !== undefined) {
    const rt = db.prepare('SELECT id FROM room_types WHERE id = ? AND property_id = ?')
      .get(room_type_id, pid);
    if (!rt) return res.status(400).json({ error: 'Invalid room_type_id' });
  }

  db.prepare(`
    UPDATE rate_plans SET
      name                   = COALESCE(?, name),
      room_type_id           = COALESCE(?, room_type_id),
      meal_components_json   = COALESCE(?, meal_components_json),
      visible_on_website     = COALESCE(?, visible_on_website),
      visible_on_backoffice  = COALESCE(?, visible_on_backoffice),
      active                 = COALESCE(?, active),
      description            = COALESCE(?, description)
    WHERE id = ? AND property_id = ?
  `).run(
    name                   !== undefined ? name.trim()                       : null,
    room_type_id           !== undefined ? room_type_id                      : null,
    meal_components_json   !== undefined ? meal_components_json              : null,
    visible_on_website     !== undefined ? (visible_on_website ? 1 : 0)     : null,
    visible_on_backoffice  !== undefined ? (visible_on_backoffice ? 1 : 0)  : null,
    active                 !== undefined ? (active ? 1 : 0)                 : null,
    description            !== undefined ? description                       : null,
    req.params.id, pid
  );

  const updated = db.prepare('SELECT * FROM rate_plans WHERE id = ?').get(req.params.id);
  return res.json({ rate_plan: updated });
});

// DELETE /api/rates/plans/:id — soft delete (set active=0)
router.delete('/plans/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM rate_plans WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Rate plan not found' });

  db.prepare('UPDATE rate_plans SET active = 0 WHERE id = ? AND property_id = ?')
    .run(req.params.id, pid);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEASONS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/seasons — list seasons
router.get('/seasons', requireAuth, (req, res) => {
  const db = getDb();
  const seasons = db.prepare(
    'SELECT * FROM seasons WHERE property_id = ? ORDER BY start_date'
  ).all(PROPERTY_ID());
  return res.json({ seasons });
});

// POST /api/rates/seasons — create season
router.post('/seasons', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const {
    name, start_date, end_date, uplift_percent = 0,
    applies_to_sadc = 1, applies_to_international = 1, applies_to_channels = 1,
    active = 1, notes
  } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
  if (end_date < start_date) return res.status(400).json({ error: 'end_date must be >= start_date' });

  const result = db.prepare(`
    INSERT INTO seasons (property_id, name, start_date, end_date, uplift_percent,
      applies_to_sadc, applies_to_international, applies_to_channels, active, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pid, name.trim(), start_date, end_date, parseFloat(uplift_percent),
    applies_to_sadc ? 1 : 0, applies_to_international ? 1 : 0, applies_to_channels ? 1 : 0,
    active ? 1 : 0, notes || null
  );

  const season = db.prepare('SELECT * FROM seasons WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ season });
});

// PUT /api/rates/seasons/:id — update season
router.put('/seasons/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT * FROM seasons WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Season not found' });

  const {
    name, start_date, end_date, uplift_percent,
    applies_to_sadc, applies_to_international, applies_to_channels, active, notes
  } = req.body;

  // Validate date ordering using resolved values
  const resolvedStart = start_date !== undefined ? start_date : existing.start_date;
  const resolvedEnd   = end_date   !== undefined ? end_date   : existing.end_date;
  if (resolvedEnd < resolvedStart) {
    return res.status(400).json({ error: 'end_date must be >= start_date' });
  }

  db.prepare(`
    UPDATE seasons SET
      name                   = COALESCE(?, name),
      start_date             = COALESCE(?, start_date),
      end_date               = COALESCE(?, end_date),
      uplift_percent         = COALESCE(?, uplift_percent),
      applies_to_sadc        = COALESCE(?, applies_to_sadc),
      applies_to_international = COALESCE(?, applies_to_international),
      applies_to_channels    = COALESCE(?, applies_to_channels),
      active                 = COALESCE(?, active),
      notes                  = COALESCE(?, notes)
    WHERE id = ? AND property_id = ?
  `).run(
    name                   !== undefined ? name.trim()                           : null,
    start_date             !== undefined ? start_date                            : null,
    end_date               !== undefined ? end_date                              : null,
    uplift_percent         !== undefined ? parseFloat(uplift_percent)            : null,
    applies_to_sadc        !== undefined ? (applies_to_sadc ? 1 : 0)            : null,
    applies_to_international !== undefined ? (applies_to_international ? 1 : 0) : null,
    applies_to_channels    !== undefined ? (applies_to_channels ? 1 : 0)        : null,
    active                 !== undefined ? (active ? 1 : 0)                     : null,
    notes                  !== undefined ? notes                                 : null,
    req.params.id, pid
  );

  const updated = db.prepare('SELECT * FROM seasons WHERE id = ?').get(req.params.id);
  return res.json({ season: updated });
});

// DELETE /api/rates/seasons/:id — soft delete (set active=0)
router.delete('/seasons/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM seasons WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Season not found' });

  db.prepare('UPDATE seasons SET active = 0 WHERE id = ? AND property_id = ?')
    .run(req.params.id, pid);
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHANNELS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/channels — list channels with their assigned rate plans
router.get('/channels', requireAuth, (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const channels = db.prepare(
    'SELECT * FROM channels WHERE property_id = ? ORDER BY name'
  ).all(pid);

  const plans = db.prepare(`
    SELECT crp.*, rp.name AS plan_name
    FROM channel_rate_plans crp
    JOIN rate_plans rp ON rp.id = crp.rate_plan_id
    WHERE rp.property_id = ?
  `).all(pid);

  // Attach plans array to each channel
  const result = channels.map(ch => ({
    ...ch,
    rate_plans: plans.filter(p => p.channel_id === ch.id),
  }));

  return res.json({ channels: result });
});

// POST /api/rates/channels — create channel
router.post('/channels', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const { name, type = 'ota', markup_percent = 0, base_region = 'sadc', currency = 'ZAR', active = 1, notes } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

  const VALID_TYPES = ['ota', 'agent', 'seo', 'direct'];
  const normalizedType = VALID_TYPES.includes(type) ? type : 'ota';
  const normalizedRegion = (base_region || 'sadc').toLowerCase();

  const result = db.prepare(`
    INSERT INTO channels (property_id, name, type, markup_percent, base_region, currency, active, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(pid, name.trim(), normalizedType, parseFloat(markup_percent), normalizedRegion, currency || 'ZAR', active ? 1 : 0, notes || null);

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ channel });
});

// PUT /api/rates/channels/:id — update channel
router.put('/channels/:id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();

  const existing = db.prepare(
    'SELECT id FROM channels WHERE id = ? AND property_id = ?'
  ).get(req.params.id, pid);
  if (!existing) return res.status(404).json({ error: 'Channel not found' });

  const { name, type, markup_percent, base_region, currency, active, notes } = req.body;

  if (name !== undefined && !name.trim()) {
    return res.status(400).json({ error: 'name cannot be empty' });
  }

  if (markup_percent !== undefined && !Number.isFinite(parseFloat(markup_percent))) {
    return res.status(400).json({ error: 'markup_percent must be a number' });
  }

  const VALID_TYPES = ['ota', 'agent', 'seo', 'direct'];
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const normalizedRegion = base_region !== undefined ? (base_region || 'sadc').toLowerCase() : undefined;

  db.prepare(`
    UPDATE channels SET
      name           = COALESCE(?, name),
      type           = COALESCE(?, type),
      markup_percent = COALESCE(?, markup_percent),
      base_region    = COALESCE(?, base_region),
      currency       = COALESCE(?, currency),
      active         = COALESCE(?, active),
      notes          = COALESCE(?, notes)
    WHERE id = ? AND property_id = ?
  `).run(
    name           ? name.trim()                              : null,
    type           !== undefined ? type                       : null,
    markup_percent !== undefined ? parseFloat(markup_percent) : null,
    normalizedRegion !== undefined ? normalizedRegion         : null,
    currency       !== undefined ? currency                   : null,
    active         !== undefined ? (active ? 1 : 0)          : null,
    notes          !== undefined ? notes                      : null,
    req.params.id, pid
  );

  const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  return res.json({ channel: updated });
});

// POST /api/rates/channels/:id/plans — assign/replace all rate plans for channel
router.post('/channels/:id/plans', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const channelId = parseInt(req.params.id);

  const channel = db.prepare(
    'SELECT id FROM channels WHERE id = ? AND property_id = ?'
  ).get(channelId, pid);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const { rate_plan_ids } = req.body;
  if (!Array.isArray(rate_plan_ids)) {
    return res.status(400).json({ error: 'rate_plan_ids must be an array' });
  }

  db.transaction(() => {
    db.prepare('DELETE FROM channel_rate_plans WHERE channel_id = ?').run(channelId);
    for (const planId of rate_plan_ids) {
      db.prepare(
        'INSERT OR IGNORE INTO channel_rate_plans (channel_id, rate_plan_id) VALUES (?, ?)'
      ).run(channelId, planId);
    }
  })();

  const assigned = db.prepare(
    'SELECT * FROM channel_rate_plans WHERE channel_id = ?'
  ).all(channelId);
  return res.json({ ok: true, channel_rate_plans: assigned });
});

// PUT /api/rates/channels/:id/plans/:plan_id — toggle enabled flag
router.put('/channels/:id/plans/:plan_id', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const channelId = parseInt(req.params.id);
  const planId    = parseInt(req.params.plan_id);

  const channel = db.prepare(
    'SELECT id FROM channels WHERE id = ? AND property_id = ?'
  ).get(channelId, pid);
  if (!channel) return res.status(404).json({ error: 'Channel not found' });

  const assignment = db.prepare(
    'SELECT * FROM channel_rate_plans WHERE channel_id = ? AND rate_plan_id = ?'
  ).get(channelId, planId);
  if (!assignment) return res.status(404).json({ error: 'Rate plan assignment not found' });

  const { enabled } = req.body;
  if (enabled === undefined) {
    return res.status(400).json({ error: 'enabled is required' });
  }

  db.prepare(
    'UPDATE channel_rate_plans SET enabled = ? WHERE channel_id = ? AND rate_plan_id = ?'
  ).run(enabled ? 1 : 0, channelId, planId);

  const updated = db.prepare(
    'SELECT * FROM channel_rate_plans WHERE channel_id = ? AND rate_plan_id = ?'
  ).get(channelId, planId);
  return res.json({ channel_rate_plan: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// CALCULATE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/calculate — calculate all active rate plans for given params
router.get('/calculate', requireAuth, (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const { room_type_id, check_in, adults, children = 0, nights = 1, channel_id } = req.query;

  if (!room_type_id) return res.status(400).json({ error: 'room_type_id is required' });
  if (!check_in)     return res.status(400).json({ error: 'check_in is required' });
  if (!adults)       return res.status(400).json({ error: 'adults is required' });

  if (check_in && !/^\d{4}-\d{2}-\d{2}$/.test(check_in)) {
    return res.status(400).json({ error: 'check_in must be YYYY-MM-DD' });
  }

  const activePlans = db.prepare(
    'SELECT * FROM rate_plans WHERE property_id = ? AND room_type_id = ? AND active = 1 ORDER BY name'
  ).all(pid, room_type_id);

  const results = [];
  const calcErrors = [];
  for (const plan of activePlans) {
    try {
      const calculated = calculateRatePlan(db, {
        property_id:  pid,
        rate_plan_id: plan.id,
        adults:       parseInt(adults),
        children:     parseInt(children),
        nights:       parseInt(nights),
        check_in,
        channel_id:   channel_id != null ? parseInt(channel_id) : null,
        region:       req.query.region || undefined,
      });
      results.push({ ...plan, ...calculated });
    } catch (err) {
      console.error(`calculateRatePlan error for plan ${plan.id} (${plan.name}):`, err.message);
      calcErrors.push({ plan_id: plan.id, plan_name: plan.name, error: err.message });
    }
  }

  return res.json({
    rate_plans: results,
    calc_errors: calcErrors.length > 0 ? calcErrors : undefined,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC (no-auth — for website)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/rates/public — no-auth endpoint for website, returns website-visible plans only
router.get('/public', (req, res) => {
  const db = getDb();
  const pid = PROPERTY_ID();
  const { room_type_id, check_in, adults, children = 0, nights = 1 } = req.query;

  if (!room_type_id) return res.status(400).json({ error: 'room_type_id is required' });
  if (!check_in)     return res.status(400).json({ error: 'check_in is required' });
  if (!adults)       return res.status(400).json({ error: 'adults is required' });

  const visiblePlans = db.prepare(
    'SELECT * FROM rate_plans WHERE property_id = ? AND room_type_id = ? AND active = 1 AND visible_on_website = 1 ORDER BY name'
  ).all(pid, room_type_id);

  const calcParams = {
    property_id: pid,
    adults:      parseInt(adults),
    children:    parseInt(children),
    nights:      parseInt(nights),
    check_in,
    channel_id:  null,
  };

  const results = [];
  for (const plan of visiblePlans) {
    try {
      // Calculate SADC (no channel = sadc region by default in engine)
      const sadc = calculateRatePlan(db, { ...calcParams, rate_plan_id: plan.id });

      // Calculate international using engine with region override so markup is
      // applied BEFORE season uplift (matching the engine's layer ordering)
      const intl = calculateRatePlan(db, { ...calcParams, rate_plan_id: plan.id, region: 'international' });

      results.push({
        ...plan,
        ...sadc,
        sadc_total:          sadc.total_for_stay,
        international_total: intl.total_for_stay,
      });
    } catch (err) {
      console.error(`calculateRatePlan (public) error for plan ${plan.id} (${plan.name}):`, err.message);
      // Skip plans that throw
    }
  }

  return res.json({ rate_plans: results });
});

// POST /api/rates/base/bulk-increase
router.post('/base/bulk-increase', requireAuth, requireRole(...WRITE_ROLES), (req, res) => {
  const db = getDb();
  const { pct } = req.body;
  const parsed = parseFloat(pct);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
    return res.status(400).json({ error: 'pct must be a positive number (max 500)' });
  }
  const multiplier = 1 + parsed / 100;
  const result = db.prepare(
    `UPDATE room_base_rates SET rate_per_person = ROUND(rate_per_person * ?) WHERE property_id = ?`
  ).run(multiplier, PROPERTY_ID());
  return res.json({ ok: true, rows_updated: result.changes });
});

module.exports = router;
