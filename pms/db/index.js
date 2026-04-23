'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const { runMigrations } = require('./schema');

const DB_PATH = process.env.DATABASE_PATH || '/opt/bjs-hospitality/database/hospitality.db';

let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    _db.pragma('busy_timeout = 5000');
  }
  return _db;
}

async function initDb() {
  const db = getDb();
  await runMigrations(db);
  return db;
}

module.exports = { getDb, initDb };
