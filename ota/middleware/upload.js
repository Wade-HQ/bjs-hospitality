'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_PATH = process.env.UPLOADS_PATH || '/opt/bjs-hospitality/uploads';

function sanitizeFilename(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dir;
    if (req.params && req.params.guest_id) {
      dir = path.join(UPLOADS_PATH, 'documents', 'guests', String(req.params.guest_id));
    } else if (req.params && req.params.id) {
      // fallback: guest route uses :id
      dir = path.join(UPLOADS_PATH, 'documents', 'guests', String(req.params.id));
    } else {
      dir = path.join(UPLOADS_PATH, 'documents', 'misc');
    }
    ensureDir(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const safe = sanitizeFilename(file.originalname);
    cb(null, Date.now() + '-' + safe);
  }
});

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dir;
    if (req.params && req.params.property_id) {
      dir = path.join(UPLOADS_PATH, 'images', 'properties', String(req.params.property_id));
    } else {
      dir = path.join(UPLOADS_PATH, 'images', 'misc');
    }
    ensureDir(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const safe = sanitizeFilename(file.originalname);
    cb(null, Date.now() + '-' + safe);
  }
});

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP and PDF allowed.'), false);
  }
}

const limits = { fileSize: 10 * 1024 * 1024 };

const uploadDocument = multer({ storage: documentStorage, fileFilter, limits }).single('file');
const uploadImage = multer({ storage: imageStorage, fileFilter, limits }).single('image');

module.exports = { uploadDocument, uploadImage };
