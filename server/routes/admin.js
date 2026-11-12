import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { getOptimizerJob, getOptimizerSummary, startOptimizerJob } from '../services/photoOptimizer.js';
import { requireAdmin } from './auth.js';
import { 
  db,
  runTransaction,
  getAllUsersStats, 
  getStorageUsage,
  getUserDataForAdmin,
  getDefaultStorageLimitMb, 
  setDefaultStorageLimitMb, 
  setUserStorageLimitMb,
  getUserById,
  banUser,
  createNotification,
  getAllNotifications,
  deleteNotification,
  getSupportMessages,
  deleteSupportMessage,
  replyToSupportMessage
} from '../db.js';

const router = Router();

const photoHash = value => createHash('sha256').update(value).digest('hex');
function optimizedImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 200 * 1024) return null;
  const valid = match[1] === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : match[1] === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return valid ? { mime: match[1], bytes } : null;
}

function optimizePhoto(req, res) {
  const { kind, date, index, fileId, expectedHash, dataUrl } = req.body || {};
  const userId = req.params.id;
  const image = optimizedImage(dataUrl);
  if (!getUserById(userId) || path.basename(userId) !== userId || !/^[a-f0-9]{64}$/.test(expectedHash || '') || !image) return res.status(400).json({ error: 'Invalid optimization request' });
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads'));
  const backupDir = path.join(path.dirname(root), 'photo-optimization-backups', userId);
  const userDir = path.join(root, userId);
  const beforeBytes = getStorageUsage(userId).totalBytes;
  let newFile = null;
  try {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    if (kind === 'embedded') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isSafeInteger(index) || index < 0 || image.mime !== 'image/webp') return res.sendStatus(400);
      const row = db.prepare('SELECT entries FROM records WHERE user_id = ? AND date = ?').get(userId, date);
      const entries = row && JSON.parse(row.entries || '[]');
      const original = entries?.[index]?.photo;
      if (typeof original !== 'string' || !original.startsWith('data:image/') || photoHash(original) !== expectedHash) return res.status(409).json({ error: 'Photo changed' });
      if (dataUrl.length >= original.length) return res.json({ optimized: false });
      const identity = entries[index].id == null ? `index-${index}` : `id-${String(entries[index].id)}`;
      const filename = `optimized_${randomUUID()}.webp`;
      const newFileId = `file_${randomUUID()}`;
      const replacement = `/uploads/${userId}/${filename}`;
      const updatedEntries = entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, photo: replacement } : entry);
      if (Buffer.byteLength(JSON.stringify(entries)) <= Buffer.byteLength(JSON.stringify(updatedEntries)) + image.bytes.length) return res.json({ optimized: false });
      const backupId = randomUUID();
      const backup = path.join(backupDir, `${backupId}.txt`);
      fs.writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
      fs.mkdirSync(userDir, { recursive: true });
      newFile = path.join(userDir, filename);
      fs.writeFileSync(newFile, image.bytes, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(backupDir, `${backupId}.json`), JSON.stringify({ kind, userId, date, index, identity, originalHash: expectedHash, replacement, savedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      runTransaction(() => {
        db.prepare('INSERT INTO files (id,user_id,filename,original_name,size_bytes) VALUES (?,?,?,?,?)').run(newFileId, userId, filename, filename, image.bytes.length);
        db.prepare('UPDATE records SET entries = ? WHERE user_id = ? AND date = ?').run(JSON.stringify(updatedEntries), userId, date);
        db.prepare('INSERT OR REPLACE INTO optimized_photo_aliases (user_id,record_date,entry_identity,original_hash,replacement_url) VALUES (?,?,?,?,?)').run(userId, date, identity, expectedHash, replacement);
        db.prepare('INSERT OR REPLACE INTO optimizer_processed_files (user_id, file_id, content_hash) VALUES (?, ?, ?)').run(userId, newFileId, photoHash(image.bytes));
      });
      newFile = null;
      return res.json({ optimized: true, fileId: newFileId, savedBytes: beforeBytes - getStorageUsage(userId).totalBytes });
    }
    if (kind === 'file') {
      const file = db.prepare('SELECT filename FROM files WHERE user_id = ? AND id = ?').get(userId, fileId);
      if (!file || path.basename(file.filename) !== file.filename) return res.status(404).json({ error: 'Photo not found' });
      const ext = path.extname(file.filename).toLowerCase();
      if (!({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] || ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' })[ext] !== image.mime) return res.sendStatus(415);
      const originalPath = path.join(userDir, file.filename);
      const original = fs.readFileSync(originalPath);
      if (photoHash(original) !== expectedHash) return res.status(409).json({ error: 'Photo changed' });
      if (image.bytes.length >= original.length) return res.json({ optimized: false });
      // A restored backup can contain the exact same image as an embedded data URL.
      // Remember the original bytes for each referencing punch before replacing the file.
      const url = `/uploads/${userId}/${file.filename}`;
      const originalDataHash = photoHash(`data:${image.mime};base64,${original.toString('base64')}`);
      const references = [];
      for (const row of db.prepare('SELECT date, entries FROM records WHERE user_id = ?').all(userId)) {
        const entries = JSON.parse(row.entries || '[]');
        entries.forEach((entry, index) => {
          if (entry?.photo === url) references.push({ date: row.date, identity: entry.id == null ? `index-${index}` : `id-${String(entry.id)}` });
        });
      }
      const backupId = randomUUID();
      const backupPath = path.join(backupDir, `${backupId}${ext}`);
      fs.writeFileSync(backupPath, original, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(backupDir, `${backupId}.json`), JSON.stringify({ kind, userId, fileId, filename: file.filename, originalHash: expectedHash, savedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      newFile = `${originalPath}.${randomUUID()}.tmp`;
      fs.writeFileSync(newFile, image.bytes, { flag: 'wx', mode: 0o600 });
      fs.renameSync(newFile, originalPath);
      newFile = null;
      try { runTransaction(() => {
        db.prepare('UPDATE files SET size_bytes = ? WHERE user_id = ? AND id = ?').run(image.bytes.length, userId, fileId);
        db.prepare('INSERT OR REPLACE INTO optimizer_processed_files (user_id, file_id, content_hash) VALUES (?, ?, ?)').run(userId, fileId, photoHash(image.bytes));
        const addAlias = db.prepare('INSERT OR IGNORE INTO optimized_photo_aliases (user_id, record_date, entry_identity, original_hash, replacement_url) VALUES (?, ?, ?, ?, ?)');
        for (const ref of references) addAlias.run(userId, ref.date, ref.identity, originalDataHash, url);
      }); }
      catch (err) { fs.copyFileSync(backupPath, originalPath); throw err; }
      return res.json({ optimized: true, savedBytes: beforeBytes - getStorageUsage(userId).totalBytes });
    }
    return res.sendStatus(400);
  } catch (err) {
    if (newFile) { try { fs.unlinkSync(newFile); } catch { /* Best effort. */ } }
    console.error('Photo optimization failed:', err);
    return res.status(500).json({ error: 'Photo optimization failed' });
  }
}

router.post('/users/:id/optimize-photo', requireAdmin, optimizePhoto);

router.get('/optimizer', requireAdmin, (req, res) => res.json({ job: getOptimizerJob(), users: getOptimizerSummary() }));
router.post('/optimizer', requireAdmin, (req, res) => {
  try {
    const { mode, userId } = req.body || {};
    if (!['preview', 'optimize'].includes(mode) || (userId && !getUserById(userId))) return res.status(400).json({ error: 'Invalid optimizer request' });
    const job = startOptimizerJob({ mode, userId: userId || null, requestedBy: req.user.id }, optimizePhoto);
    return res.status(202).json({ job });
  } catch (err) { return res.status(409).json({ error: err.message }); }
});

router.get('/users/:id/photos/:fileId', requireAdmin, (req, res) => {
  const file = db.prepare('SELECT filename FROM files WHERE user_id = ? AND id = ?').get(req.params.id, req.params.fileId);
  if (!file || path.basename(file.filename) !== file.filename || path.basename(req.params.id) !== req.params.id) return res.sendStatus(404);
  const root = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads'));
  const filePath = path.resolve(root, req.params.id, file.filename);
  if (!filePath.startsWith(path.join(root, req.params.id) + path.sep) || !fs.existsSync(filePath)) return res.sendStatus(404);
  res.set('Cache-Control', 'private, no-store');
  return res.sendFile(filePath);
});

router.get('/users/:id/records/:date/photos/:index', requireAdmin, (req, res) => {
  const index = Number(req.params.index);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date) || !Number.isSafeInteger(index) || index < 0) return res.sendStatus(400);
  const row = db.prepare('SELECT entries FROM records WHERE user_id = ? AND date = ?').get(req.params.id, req.params.date);
  if (!row) return res.sendStatus(404);
  try {
    const photo = JSON.parse(row.entries || '[]')[index]?.photo;
    const match = typeof photo === 'string' && /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(photo);
    if (!match) return res.sendStatus(404);
    res.set('Cache-Control', 'private, no-store');
    return res.type(match[1]).send(Buffer.from(match[2], 'base64'));
  } catch { return res.sendStatus(404); }
});

router.get('/users/:id/data', requireAdmin, (req, res) => {
  try {
    const data = getUserDataForAdmin(req.params.id);
    if (!data) return res.status(404).json({ error: 'User not found' });
    return res.json(data);
  } catch (err) {
    console.error('Admin user data error:', err);
    return res.status(500).json({ error: 'Failed to retrieve user data' });
  }
});

router.get('/messages', requireAdmin, (req, res) => {
  try { res.json({ messages: getSupportMessages() }); }
  catch (err) { console.error('Fetch messages error:', err); res.status(500).json({ error: 'Failed to fetch messages' }); }
});

router.post('/messages/:id/replies', requireAdmin, (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid message id' });
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const type = ['info', 'warning', 'alert', 'success'].includes(req.body?.type) ? req.body.type : 'info';
  if (!title || title.length > 200 || !message || message.length > 4000) return res.status(400).json({ error: 'Enter a title and a message of up to 4000 characters.' });
  try {
    const notification = replyToSupportMessage(Number(req.params.id), title, message, req.user.email, type);
    if (!notification) return res.status(404).json({ error: 'Message not found' });
    return res.status(201).json({ success: true, notification });
  } catch (err) { console.error('Reply to message error:', err); return res.status(500).json({ error: 'Failed to send reply' }); }
});

router.delete('/messages/:id', requireAdmin, (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid message id' });
  try {
    if (!deleteSupportMessage(Number(req.params.id))) return res.status(404).json({ error: 'Message not found' });
    return res.json({ success: true });
  } catch (err) { console.error('Delete message error:', err); return res.status(500).json({ error: 'Failed to delete message' }); }
});

router.get('/metrics', requireAdmin, (req, res) => {
  try {
    const users = getAllUsersStats();
    const defaultLimitMb = getDefaultStorageLimitMb();
    const now = Date.now();

    const summary = users.reduce((acc, u) => {
      acc.totalUsers += 1;
      acc.totalRecords += u.recordsCount || 0;
      acc.totalFiles += u.filesCount || 0;
      acc.totalDbBytes += u.dbBytes || 0;
      acc.totalFilesBytes += u.filesBytes || 0;
      acc.totalBytes += u.totalBytes || 0;
      if (u.is_banned) acc.totalBanned += 1;
      if (u.lastSeenAt && u.lastSeenAt >= now - 86400000) acc.connected24Hours += 1;
      if (u.lastSeenAt && u.lastSeenAt >= now - 7 * 86400000) acc.connected7Days += 1;
      if (!u.lastSeenAt) acc.connectionUnknown += 1;
      return acc;
    }, {
      totalUsers: 0,
      totalBanned: 0,
      totalRecords: 0,
      totalFiles: 0,
      totalDbBytes: 0,
      totalFilesBytes: 0,
      totalBytes: 0,
      connected24Hours: 0,
      connected7Days: 0,
      connectionUnknown: 0
    });

    res.json({
      summary,
      defaultLimitMb,
      users
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: 'Failed to retrieve admin metrics' });
  }
});

// Update default storage limit for all users
router.put('/config/storage-limit', requireAdmin, (req, res) => {
  try {
    const { limitMb } = req.body;
    if (!limitMb || Number(limitMb) < 1) {
      return res.status(400).json({ error: 'Invalid storage limit' });
    }
    setDefaultStorageLimitMb(Number(limitMb));
    res.json({ success: true, defaultLimitMb: Number(limitMb) });
  } catch (err) {
    console.error('Update default limit error:', err);
    res.status(500).json({ error: 'Failed to update default storage limit' });
  }
});

// Set custom storage limit exception for a specific user
router.put('/users/:id/storage-limit', requireAdmin, (req, res) => {
  try {
    const { limitMb } = req.body; // if null/0, resets to default
    setUserStorageLimitMb(req.params.id, limitMb);
    res.json({ success: true, userId: req.params.id, limitMb });
  } catch (err) {
    console.error('Update user limit error:', err);
    res.status(500).json({ error: 'Failed to update user storage limit' });
  }
});

// Ban or unban a user
router.put('/users/:id/ban', requireAdmin, (req, res) => {
  try {
    const { isBanned, reason } = req.body;
    const target = getUserById(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot ban your own administrator account' });
    }

    const updated = banUser(req.params.id, !!isBanned, reason || '');
    res.json({ 
      success: true, 
      userId: req.params.id, 
      isBanned: !!updated.is_banned,
      banReason: updated.ban_reason 
    });
  } catch (err) {
    console.error('Ban user error:', err);
    res.status(500).json({ error: 'Failed to update user ban status' });
  }
});

// Get all sent notifications and announcements
router.get('/notifications', requireAdmin, (req, res) => {
  try {
    const list = getAllNotifications();
    res.json({ notifications: list });
  } catch (err) {
    console.error('Fetch all notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Send notification or message to a user or all users
router.post('/notifications', requireAdmin, (req, res) => {
  try {
    const { userId, title, message, type } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const notif = createNotification({
      userId: userId === 'all' || !userId ? null : userId,
      title: title.trim(),
      message: message.trim(),
      type: type || 'info',
      createdBy: req.user.email
    });

    res.json({ success: true, notification: notif });
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Delete or recall a notification
router.delete('/notifications/:id', requireAdmin, (req, res) => {
  try {
    deleteNotification(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
