'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateInvoicePdf } = require('../utils/pdf');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

function generateInvoiceNumber(db) {
  const property = db.prepare('SELECT invoice_prefix, invoice_counter FROM properties WHERE id = ?').get(PROPERTY_ID());
  const prefix = property.invoice_prefix || 'INV';
  const counter = (property.invoice_counter || 0) + 1;

  db.prepare('UPDATE properties SET invoice_counter = ? WHERE id = ?').run(counter, PROPERTY_ID());

  return `${prefix}-${String(counter).padStart(5, '0')}`;
}

// GET /api/invoices?booking_id=&status=&page=&limit=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { booking_id, status, issued_to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT i.*,
           b.booking_ref, b.check_in, b.check_out,
           g.first_name, g.last_name, g.email as guest_email
    FROM invoices i
    LEFT JOIN bookings b ON b.id = i.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE i.property_id = ?
  `;
  const params = [PROPERTY_ID()];

  if (booking_id) { query += ' AND i.booking_id = ?'; params.push(booking_id); }
  if (status) { query += ' AND i.status = ?'; params.push(status); }
  if (issued_to) { query += ' AND i.issued_to = ?'; params.push(issued_to); }

  const countQuery = query.replace('SELECT i.*,\n           b.booking_ref, b.check_in, b.check_out,\n           g.first_name, g.last_name, g.email as guest_email', 'SELECT COUNT(*) as total');
  const countRow = db.prepare(countQuery).get(...params);

  query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
  const invoices = db.prepare(query).all(...params, parseInt(limit), offset);

  return res.json({
    invoices,
    pagination: {
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRow.total / parseInt(limit))
    }
  });
});

// GET /api/invoices/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*,
           b.booking_ref, b.check_in, b.check_out, b.nights, b.adults, b.children,
           g.first_name, g.last_name, g.email as guest_email, g.phone as guest_phone,
           g.address as guest_address
    FROM invoices i
    LEFT JOIN bookings b ON b.id = i.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    WHERE i.id = ? AND i.property_id = ?
  `).get(req.params.id, PROPERTY_ID());

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  let lineItems = [];
  try { lineItems = JSON.parse(invoice.line_items_json || '[]'); } catch (e) {}

  return res.json({ invoice: { ...invoice, line_items: lineItems } });
});

// POST /api/invoices
router.post('/', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const {
    booking_id, issued_to = 'guest',
    recipient_name, recipient_email, recipient_address,
    line_items = [], notes, due_date
  } = req.body;

  if (!line_items.length) {
    return res.status(400).json({ error: 'At least one line item is required' });
  }

  // Verify booking belongs to this property if given
  if (booking_id) {
    const booking = db.prepare('SELECT id FROM bookings WHERE id = ? AND property_id = ?')
      .get(booking_id, PROPERTY_ID());
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
  }

  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());
  const invoiceNumber = generateInvoiceNumber(db);

  const subtotal = line_items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unit_price || 0)), 0);
  const taxRate = property.tax_rate || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  const result = db.prepare(`
    INSERT INTO invoices (
      invoice_number, booking_id, property_id, issued_to,
      recipient_name, recipient_email, recipient_address,
      line_items_json, subtotal, tax_amount, total_amount,
      currency, status, due_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    invoiceNumber, booking_id || null, PROPERTY_ID(), issued_to,
    recipient_name || null, recipient_email || null, recipient_address || null,
    JSON.stringify(line_items),
    subtotal, taxAmount, totalAmount,
    property.currency || 'USD',
    due_date || null, notes || null
  );

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ invoice });
});

// PUT /api/invoices/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','accountant'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  const {
    issued_to, recipient_name, recipient_email, recipient_address,
    line_items, notes, due_date, paid_date, status
  } = req.body;

  let subtotal = existing.subtotal;
  let taxAmount = existing.tax_amount;
  let totalAmount = existing.total_amount;

  if (line_items) {
    const property = db.prepare('SELECT tax_rate FROM properties WHERE id = ?').get(PROPERTY_ID());
    subtotal = line_items.reduce((sum, item) => sum + ((item.quantity || 1) * (item.unit_price || 0)), 0);
    const taxRate = property.tax_rate || 0;
    taxAmount = subtotal * (taxRate / 100);
    totalAmount = subtotal + taxAmount;
  }

  db.prepare(`
    UPDATE invoices SET
      issued_to = COALESCE(?, issued_to),
      recipient_name = COALESCE(?, recipient_name),
      recipient_email = COALESCE(?, recipient_email),
      recipient_address = COALESCE(?, recipient_address),
      line_items_json = COALESCE(?, line_items_json),
      subtotal = ?,
      tax_amount = ?,
      total_amount = ?,
      notes = COALESCE(?, notes),
      due_date = COALESCE(?, due_date),
      paid_date = COALESCE(?, paid_date),
      status = COALESCE(?, status)
    WHERE id = ? AND property_id = ?
  `).run(
    issued_to || null,
    recipient_name !== undefined ? recipient_name : null,
    recipient_email !== undefined ? recipient_email : null,
    recipient_address !== undefined ? recipient_address : null,
    line_items ? JSON.stringify(line_items) : null,
    subtotal, taxAmount, totalAmount,
    notes !== undefined ? notes : null,
    due_date !== undefined ? due_date : null,
    paid_date !== undefined ? paid_date : null,
    status || null,
    req.params.id, PROPERTY_ID()
  );

  const updated = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  return res.json({ invoice: updated });
});

// DELETE /api/invoices/:id
router.delete('/:id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM invoices WHERE id = ? AND property_id = ?')
    .get(req.params.id, PROPERTY_ID());
  if (!existing) return res.status(404).json({ error: 'Invoice not found' });

  if (existing.status === 'paid') {
    return res.status(409).json({ error: 'Cannot delete a paid invoice' });
  }

  db.prepare('DELETE FROM invoices WHERE id = ? AND property_id = ?').run(req.params.id, PROPERTY_ID());
  return res.json({ ok: true });
});

// GET /api/invoices/:id/pdf
router.get('/:id/pdf', requireAuth, async (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*,
           b.booking_ref, b.check_in, b.check_out, b.nights, b.adults, b.children
    FROM invoices i
    LEFT JOIN bookings b ON b.id = i.booking_id
    WHERE i.id = ? AND i.property_id = ?
  `).get(req.params.id, PROPERTY_ID());

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(PROPERTY_ID());

  let guest = null;
  if (invoice.booking_id) {
    const booking = db.prepare('SELECT guest_id FROM bookings WHERE id = ?').get(invoice.booking_id);
    if (booking && booking.guest_id) {
      guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(booking.guest_id);
    }
  }

  try {
    const pdfBuffer = await generateInvoicePdf(invoice, property, invoice, guest);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

module.exports = router;
