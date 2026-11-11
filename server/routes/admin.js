import { Router } from 'express';
import { requireAdmin } from './auth.js';
import { 
  getAllUsersStats, 
  getDefaultStorageLimitMb, 
  setDefaultStorageLimitMb, 
  setUserStorageLimitMb 
} from '../db.js';

const router = Router();

router.get('/metrics', requireAdmin, (req, res) => {
  try {
    const users = getAllUsersStats();
    const defaultLimitMb = getDefaultStorageLimitMb();

    const summary = users.reduce((acc, u) => {
      acc.totalUsers += 1;
      acc.totalRecords += u.recordsCount || 0;
      acc.totalFiles += u.filesCount || 0;
      acc.totalDbBytes += u.dbBytes || 0;
      acc.totalFilesBytes += u.filesBytes || 0;
      acc.totalBytes += u.totalBytes || 0;
      return acc;
    }, {
      totalUsers: 0,
      totalRecords: 0,
      totalFiles: 0,
      totalDbBytes: 0,
      totalFilesBytes: 0,
      totalBytes: 0
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

export default router;
