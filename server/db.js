import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, 'pronto.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    email TEXT UNIQUE,
    name TEXT,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_admin INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS records (
    user_id TEXT,
    date TEXT,
    entries TEXT DEFAULT '[]',
    note TEXT DEFAULT '',
    updated_at INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS semesters (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    start_date TEXT,
    end_date TEXT,
    targets TEXT DEFAULT '[]',
    updated_at INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    data TEXT DEFAULT '{}',
    updated_at INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    filename TEXT,
    original_name TEXT,
    size_bytes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);
  CREATE INDEX IF NOT EXISTS idx_semesters_user ON semesters(user_id);
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);
`);

// Safe column migrations
try {
  db.exec('ALTER TABLE users ADD COLUMN storage_limit_mb INTEGER DEFAULT NULL;');
} catch (e) {
  // column already exists
}

export function runTransaction(fn) {
  db.exec('BEGIN');
  try {
    const res = fn();
    db.exec('COMMIT');
    return res;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Users
export function upsertUser({ id, google_id, email, name, avatar_url, is_admin = 0 }) {
  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);

  if (existing) {
    const newAdmin = existing.is_admin === 1 ? 1 : is_admin;
    db.prepare(`
      UPDATE users 
      SET name = ?, avatar_url = ?, email = ?, is_admin = ?
      WHERE google_id = ?
    `).run(name, avatar_url, email, newAdmin, google_id);
    return db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);
  } else {
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, avatar_url, is_admin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, google_id, email, name, avatar_url, is_admin);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getDefaultStorageLimitMb() {
  const row = db.prepare("SELECT value FROM system_config WHERE key = 'default_storage_limit_mb'").get();
  return row ? parseInt(row.value, 10) || 50 : 50;
}

export function setDefaultStorageLimitMb(mb) {
  const val = Math.max(1, parseInt(mb, 10) || 50);
  const existing = db.prepare("SELECT key FROM system_config WHERE key = 'default_storage_limit_mb'").get();
  if (existing) {
    db.prepare("UPDATE system_config SET value = ? WHERE key = 'default_storage_limit_mb'").run(String(val));
  } else {
    db.prepare("INSERT INTO system_config (key, value) VALUES ('default_storage_limit_mb', ?)").run(String(val));
  }
}

export function setUserStorageLimitMb(userId, mb) {
  const val = (mb !== null && mb !== undefined && Number(mb) > 0) ? parseInt(mb, 10) : null;
  db.prepare('UPDATE users SET storage_limit_mb = ? WHERE id = ?').run(val, userId);
}

// Storage calculations
export function getStorageUsage(userId) {
  const user = db.prepare('SELECT storage_limit_mb FROM users WHERE id = ?').get(userId);
  const defaultLimitMb = getDefaultStorageLimitMb();
  const effectiveLimitMb = (user && user.storage_limit_mb !== null && user.storage_limit_mb !== undefined)
    ? Number(user.storage_limit_mb)
    : defaultLimitMb;

  const storageLimitBytes = effectiveLimitMb * 1024 * 1024;

  const recordsRow = db.prepare(`
    SELECT COUNT(*) as count, 
           COALESCE(SUM(LENGTH(entries) + LENGTH(note) + LENGTH(date)), 0) as bytes
    FROM records WHERE user_id = ?
  `).get(userId);

  const semestersRow = db.prepare(`
    SELECT COUNT(*) as count,
           COALESCE(SUM(LENGTH(name) + LENGTH(targets) + 50), 0) as bytes
    FROM semesters WHERE user_id = ?
  `).get(userId);

  const settingsRow = db.prepare(`
    SELECT COALESCE(LENGTH(data), 0) as bytes FROM settings WHERE user_id = ?
  `).get(userId);

  const filesRow = db.prepare(`
    SELECT COUNT(*) as count, 
           COALESCE(SUM(size_bytes), 0) as bytes 
    FROM files WHERE user_id = ?
  `).get(userId);

  const dbBytes = Number(recordsRow?.bytes || 0) + Number(semestersRow?.bytes || 0) + Number(settingsRow?.bytes || 0);
  const filesBytes = Number(filesRow?.bytes || 0);
  const totalBytes = dbBytes + filesBytes;

  return {
    dbBytes,
    filesBytes,
    totalBytes,
    recordsCount: Number(recordsRow?.count || 0),
    filesCount: Number(filesRow?.count || 0),
    storageLimitBytes,
    storageLimitMb: effectiveLimitMb,
    isCustomLimit: user?.storage_limit_mb !== null && user?.storage_limit_mb !== undefined
  };
}

// Admin stats
export function getAllUsersStats() {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  return users.map(user => {
    const usage = getStorageUsage(user.id);
    return {
      id: user.id,
      google_id: user.google_id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      is_admin: user.is_admin,
      ...usage
    };
  });
}

// Records
export function getRecords(userId) {
  const rows = db.prepare('SELECT date, entries, note, updated_at FROM records WHERE user_id = ?').all(userId);
  return rows.map(r => ({
    date: r.date,
    entries: JSON.parse(r.entries || '[]'),
    note: r.note || '',
    updatedAt: r.updated_at
  }));
}

export function upsertRecord(userId, { date, entries, note, updatedAt }) {
  const entriesStr = typeof entries === 'string' ? entries : JSON.stringify(entries || []);
  const stmt = db.prepare(`
    INSERT INTO records (user_id, date, entries, note, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      entries = CASE WHEN excluded.updated_at >= records.updated_at THEN excluded.entries ELSE records.entries END,
      note = CASE WHEN excluded.updated_at >= records.updated_at THEN excluded.note ELSE records.note END,
      updated_at = MAX(records.updated_at, excluded.updated_at)
  `);
  stmt.run(userId, date, entriesStr, note || '', updatedAt || Date.now());
}

export function deleteRecord(userId, date) {
  db.prepare('DELETE FROM records WHERE user_id = ? AND date = ?').run(userId, date);
}

// Semesters
export function getSemesters(userId) {
  const rows = db.prepare('SELECT id, name, start_date, end_date, targets, updated_at FROM semesters WHERE user_id = ?').all(userId);
  return rows.map(s => ({
    id: s.id.startsWith(`${userId}:`) ? s.id.slice(userId.length + 1) : s.id,
    name: s.name,
    startDate: s.start_date,
    endDate: s.end_date,
    targets: JSON.parse(s.targets || '[]'),
    updatedAt: s.updated_at
  }));
}

export function upsertSemester(userId, { id, name, startDate, endDate, targets, updatedAt }) {
  const targetsStr = typeof targets === 'string' ? targets : JSON.stringify(targets || []);
  // Older rows used globally shared numeric IDs; keep those for their owner,
  // but give new rows an account-scoped key so two users cannot overwrite each other.
  const legacy = db.prepare('SELECT id FROM semesters WHERE id = ? AND user_id = ?').get(String(id), userId);
  const storedId = legacy ? legacy.id : `${userId}:${id}`;
  const stmt = db.prepare(`
    INSERT INTO semesters (id, user_id, name, start_date, end_date, targets, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      targets = excluded.targets,
      updated_at = excluded.updated_at
  `);
  stmt.run(storedId, userId, name, startDate, endDate, targetsStr, updatedAt || Date.now());
}

export function deleteSemester(userId, id) {
  db.prepare('DELETE FROM semesters WHERE user_id = ? AND (id = ? OR id = ?)').run(userId, String(id), `${userId}:${id}`);
}

// Settings
export function getSettings(userId) {
  const row = db.prepare('SELECT data, updated_at FROM settings WHERE user_id = ?').get(userId);
  if (!row) return null;
  return {
    ...JSON.parse(row.data || '{}'),
    updatedAt: row.updated_at
  };
}

export function upsertSettings(userId, settings, updatedAt) {
  const dataStr = JSON.stringify(settings || {});
  const stmt = db.prepare(`
    INSERT INTO settings (user_id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      data = CASE WHEN excluded.updated_at >= settings.updated_at THEN excluded.data ELSE settings.data END,
      updated_at = MAX(settings.updated_at, excluded.updated_at)
  `);
  stmt.run(userId, dataStr, updatedAt || Date.now());
}

// Files
export function addFileRecord(id, userId, filename, originalName, sizeBytes) {
  db.prepare(`
    INSERT INTO files (id, user_id, filename, original_name, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, filename, originalName, sizeBytes);
}
