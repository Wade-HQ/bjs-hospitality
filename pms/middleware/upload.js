'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');

let sharp;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const UPLOADS_PATH = process.env.UPLOADS_PATH || '/opt/bjs-hospitality/uploads';
const IMG_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Compress images larger than 300 KB to keep storage small
const COMPRESS_THRESHOLD = 300 * 1024;

function sanitizeFilename(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// After multer writes the file, compress it in-place if it's an image over threshold
async function compressIfNeeded(file) {
  if (!sharp || !IMG_MIMES.has(file.mimetype)) return;
  const stat = fs.statSync(file.path);
  if (stat.size <= COMPRESS_THRESHOLD) return;
  const tmp = file.path + '.tmp';
  try {
    await sharp(file.path)
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75, progressive: true })
      .toFile(tmp);
    fs.renameSync(tmp, file.path);
  } catch (e) {
    // Leave original untouched if compression fails
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function makeMemStorage() {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      let dir;
      if (req.params && req.params.guest_id) {
        dir = path.join(UPLOADS_PATH, 'documents', 'guests', String(req.params.guest_id));
      } else if (req.params && req.params.id) {
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
}

const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const propId = process.env.PROPERTY_ID || 'misc';
    const dir = path.join(UPLOADS_PATH, 'images', 'properties', String(propId));
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

const _multerDocument = multer({ storage: makeMemStorage(), fileFilter, limits }).single('file');

// Wraps multer upload with post-upload compression for images
function uploadDocument(req, res, done) {
  _multerDocument(req, res, async (err) => {
    if (err || !req.file) return done(err);
    await compressIfNeeded(req.file);
    done();
  });
}

const uploadImage = multer({ storage: imageStorage, fileFilter, limits }).single('image');

module.exports = { uploadDocument, uploadImage };
