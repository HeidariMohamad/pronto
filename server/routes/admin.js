import { Router } from 'express';
import { requireAdmin } from './auth.js';
import { 
  getAllUsersStats, 
  getDefaultStorageLimitMb, 
  setDefaultStorageLimitMb, 
  setUserStorageLimitMb,
  getUserById,
  banUser,
  createNotification,
  getAllNotifications,
  deleteNotification
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
      if (u.is_banned) acc.totalBanned += 1;
      return acc;
    }, {
      totalUsers: 0,
      totalBanned: 0,
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
