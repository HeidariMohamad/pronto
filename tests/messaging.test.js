import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const express = require('express');
const cookieParser = require('cookie-parser');
const { upsertUser, createNotification, dismissNotification, getUserNotifications } = await import('../server/db.js');
const { generateToken } = await import('../server/routes/auth.js');
const { default: adminRoutes } = await import('../server/routes/admin.js');
const { default: notificationRoutes } = await import('../server/routes/notifications.js');

test('user contact is private, authenticated, validated, and admins can reply and delete', async () => {
  const admin = upsertUser({ id: 'admin', google_id: 'admin-google', email: 'admin@example.com', name: 'Admin', is_admin: 1 });
  const user = upsertUser({ id: 'user', google_id: 'user-google', email: 'user@example.com', name: 'User' });
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, method = 'GET', body) => fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const userToken = generateToken(user);
  const adminToken = generateToken(admin);
  try {
    assert.equal((await request('/api/notifications/contact', null, 'POST', { message: 'Hello' })).status, 401);
    assert.equal((await request('/api/admin/messages', userToken)).status, 403);
    assert.equal((await request('/api/notifications/contact', userToken, 'POST', { message: '   ' })).status, 400);
    assert.equal((await request('/api/notifications/contact', userToken, 'POST', { message: 'x'.repeat(4001) })).status, 400);
    assert.equal((await request('/api/notifications/contact', userToken, 'POST', { message: '  Please help  ', userId: 'admin' })).status, 201);
    const { messages } = await (await request('/api/admin/messages', adminToken)).json();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].userId, user.id);
    assert.equal(messages[0].message, 'Please help');
    assert.equal((await request(`/api/admin/messages/${messages[0].id}`, userToken, 'DELETE')).status, 403);
    assert.equal((await request('/api/admin/notifications', adminToken, 'POST', { userId: user.id, title: 'Reply', message: 'Here is help' })).status, 200);
    assert.ok(getUserNotifications(user.id).some(n => n.message === 'Here is help'));
    assert.equal((await request(`/api/admin/messages/${messages[0].id}`, adminToken, 'DELETE')).status, 200);
    assert.deepEqual((await (await request('/api/admin/messages', adminToken)).json()).messages, []);
    const notification = createNotification({ title: 'Recall', message: 'Delete me' });
    dismissNotification(notification.id, user.id);
    assert.equal((await request(`/api/admin/notifications/${notification.id}`, adminToken, 'DELETE')).status, 200);
    assert.ok(!getUserNotifications(user.id).some(n => n.id === notification.id));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
