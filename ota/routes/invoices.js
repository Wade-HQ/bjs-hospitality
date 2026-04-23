'use strict';
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');
const { generateInvoicePdf } = require('../utils/pdf');

router.use(requireAuth);

// GET /api/invoices?property_id=&status=&booking_id=
router.get('/', (req, res) => {
  const { property_id, status, booking_id } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];
  if (property_id) { conditions.push('i.property_id = ?'); params.push(property_id); }
  if (status) { conditions.push('i.status = ?'); params.push(status); }
  if (booking_id) { conditions.push('i.booking_id = ?'); params.push(booking_id); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const invoices = db.prepare(`
    SELECT i.*, b.booking_ref, g.first_name, g.last_name, p.name as property_name
    FROM invoices i
    LEFT JOIN bookings b ON b.id = i.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN properties p ON p.id = i.property_id
    ${where}
    ORDER BY i.created_at DESC
  `).all(...params);

  return res.json(invoices);
});

// POST /api/invoices — generate from booking_id
router.post('/', (req, res) => {
  const { booking_id, issued_to = 'guest', notes, due_date } = req.body;
  if (!booking_id) return res.status(400).json({ error: 'booking_id is required' });

  const db = getDb();

  const booking = db.prepare(`
    SELECT b.*, g.first_name, g.last_name, g.email as guest_email,
           g.address as guest_address,
           rt.name as room_type_name
    FROM bookings b
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.id = ?
  `).get(booking_id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(booking.property_id);

  // Generate invoice number
  const year = new Date().getFullYear();
  const counter = (property.invoice_counter || 0) + 1;
  const invoice_number = `${property.invoice_prefix}-${year}-${String(counter).padStart(5, '0')}`;

  // Increment counter
  db.prepare(`UPDATE properties SET invoice_counter = ? WHERE id = ?`).run(counter, property.id);

  // Build line items from booking
  const lineItems = [];

  // Room charge
  lineItems.push({
    description: `${booking.room_type_name || 'Room'} — ${booking.nights} night${booking.nights !== 1 ? 's' : ''} (${booking.check_in} to ${booking.check_out})`,
    qty: booking.nights,
    unit_price: booking.room_rate,
    total: booking.room_rate * booking.nights
  });

  // Extras
  let extras = [];
  try {
    extras = JSON.parse(booking.extras_json || '[]');
  } catch (e) {}

  for (const extra of extras) {
    lineItems.push({
      description: extra.description || extra.name || 'Extra',
      qty: extra.qty || 1,
      unit_price: extra.unit_price || extra.price || 0,
      total: (extra.qty || 1) * (extra.unit_price || extra.price || 0)
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = booking.tax_amount || subtotal * ((property.tax_rate || 0) / 100);
  const total = subtotal + taxAmount;

  // Determine recipient
  let recipientName = `${booking.first_name || ''} ${booking.last_name || ''}`.trim();
  let recipientEmail = booking.guest_email || '';
  let recipientAddress = booking.guest_address || '';

  const result = db.prepare(`
    INSERT INTO invoices (
      invoice_number, booking_id, property_id, issued_to,
      recipient_name, recipient_email, recipient_address,
      line_items_json, subtotal, tax_amount, total_amount, currency,
      status, due_date, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    invoice_number, booking_id, property.id, issued_to,
    recipientName, recipientEmail, recipientAddress,
    JSON.stringify(lineItems), subtotal, taxAmount, total, property.currency,
    due_date || null, notes || null
  );

  const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(result.lastInsertRowid);
  return res.status(201).json(invoice);
});

// GET /api/invoices/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, b.booking_ref, b.check_in, b.check_out, b.nights,
           g.first_name, g.last_name, g.email as guest_email,
           p.name as property_name
    FROM invoices i
    LEFT JOIN bookings b ON b.id = i.booking_id
    LEFT JOIN guests g ON g.id = b.guest_id
    LEFT JOIN properties p ON p.id = i.property_id
    WHERE i.id = ?
  `).get(req.params.id);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  return res.json(invoice);
});

// PUT /api/invoices/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const allowedFields = ['status', 'due_date', 'paid_date', 'notes', 'recipient_name', 'recipient_email', 'recipient_address'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE invoices SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// GET /api/invoices/:id/pdf
router.get('/:id/pdf', async (req, res) => {
  const db = getDb();

  const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const property = db.prepare(`SELECT * FROM properties WHERE id = ?`).get(invoice.property_id);

  let booking = null;
  let guest = null;
  if (invoice.booking_id) {
    booking = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(invoice.booking_id);
    if (booking && booking.guest_id) {
      guest = db.prepare(`SELECT * FROM guests WHERE id = ?`).get(booking.guest_id);
    }
  }

  try {
    const pdfBuffer = await generateInvoicePdf(invoice, property, booking, guest);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="invoice-${invoice.invoice_number}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err.message);
    return res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
  }
});

module.exports = router;
