import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  db, 
  upsertUser, 
  banUser, 
  getUserById, 
  createNotification, 
  getUserNotifications, 
  dismissNotification, 
  getAllNotifications, 
  deleteNotification 
} from '../server/db.js';

test('admin ban and unban workflow', () => {
  const testUser = upsertUser({
    id: 'usr_test_ban_1',
    google_id: 'gid_test_ban_1',
    email: 'banned_test@pronto.local',
    name: 'Banned Test User',
    avatar_url: ''
  });

  assert.equal(testUser.is_banned, 0);

  // Ban the user
  const banned = banUser('usr_test_ban_1', true, 'Violated terms of service');
  assert.equal(banned.is_banned, 1);
  assert.equal(banned.ban_reason, 'Violated terms of service');
  assert.ok(banned.banned_at > 0);

  // Check getUserById retrieves the ban status
  const fetched = getUserById('usr_test_ban_1');
  assert.equal(fetched.is_banned, 1);
  assert.equal(fetched.ban_reason, 'Violated terms of service');

  // Unban the user
  const unbanned = banUser('usr_test_ban_1', false);
  assert.equal(unbanned.is_banned, 0);
  assert.equal(unbanned.ban_reason, '');
});

test('admin notifications and user dismissal', () => {
  const u1 = 'usr_test_notif_1';
  const u2 = 'usr_test_notif_2';

  upsertUser({ id: u1, google_id: 'gid_n1', email: 'u1@pronto.local', name: 'User 1' });
  upsertUser({ id: u2, google_id: 'gid_n2', email: 'u2@pronto.local', name: 'User 2' });

  // Create broadcast notification
  const broadcast = createNotification({
    title: 'Scheduled Maintenance',
    message: 'Server will be upgraded tonight at 2 AM.',
    type: 'warning',
    createdBy: 'admin@pronto.local'
  });

  // Create direct message to u1
  const direct = createNotification({
    userId: u1,
    title: 'Storage Warning',
    message: 'Your cloud storage is almost full.',
    type: 'alert',
    createdBy: 'admin@pronto.local'
  });

  // User 1 sees both broadcast and direct message
  const u1Notifs = getUserNotifications(u1);
  assert.ok(u1Notifs.some(n => n.id === broadcast.id));
  assert.ok(u1Notifs.some(n => n.id === direct.id));

  // User 2 sees broadcast, but NOT direct message to u1
  const u2Notifs = getUserNotifications(u2);
  assert.ok(u2Notifs.some(n => n.id === broadcast.id));
  assert.ok(!u2Notifs.some(n => n.id === direct.id));

  // Dismissal: u1 dismisses broadcast
  dismissNotification(broadcast.id, u1);
  const u1Refetched = getUserNotifications(u1);
  const dismissedItem = u1Refetched.find(n => n.id === broadcast.id);
  assert.equal(dismissedItem.isRead, true);

  // u2 has not dismissed it yet
  const u2Refetched = getUserNotifications(u2);
  const u2Item = u2Refetched.find(n => n.id === broadcast.id);
  assert.equal(u2Item.isRead, false);

  // Admin listing & deletion
  const all = getAllNotifications();
  assert.ok(all.some(n => n.id === broadcast.id));

  deleteNotification(broadcast.id);
  deleteNotification(direct.id);

  const afterDelete = getAllNotifications();
  assert.ok(!afterDelete.some(n => n.id === broadcast.id));
});
