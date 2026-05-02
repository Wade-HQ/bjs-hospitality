'use strict';
const express = require('express');
const { getDb } = require('../db/index');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadDocument } = require('../middleware/upload');

const router = express.Router();

const PROPERTY_ID = () => parseInt(process.env.PROPERTY_ID, 10);

// GET /api/guests?search=
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { search } = req.query;

  let query = `
    SELECT DISTINCT g.id, g.first_name, g.last_name, g.email, g.phone,
           g.nationality, g.id_type, g.id_number, g.vip_flag, g.city, g.country,
           g.notes, g.created_at, g.updated_at,
           (SELECT COUNT(*) FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?) as booking_count,
           (SELECT MAX(b.check_in) FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?) as last_stay
    FROM guests g
    WHERE (g.property_id = ? OR EXISTS (
      SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
    ))
  `;
  const params = [PROPERTY_ID(), PROPERTY_ID(), PROPERTY_ID(), PROPERTY_ID()];

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    query += ` AND (g.first_name LIKE ? OR g.last_name LIKE ? OR g.email LIKE ?
                    OR g.phone LIKE ? OR g.id_number LIKE ?
                    OR (g.first_name || ' ' || g.last_name) LIKE ?)`;
    params.push(s, s, s, s, s, s);
  }

  query += ' ORDER BY g.last_name, g.first_name';

  const guests = db.prepare(query).all(...params);
  return res.json({ guests });
});

// POST /api/guests
router.post('/', requireAuth, requireRole('owner','hotel_manager','front_desk','accountant'), (req, res) => {
  const db = getDb();
  const {
    first_name, last_name, email, phone, nationality,
    id_type, id_number, id_expiry, date_of_birth,
    address, city, country, vip_flag, notes
  } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'first_name and last_name are required' });
  }

  const result = db.prepare(`
    INSERT INTO guests (
      property_id, first_name, last_name, email, phone, nationality,
      id_type, id_number, id_expiry, date_of_birth,
      address, city, country, vip_flag, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    PROPERTY_ID(),
    first_name.trim(), last_name.trim(),
    email ? email.trim().toLowerCase() : null,
    phone || null, nationality || null,
    id_type || null, id_number || null, id_expiry || null,
    date_of_birth || null, address || null, city || null, country || null,
    vip_flag ? 1 : 0, notes || null
  );

  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ guest });
});

// GET /api/guests/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();

  // Verify guest belongs to this property (directly or via booking)
  const guest = db.prepare(`
    SELECT g.* FROM guests g
    WHERE g.id = ? AND (g.property_id = ? OR EXISTS (
      SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
    ))
  `).get(req.params.id, PROPERTY_ID(), PROPERTY_ID());

  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  const documents = db.prepare(`
    SELECT id, doc_type, file_name, uploaded_at
    FROM guest_documents WHERE guest_id = ?
    ORDER BY uploaded_at DESC
  `).all(req.params.id);

  const bookings = db.prepare(`
    SELECT b.id, b.booking_ref, b.check_in, b.check_out, b.nights,
           b.status, b.payment_status, b.total_amount, b.currency, b.source,
           r.room_number, rt.name as room_type_name
    FROM bookings b
    LEFT JOIN rooms r ON r.id = b.room_id
    LEFT JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.guest_id = ? AND b.property_id = ?
    ORDER BY b.check_in DESC
  `).all(req.params.id, PROPERTY_ID());

  return res.json({ guest, documents, bookings });
});

// PUT /api/guests/:id
router.put('/:id', requireAuth, requireRole('owner','hotel_manager','front_desk','accountant'), (req, res) => {
  const db = getDb();

  // Check guest is accessible
  const existing = db.prepare(`
    SELECT g.id FROM guests g
    WHERE g.id = ? AND (g.property_id = ? OR EXISTS (
      SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
    ))
  `).get(req.params.id, PROPERTY_ID(), PROPERTY_ID());

  if (!existing) return res.status(404).json({ error: 'Guest not found' });

  const {
    first_name, last_name, email, phone, nationality,
    id_type, id_number, id_expiry, date_of_birth,
    address, city, country, vip_flag, notes
  } = req.body;

  db.prepare(`
    UPDATE guests SET
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      nationality = COALESCE(?, nationality),
      id_type = COALESCE(?, id_type),
      id_number = COALESCE(?, id_number),
      id_expiry = COALESCE(?, id_expiry),
      date_of_birth = COALESCE(?, date_of_birth),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      country = COALESCE(?, country),
      vip_flag = COALESCE(?, vip_flag),
      notes = COALESCE(?, notes),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    first_name ? first_name.trim() : null,
    last_name ? last_name.trim() : null,
    email ? email.trim().toLowerCase() : null,
    phone || null, nationality || null,
    id_type || null, id_number || null, id_expiry || null,
    date_of_birth || null, address || null, city || null, country || null,
    vip_flag !== undefined ? (vip_flag ? 1 : 0) : null,
    notes || null,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  return res.json({ guest: updated });
});

// POST /api/guests/:id/documents
router.post('/:id/documents', requireAuth, (req, res) => {
  const db = getDb();

  // Check guest accessibility
  const guest = db.prepare(`
    SELECT g.id FROM guests g
    WHERE g.id = ? AND (g.property_id = ? OR EXISTS (
      SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
    ))
  `).get(req.params.id, PROPERTY_ID(), PROPERTY_ID());

  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  uploadDocument(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { doc_type = 'other' } = req.body;
    const result = db.prepare(`
      INSERT INTO guest_documents (guest_id, doc_type, file_path, file_name)
      VALUES (?, ?, ?, ?)
    `).run(req.params.id, doc_type, req.file.path, req.file.originalname);

    const doc = db.prepare('SELECT * FROM guest_documents WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ document: doc });
  });
});

// DELETE /api/guests/:id/documents/:doc_id
router.delete('/:id/documents/:doc_id', requireAuth, requireRole('owner','hotel_manager'), (req, res) => {
  const db = getDb();

  const doc = db.prepare(`
    SELECT gd.* FROM guest_documents gd
    JOIN guests g ON g.id = gd.guest_id
    WHERE gd.id = ? AND gd.guest_id = ?
      AND (g.property_id = ? OR EXISTS (
        SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
      ))
  `).get(req.params.doc_id, req.params.id, PROPERTY_ID(), PROPERTY_ID());

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Delete file from disk
  const fs = require('fs');
  try {
    if (fs.existsSync(doc.file_path)) fs.unlinkSync(doc.file_path);
  } catch (e) {
    console.error('Failed to delete file:', e.message);
  }

  db.prepare('DELETE FROM guest_documents WHERE id = ?').run(req.params.doc_id);
  return res.json({ ok: true });
});

// GET /api/guests/:id/documents/:doc_id/download
router.get('/:id/documents/:doc_id/download', requireAuth, (req, res) => {
  const db = getDb();
  const doc = db.prepare(`
    SELECT gd.* FROM guest_documents gd
    JOIN guests g ON g.id = gd.guest_id
    WHERE gd.id = ? AND gd.guest_id = ?
      AND (g.property_id = ? OR EXISTS (
        SELECT 1 FROM bookings b WHERE b.guest_id = g.id AND b.property_id = ?
      ))
  `).get(req.params.doc_id, req.params.id, PROPERTY_ID(), PROPERTY_ID());

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const fs = require('fs');
  if (!fs.existsSync(doc.file_path)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`);
  res.sendFile(doc.file_path);
});

module.exports = router;
