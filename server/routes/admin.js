import { Router } from 'express';
import { requireAdmin } from './auth.js';
import { 
  getAllUsersStats, 
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
