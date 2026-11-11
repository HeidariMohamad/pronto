import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { createHash } from 'crypto';
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

  CREATE TABLE IF NOT EXISTS deleted_items (
    user_id TEXT NOT NULL,
    collection TEXT NOT NULL,
    item_id TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, collection, item_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

try {
  db.exec('ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0;');
} catch (e) {
  // column already exists
}

try {
  db.exec('ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT "";');
} catch (e) {
  // column already exists
}

try {
  db.exec('ALTER TABLE users ADD COLUMN banned_at INTEGER DEFAULT NULL;');
} catch (e) {
  // column already exists
}

// Notifications and user messaging schema
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    created_by TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id TEXT,
    user_id TEXT,
    read_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    PRIMARY KEY (notification_id, user_id),
    FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

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
export function upsertUser({ id, google_id, email, name, avatar_url = '', is_admin = 0 }) {
  const safeAvatar = avatar_url || '';
  const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);

  if (existing) {
    const newAdmin = existing.is_admin === 1 ? 1 : is_admin;
    db.prepare(`
      UPDATE users 
      SET name = ?, avatar_url = ?, email = ?, is_admin = ?
      WHERE google_id = ?
    `).run(name, safeAvatar, email, newAdmin, google_id);
    return db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);
  } else {
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, avatar_url, is_admin)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, google_id, email, name, safeAvatar, is_admin);
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
           COALESCE(SUM(LENGTH(CAST(entries AS BLOB)) + LENGTH(CAST(note AS BLOB)) + LENGTH(CAST(date AS BLOB))), 0) as bytes
    FROM records WHERE user_id = ?
  `).get(userId);

  const semestersRow = db.prepare(`
    SELECT COUNT(*) as count,
           COALESCE(SUM(LENGTH(CAST(name AS BLOB)) + LENGTH(CAST(targets AS BLOB)) + 50), 0) as bytes
    FROM semesters WHERE user_id = ?
  `).get(userId);

  const settingsRow = db.prepare(`
    SELECT COALESCE(LENGTH(CAST(data AS BLOB)), 0) as bytes FROM settings WHERE user_id = ?
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
      is_banned: user.is_banned || 0,
      ban_reason: user.ban_reason || '',
      banned_at: user.banned_at || null,
      ...usage
    };
  });
}

// User ban management
export function banUser(userId, isBanned, reason = '') {
  db.prepare(`
    UPDATE users 
    SET is_banned = ?, ban_reason = ?, banned_at = ?
    WHERE id = ?
  `).run(isBanned ? 1 : 0, isBanned ? reason : '', isBanned ? Date.now() : null, userId);
  return getUserById(userId);
}

// Notifications & Messaging
export function createNotification({ id, userId = null, title, message, type = 'info', createdBy = null }) {
  const notifId = id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO notifications (id, user_id, title, message, type, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(notifId, userId || null, title, message, type, now, createdBy);
  return { id: notifId, userId, title, message, type, createdAt: now, createdBy };
}

export function getUserNotifications(userId) {
  const rows = db.prepare(`
    SELECT n.*, 
           CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END as is_read
    FROM notifications n
    LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
    WHERE n.user_id IS NULL OR n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 50
  `).all(userId, userId);

  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    message: r.message,
    type: r.type,
    createdAt: r.created_at,
    createdBy: r.created_by,
    isRead: Boolean(r.is_read)
  }));
}

export function dismissNotification(notificationId, userId) {
  db.prepare(`
    INSERT INTO notification_reads (notification_id, user_id, read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
  `).run(notificationId, userId, Date.now());
}

export function getAllNotifications() {
  return db.prepare(`
    SELECT n.*, 
           u.name as recipient_name, 
           u.email as recipient_email,
           (SELECT COUNT(*) FROM notification_reads WHERE notification_id = n.id) as read_count
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    ORDER BY n.created_at DESC
  `).all().map(r => ({
    id: r.id,
    userId: r.user_id,
    recipientName: r.recipient_name || (r.user_id ? 'Unknown' : 'All Users (Broadcast)'),
    recipientEmail: r.recipient_email || '',
    title: r.title,
    message: r.message,
    type: r.type,
    createdAt: r.created_at,
    createdBy: r.created_by,
    readCount: r.read_count || 0
  }));
}

export function deleteNotification(notificationId) {
  db.prepare('DELETE FROM notifications WHERE id = ?').run(notificationId);
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
  rejectDeletedItem(userId, 'records', date);
  const inputEntries = typeof entries === 'string' ? JSON.parse(entries) : (entries || []);
  const removedPhotos = new Set(db.prepare("SELECT item_id FROM deleted_items WHERE user_id = ? AND collection = 'photos'").all(userId).map(row => row.item_id));
  const hasEmbeddedDeletions = [...removedPhotos].some(value => value.startsWith('embedded:'));
  const entriesStr = JSON.stringify(inputEntries.map((entry, index) => {
    const key = hasEmbeddedDeletions ? embeddedPhotoKey(date, entry, index) : null;
    return removedPhotos.has(entry?.photo) || (key && removedPhotos.has(key)) ? { ...entry, photo: null } : entry;
  }));
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
  rejectDeletedItem(userId, 'semesters', String(id));
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

export function getDeletedItems(userId) {
  return db.prepare('SELECT collection, item_id AS id, deleted_at AS deletedAt FROM deleted_items WHERE user_id = ?').all(userId);
}

export function embeddedPhotoKey(date, entry, index) {
  if (typeof entry?.photo !== 'string' || !entry.photo.startsWith('data:image/')) return null;
  const identity = entry.id == null ? `index-${index}` : `id-${String(entry.id)}`;
  const hash = createHash('sha256').update(entry.photo, 'utf8').digest('hex');
  return `embedded:${JSON.stringify([date, identity, hash])}`;
}

function rejectDeletedItem(userId, collection, id) {
  if (db.prepare('SELECT 1 FROM deleted_items WHERE user_id = ? AND collection = ? AND item_id = ?').get(userId, collection, String(id))) {
    const error = new Error('An item was deleted from the cloud. Use Sync Now to review the conflict.');
    error.code = 'DELETED_ITEM_CONFLICT';
    throw error;
  }
}

export function markDeleted(userId, collection, id) {
  const previous = db.prepare('SELECT deleted_at FROM deleted_items WHERE user_id = ? AND collection = ? AND item_id = ?').get(userId, collection, String(id));
  const deletedAt = Math.max(Date.now(), Number(previous?.deleted_at || 0) + 1);
  db.prepare('INSERT INTO deleted_items (user_id, collection, item_id, deleted_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, collection, item_id) DO UPDATE SET deleted_at = excluded.deleted_at').run(userId, collection, String(id), deletedAt);
  return deletedAt;
}

export function restoreDeletedItem(userId, collection, id, deletedAt, value) {
  return runTransaction(() => {
    const tombstone = db.prepare('SELECT deleted_at FROM deleted_items WHERE user_id = ? AND collection = ? AND item_id = ?').get(userId, collection, String(id));
    if (!tombstone || Number(tombstone.deleted_at) !== Number(deletedAt)) {
      const error = new Error('Cloud data changed. Please review it again.');
      error.code = 'DELETED_ITEM_CONFLICT';
      throw error;
    }
    if (!value || (collection === 'records' && value.date !== id) || (collection === 'semesters' && String(value.id) !== String(id))) throw new Error('Invalid item');
    db.prepare('DELETE FROM deleted_items WHERE user_id = ? AND collection = ? AND item_id = ?').run(userId, collection, String(id));
    const updatedAt = Date.now();
    if (collection === 'records') upsertRecord(userId, { ...value, updatedAt });
    else if (collection === 'semesters') upsertSemester(userId, { ...value, updatedAt });
    else throw new Error('Invalid collection');
    return updatedAt;
  });
}
