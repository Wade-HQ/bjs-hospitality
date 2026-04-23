'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth);

// GET /api/properties — all authenticated users
router.get('/', (req, res) => {
  const db = getDb();
  const properties = db.prepare(`
    SELECT id, name, slug, type, address, country, currency, timezone,
           commission_rate_percent, domain, contact_email, contact_phone,
           vat_number, invoice_prefix, invoice_counter,
           tax_label, tax_rate, payment_instructions,
           smtp_host, smtp_port, smtp_user, smtp_from, created_at
    FROM properties ORDER BY name
  `).all();
  return res.json(properties);
});

// POST /api/properties — owner only
router.post('/', requireRole('owner'), (req, res) => {
  const {
    name, slug, type, address, country, currency, timezone,
    commission_rate_percent, domain, contact_email, contact_phone,
    vat_number, invoice_prefix, tax_label, tax_rate, payment_instructions,
    smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from
  } = req.body;

  if (!name || !slug) return res.status(400).json({ error: 'name and slug are required' });

  const db = getDb();

  const existing = db.prepare(`SELECT id FROM properties WHERE slug = ?`).get(slug);
  if (existing) return res.status(409).json({ error: 'Slug already in use' });

  const result = db.prepare(`
    INSERT INTO properties (
      name, slug, type, address, country, currency, timezone,
      commission_rate_percent, domain, contact_email, contact_phone,
      vat_number, invoice_prefix, tax_label, tax_rate, payment_instructions,
      smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, slug, type || 'hotel', address || null, country || null,
    currency || 'USD', timezone || 'UTC',
    commission_rate_percent || 15,
    domain || null, contact_email || null, contact_phone || null,
    vat_number || null, invoice_prefix || 'INV',
    tax_label || 'VAT', tax_rate || 0,
    payment_instructions || null,
    smtp_host || null, smtp_port || null, smtp_user || null,
    smtp_pass || null, smtp_from || null
  );

  const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(result.lastInsertRowid);
  return res.status(201).json(property);
});

// PUT /api/properties/:id — owner only
router.put('/:id', requireRole('owner'), (req, res) => {
  const db = getDb();
  const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Property not found' });

  const allowedFields = [
    'name', 'slug', 'type', 'address', 'country', 'currency', 'timezone',
    'commission_rate_percent', 'domain', 'contact_email', 'contact_phone',
    'vat_number', 'invoice_prefix', 'tax_label', 'tax_rate', 'payment_instructions',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  // Check slug uniqueness if being changed
  if (updates.slug && updates.slug !== property.slug) {
    const existing = db.prepare(`SELECT id FROM properties WHERE slug = ? AND id != ?`).get(updates.slug, req.params.id);
    if (existing) return res.status(409).json({ error: 'Slug already in use' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE properties SET ${setClauses} WHERE id = ?`).run(...values);

  // Return without smtp_pass for security
  const updated = db.prepare(`
    SELECT id, name, slug, type, address, country, currency, timezone,
           commission_rate_percent, domain, contact_email, contact_phone,
           vat_number, invoice_prefix, invoice_counter,
           tax_label, tax_rate, payment_instructions,
           smtp_host, smtp_port, smtp_user, smtp_from, created_at
    FROM properties WHERE id = ?
  `).get(req.params.id);

  return res.json(updated);
});

module.exports = router;
