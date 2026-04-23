'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/index');
const { requireAuth } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');

router.use(requireAuth);

// GET /api/guests?property_id=&search=
router.get('/', (req, res) => {
  const { property_id, search } = req.query;
  const db = getDb();

  const conditions = [];
  const params = [];

  if (property_id) {
    conditions.push('property_id = ?');
    params.push(property_id);
  }
  if (search) {
    const like = '%' + search + '%';
    conditions.push(`(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR id_number LIKE ?)`);
    params.push(like, like, like, like, like);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const guests = db.prepare(`
    SELECT * FROM guests ${where} ORDER BY last_name, first_name
  `).all(...params);

  return res.json(guests);
});

// POST /api/guests
router.post('/', (req, res) => {
  const {
    property_id, first_name, last_name, email, phone, nationality,
    id_type, id_number, id_expiry, date_of_birth,
    address, city, country, vip_flag, notes
  } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'first_name and last_name are required' });
  }

  const db = getDb();

  const result = db.prepare(`
    INSERT INTO guests (property_id, first_name, last_name, email, phone, nationality,
      id_type, id_number, id_expiry, date_of_birth, address, city, country, vip_flag, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    property_id || null, first_name, last_name, email || null, phone || null, nationality || null,
    id_type || null, id_number || null, id_expiry || null, date_of_birth || null,
    address || null, city || null, country || null, vip_flag || 0, notes || null
  );

  const guest = db.prepare(`SELECT * FROM guests WHERE id = ?`).get(result.lastInsertRowid);
  return res.status(201).json(guest);
});

// GET /api/guests/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const guest = db.prepare(`SELECT * FROM guests WHERE id = ?`).get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  const documents = db.prepare(`SELECT * FROM guest_documents WHERE guest_id = ? ORDER BY uploaded_at DESC`).all(guest.id);

  const bookings = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.status, b.payment_status,
           b.total_amount, b.currency, p.name as property_name, r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN properties p ON p.id = b.property_id
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.guest_id = ?
    ORDER BY b.check_in DESC
  `).all(guest.id);

  return res.json({ ...guest, documents, bookings });
});

// PUT /api/guests/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const guest = db.prepare(`SELECT * FROM guests WHERE id = ?`).get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  const allowedFields = [
    'first_name', 'last_name', 'email', 'phone', 'nationality',
    'id_type', 'id_number', 'id_expiry', 'date_of_birth',
    'address', 'city', 'country', 'vip_flag', 'notes'
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  db.prepare(`UPDATE guests SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare(`SELECT * FROM guests WHERE id = ?`).get(req.params.id);
  return res.json(updated);
});

// POST /api/guests/:id/documents
router.post('/:id/documents', (req, res) => {
  uploadDocument(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = getDb();
    const guest = db.prepare(`SELECT id FROM guests WHERE id = ?`).get(req.params.id);
    if (!guest) return res.status(404).json({ error: 'Guest not found' });

    const { doc_type = 'other' } = req.body;

    const result = db.prepare(`
      INSERT INTO guest_documents (guest_id, doc_type, file_path, file_name)
      VALUES (?, ?, ?, ?)
    `).run(guest.id, doc_type, req.file.path, req.file.filename);

    const doc = db.prepare(`SELECT * FROM guest_documents WHERE id = ?`).get(result.lastInsertRowid);
    return res.status(201).json(doc);
  });
});

// DELETE /api/guests/:id/documents/:doc_id
router.delete('/:id/documents/:doc_id', (req, res) => {
  const db = getDb();
  const doc = db.prepare(`
    SELECT * FROM guest_documents WHERE id = ? AND guest_id = ?
  `).get(req.params.doc_id, req.params.id);

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Delete the file from disk
  try {
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }
  } catch (e) {
    console.error('Failed to delete file:', e.message);
  }

  db.prepare(`DELETE FROM guest_documents WHERE id = ?`).run(doc.id);
  return res.json({ ok: true });
});

module.exports = router;
