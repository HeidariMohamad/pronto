import { Router } from 'express';
import { requireAuth } from './auth.js';
import {
  getUserById,
  getRecords,
  upsertRecord,
  getSemesters,
  upsertSemester,
  getSettings,
  upsertSettings,
  getStorageUsage,
  getDeletedItems,
  runTransaction
} from '../db.js';

const router = Router();

// Middleware to block suspended accounts from syncing
router.use(requireAuth, (req, res, next) => {
  const user = getUserById(req.user.id);
  if (user?.is_banned) {
    return res.status(403).json({ 
      error: `Your account has been suspended by an administrator${user.ban_reason ? `: "${user.ban_reason}"` : '.'}`,
      isBanned: true,
      banReason: user.ban_reason || ''
    });
  }
  next();
});

// Full download (e.g., logging in on a new device)
router.get('/pull', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const records = getRecords(userId);
    const semesters = getSemesters(userId);
    const settings = getSettings(userId);
    const storageUsage = getStorageUsage(userId);

    res.json({
      records,
      semesters,
      settings,
      deletedItems: getDeletedItems(userId),
      storageUsage
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    res.status(500).json({ error: 'Failed to pull sync data' });
  }
});

// Incremental push of pending local changes
router.post('/push', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const { records = [], semesters = [], settings = null } = req.body;

    runTransaction(() => {
      // Upsert records
      for (const rec of records) {
        if (rec && rec.date) {
          upsertRecord(userId, rec);
        }
      }

      // Upsert semesters
      for (const sem of semesters) {
        if (sem && sem.id) {
          upsertSemester(userId, sem);
        }
      }

      // Upsert settings
      if (settings) {
        upsertSettings(userId, settings, settings.updatedAt || Date.now());
      }

      // STRICT QUOTA ENFORCEMENT: Rollback and reject if user exceeds storage limit
      const currentUsage = getStorageUsage(userId);
      if (currentUsage.totalBytes > currentUsage.storageLimitBytes) {
        const error = new Error(`Cloud storage limit exceeded: ${(currentUsage.totalBytes / (1024 * 1024)).toFixed(1)} MB used, but your account limit is ${currentUsage.storageLimitMb} MB.`);
        error.code = 'QUOTA_EXCEEDED';
        error.storageUsage = currentUsage;
        throw error;
      }
    });

    const storageUsage = getStorageUsage(userId);
    res.json({
      success: true,
      syncedRecords: records.length,
      syncedSemesters: semesters.length,
      storageUsage
    });
  } catch (err) {
    console.error('Sync push error:', err);
    if (err.code === 'DELETED_ITEM_CONFLICT') return res.status(409).json({ error: err.message });
    if (err.code === 'QUOTA_EXCEEDED') {
      return res.status(413).json({ 
        error: err.message, 
        code: 'QUOTA_EXCEEDED', 
        storageUsage: err.storageUsage 
      });
    }
    res.status(500).json({ error: 'Failed to push sync data' });
  }
});

// Full initial migration for existing users migrating local history
router.post('/migrate', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const { records = [], semesters = [], settings = null } = req.body;

    runTransaction(() => {
      for (const rec of records) {
        if (rec && rec.date) {
          upsertRecord(userId, rec);
        }
      }

      for (const sem of semesters) {
        if (sem && sem.id) {
          upsertSemester(userId, sem);
        }
      }

      if (settings) {
        upsertSettings(userId, settings, settings.updatedAt || Date.now());
      }

      // STRICT QUOTA ENFORCEMENT for initial migration as well
      const currentUsage = getStorageUsage(userId);
      if (currentUsage.totalBytes > currentUsage.storageLimitBytes) {
        const error = new Error(`Cloud storage limit exceeded: ${(currentUsage.totalBytes / (1024 * 1024)).toFixed(1)} MB used, but your account limit is ${currentUsage.storageLimitMb} MB.`);
        error.code = 'QUOTA_EXCEEDED';
        error.storageUsage = currentUsage;
        throw error;
      }
    });

    const storageUsage = getStorageUsage(userId);
    res.json({
      success: true,
      migratedRecords: records.length,
      migratedSemesters: semesters.length,
      storageUsage
    });
  } catch (err) {
    console.error('Migration error:', err);
    if (err.code === 'DELETED_ITEM_CONFLICT') return res.status(409).json({ error: err.message });
    if (err.code === 'QUOTA_EXCEEDED') {
      return res.status(413).json({ 
        error: err.message, 
        code: 'QUOTA_EXCEEDED', 
        storageUsage: err.storageUsage 
      });
    }
    res.status(500).json({ error: 'Failed to migrate data to server' });
  }
});

export default router;
