import { Router } from 'express';
import { requireAuth } from './auth.js';
import {
  getRecords,
  upsertRecord,
  getSemesters,
  upsertSemester,
  getSettings,
  upsertSettings,
  getStorageUsage,
  runTransaction
} from '../db.js';

const router = Router();

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
    res.status(500).json({ error: 'Failed to migrate data to server' });
  }
});

export default router;
