import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { requireAuth } from './auth.js';
import { db, getUserById, getRecords, getSemesters, getStorageUsage, deleteRecord, deleteSemester, markDeleted, restoreDeletedItem, runTransaction, embeddedPhotoKey } from '../db.js';

const router = Router();
const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function ownsUpload(userId, rawUrl) {
  try {
    const parts = new URL(rawUrl, 'http://localhost').pathname.split('/');
    if (parts.length !== 4 || parts[1] !== 'uploads') return false;
    const owner = decodeURIComponent(parts[2]);
    const filename = decodeURIComponent(parts[3]);
    if (owner !== userId || !filename || path.basename(filename) !== filename) return false;
    return !!db.prepare('SELECT 1 FROM files WHERE user_id = ? AND filename = ?').get(userId, filename);
  } catch {
    return false;
  }
}

// Used when the Node server is reached directly instead of through Nginx.
export function authorizeStoredUpload(req, res, next) {
  const user = getUserById(req.user.id);
  if (!user || user.is_banned || !ownsUpload(req.user.id, req.originalUrl)) return res.sendStatus(403);
  res.set('Cache-Control', 'private, no-store');
  next();
}

router.use(requireAuth, (req, res, next) => {
  const user = getUserById(req.user.id);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  if (user.is_banned) return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
  next();
});

// Nginx calls this internally before serving an uploaded file.
router.get('/authorize-upload', (req, res) => {
  if (!ownsUpload(req.user.id, req.get('X-Original-URI'))) return res.sendStatus(403);
  res.sendStatus(204);
});

router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const embeddedPhotos = [];
    const records = getRecords(userId).map(record => {
      (record.entries || []).forEach((entry, index) => {
        const key = embeddedPhotoKey(record.date, entry, index);
        if (key) embeddedPhotos.push({ id: `${record.date}:${index}`, date: record.date, index, photoKey: key, updatedAt: record.updatedAt, sizeBytes: Buffer.byteLength(entry.photo), url: `/api/storage/embedded/${encodeURIComponent(record.date)}/${index}?key=${encodeURIComponent(key)}` });
      });
      return ({
      date: record.date,
      updatedAt: record.updatedAt,
      sizeBytes: Buffer.byteLength(JSON.stringify(record.entries || [])) + Buffer.byteLength(record.note || ''),
      entries: (record.entries || []).filter(entry => entry && typeof entry === 'object').map(entry => ({ time: entry.time, type: entry.type, hasPhoto: !!entry.photo })),
      note: record.note
    }); });
    const semesters = getSemesters(userId).map(semester => ({ ...semester, sizeBytes: Buffer.byteLength(JSON.stringify(semester)) }));
    const files = db.prepare('SELECT id, filename, original_name AS originalName, size_bytes AS sizeBytes, created_at AS createdAt FROM files WHERE user_id = ? ORDER BY created_at DESC').all(userId)
      .map(file => ({ ...file, url: `/uploads/${userId}/${file.filename}` }));
    res.json({ records, semesters, files, embeddedPhotos, storageUsage: getStorageUsage(userId) });
  } catch (err) {
    console.error('Storage inventory failed:', err);
    res.status(500).json({ error: 'Could not load cloud storage' });
  }
});

router.get('/embedded/:date/:index', (req, res) => {
  try {
    const index = Number(req.params.index);
    if (!Number.isSafeInteger(index) || index < 0) return res.status(400).end();
    const row = db.prepare('SELECT entries FROM records WHERE user_id = ? AND date = ?').get(req.user.id, req.params.date);
    if (!row) return res.status(404).end();
    const entry = JSON.parse(row.entries || '[]')[index];
    if (!entry || embeddedPhotoKey(req.params.date, entry, index) !== req.query.key) return res.status(404).end();
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(entry.photo);
    if (!match) return res.status(415).end();
    res.set('Cache-Control', 'private, no-store');
    res.type(match[1]).send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    console.error('Embedded photo preview failed:', err);
    res.status(500).end();
  }
});

router.post('/delete', (req, res) => {
  const { collection, id, expectedUpdatedAt } = req.body || {};
  const userId = req.user.id;
  let movedFile = null;
  let originalFile = null;
  try {
    if (!['records', 'semesters', 'photos', 'embeddedPhotos'].includes(collection) || typeof id !== 'string' || !id) return res.status(400).json({ error: 'Invalid item' });
    if (collection === 'embeddedPhotos') {
      const match = /^(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(id);
      if (!match || typeof req.body.photoKey !== 'string') return res.status(400).json({ error: 'Invalid photo' });
      const date = match[1];
      const index = Number(match[2]);
      const row = db.prepare('SELECT entries, updated_at FROM records WHERE user_id = ? AND date = ?').get(userId, date);
      if (!row) return res.status(404).json({ error: 'Photo not found' });
      const entries = JSON.parse(row.entries || '[]');
      if (Number(row.updated_at || 0) !== Number(expectedUpdatedAt) || embeddedPhotoKey(date, entries[index], index) !== req.body.photoKey) return res.status(409).json({ error: 'This photo changed in the cloud. Refresh and review it before deleting.' });
      const updatedAt = Math.max(Date.now(), Number(row.updated_at || 0) + 1);
      runTransaction(() => {
        markDeleted(userId, 'photos', req.body.photoKey);
        entries[index] = { ...entries[index], photo: null };
        db.prepare('UPDATE records SET entries = ?, updated_at = ? WHERE user_id = ? AND date = ?').run(JSON.stringify(entries), updatedAt, userId, date);
      });
      return res.json({ success: true, embedded: { date, index, photoKey: req.body.photoKey }, changedRecords: [{ date, updatedAt }], storageUsage: getStorageUsage(userId) });
    }
    if (collection === 'photos') {
      const file = db.prepare('SELECT id, filename FROM files WHERE id = ? AND user_id = ?').get(id, userId);
      if (!file) return res.status(404).json({ error: 'Photo not found' });
      if (path.basename(file.filename) !== file.filename || path.basename(userId) !== userId) throw new Error('Invalid stored file path');
      const root = path.resolve(process.env.UPLOAD_DIR || path.join(serverDir, 'uploads'));
      originalFile = path.resolve(root, userId, file.filename);
      if (!originalFile.startsWith(path.join(root, userId) + path.sep)) throw new Error('Invalid stored file path');
      const url = `/uploads/${userId}/${file.filename}`;
      if (fs.existsSync(originalFile)) {
        movedFile = `${originalFile}.deleting-${randomUUID()}`;
        fs.renameSync(originalFile, movedFile);
      }
      const changedRecords = [];
      runTransaction(() => {
        markDeleted(userId, 'photos', url);
        const rows = db.prepare('SELECT date, entries, updated_at FROM records WHERE user_id = ?').all(userId);
        const update = db.prepare('UPDATE records SET entries = ?, updated_at = ? WHERE user_id = ? AND date = ?');
        for (const row of rows) {
          const entries = JSON.parse(row.entries || '[]');
          if (entries.some(entry => entry?.photo === url)) {
            const updatedAt = Math.max(Date.now(), Number(row.updated_at || 0) + 1);
            update.run(JSON.stringify(entries.map(entry => entry?.photo === url ? { ...entry, photo: null } : entry)), updatedAt, userId, row.date);
            changedRecords.push({ date: row.date, updatedAt });
          }
        }
        db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?').run(id, userId);
      });
      let cleanupPending = false;
      if (movedFile) {
        try { fs.unlinkSync(movedFile); } catch (err) { cleanupPending = true; console.error('Could not remove quarantined photo:', err); }
      }
      return res.json({ success: true, url, changedRecords, cleanupPending, storageUsage: getStorageUsage(userId) });
    }

    const item = collection === 'records'
      ? db.prepare('SELECT updated_at FROM records WHERE user_id = ? AND date = ?').get(userId, id)
      : db.prepare('SELECT updated_at FROM semesters WHERE user_id = ? AND (id = ? OR id = ?)').get(userId, id, `${userId}:${id}`);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (Number(item.updated_at || 0) !== Number(expectedUpdatedAt)) return res.status(409).json({ error: 'This item changed in the cloud. Refresh and review it before deleting.' });
    const deletedAt = runTransaction(() => {
      const timestamp = markDeleted(userId, collection, id);
      if (collection === 'records') deleteRecord(userId, id);
      else deleteSemester(userId, id);
      return timestamp;
    });
    res.json({ success: true, deletedAt, storageUsage: getStorageUsage(userId) });
  } catch (err) {
    if (movedFile && fs.existsSync(movedFile)) {
      try { fs.renameSync(movedFile, originalFile); } catch (restoreError) { console.error('Could not restore quarantined photo:', restoreError); }
    }
    console.error('Cloud deletion failed:', err);
    res.status(500).json({ error: 'Could not delete the cloud item' });
  }
});

router.post('/restore', (req, res) => {
  try {
    const { collection, id, deletedAt, value } = req.body || {};
    if (!['records', 'semesters'].includes(collection) || typeof id !== 'string' || !id) return res.status(400).json({ error: 'Invalid item' });
    const updatedAt = restoreDeletedItem(req.user.id, collection, id, deletedAt, value);
    res.json({ success: true, updatedAt });
  } catch (err) {
    console.error('Restore deleted item failed:', err);
    res.status(err.code === 'DELETED_ITEM_CONFLICT' ? 409 : 500).json({ error: err.message });
  }
});

export default router;
