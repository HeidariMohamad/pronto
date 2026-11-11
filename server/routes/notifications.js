import { Router } from 'express';
import { requireAuth } from './auth.js';
import { getUserNotifications, dismissNotification } from '../db.js';

const router = Router();

// Get active notifications for current user (including broadcasts)
router.get('/', requireAuth, (req, res) => {
  try {
    const list = getUserNotifications(req.user.id);
    const unreadCount = list.filter(n => !n.isRead).length;
    res.json({ notifications: list, unreadCount });
  } catch (err) {
    console.error('Fetch user notifications error:', err);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// Dismiss / mark notification as read
router.post('/:id/dismiss', requireAuth, (req, res) => {
  try {
    dismissNotification(req.params.id, req.user.id);
    res.json({ success: true, notificationId: req.params.id });
  } catch (err) {
    console.error('Dismiss notification error:', err);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

export default router;
