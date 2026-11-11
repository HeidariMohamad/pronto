import { Router } from 'express';
import { requireAuth } from './auth.js';
import { getUserNotifications, dismissNotification, getUserById, createSupportMessage, countRecentSupportMessages } from '../db.js';

const router = Router();

// Middleware to block suspended accounts
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

// The sender is taken from the authenticated session, never from the request body.
router.post('/contact', (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 4000) return res.status(400).json({ error: 'Message must contain between 1 and 4000 characters.' });
  if (!getUserById(req.user.id)) return res.status(401).json({ error: 'Account not found.' });
  try {
    if (countRecentSupportMessages(req.user.id, Date.now() - 60 * 60 * 1000) >= 10) return res.status(429).json({ error: 'Too many messages. Please try again later.' });
    createSupportMessage(req.user.id, message);
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Contact message error:', err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

// Get active notifications for current user (including broadcasts)
router.get('/', (req, res) => {
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
router.post('/:id/dismiss', (req, res) => {
  try {
    dismissNotification(req.params.id, req.user.id);
    res.json({ success: true, notificationId: req.params.id });
  } catch (err) {
    console.error('Dismiss notification error:', err);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

export default router;

