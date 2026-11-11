import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from '../server/node_modules/sharp/dist/index.mjs';
import express from '../server/node_modules/express/index.js';
import cookieParser from '../server/node_modules/cookie-parser/index.js';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'cloud-storage-test-secret';
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pronto-storage-test-'));
const uploadDir = path.join(testRoot, 'uploads');
fs.mkdirSync(uploadDir);
process.env.UPLOAD_DIR = uploadDir;
const { db, upsertUser, upsertRecord, upsertSettings, getSettings, getRecords, getDeletedItems, addFileRecord, embeddedPhotoKey: serverPhotoKey } = await import('../server/db.js');
const { embeddedPhotoKey: clientPhotoKey } = await import('../src/services/mergeData.js');
const { generateToken, requireAuth } = await import('../server/routes/auth.js');
const { default: storage, authorizeStoredUpload } = await import('../server/routes/storage.js');
const { default: sync } = await import('../server/routes/sync.js');
const { default: admin } = await import('../server/routes/admin.js');
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use('/api/storage', storage);
app.use('/api/sync', sync);
app.use('/api/admin', admin);
app.use('/uploads', requireAuth, authorizeStoredUpload, express.static(uploadDir));
const server = await new Promise(resolve => {
  const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
});
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(testRoot, { recursive: true, force: true });
});

for (const id of ['user-a', 'user-b']) upsertUser({ id, google_id: id, email: `${id}@example.com`, name: id, avatar_url: null });
upsertUser({ id: 'admin', google_id: 'admin', email: 'admin@example.com', name: 'Admin', avatar_url: null });
db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run('admin');
const token = id => generateToken({ id, email: `${id}@example.com`, is_admin: 0 });
async function request(id, route, body) {
  const response = await fetch(`${base}${route}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(id ? { Authorization: `Bearer ${token(id)}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, data: await response.json() };
}

test('inventory, deletion and explicit restore stay scoped to the signed-in account', async () => {
  const day = '2026-01-01';
  const record = { date: day, entries: [{ type: 'In', time: '08:00' }], note: '', updatedAt: 10 };
  upsertRecord('user-a', record);
  upsertRecord('user-b', { ...record, note: 'other account' });
  assert.equal((await request(null, '/api/storage')).status, 401);
  assert.equal((await request('user-a', '/api/storage')).data.records[0].note, '');
  assert.equal((await request('user-a', '/api/storage/delete', { collection: 'records', id: day, expectedUpdatedAt: 9 })).status, 409);
  const deleted = await request('user-a', '/api/storage/delete', { collection: 'records', id: day, expectedUpdatedAt: 10 });
  assert.equal(deleted.status, 200);
  assert.equal(getRecords('user-a').length, 0);
  assert.equal(getRecords('user-b')[0].note, 'other account');
  assert.throws(() => upsertRecord('user-a', record), /deleted from the cloud/);
  assert.equal((await request('user-a', '/api/sync/push', { records: [record] })).status, 409);
  assert.equal((await request('user-a', '/api/storage/restore', { collection: 'records', id: day, deletedAt: deleted.data.deletedAt + 1, value: record })).status, 409);
  assert.equal((await request('user-a', '/api/storage/restore', { collection: 'records', id: day, deletedAt: deleted.data.deletedAt, value: record })).status, 200);
  assert.equal(getRecords('user-a').length, 1);
  assert.equal(getDeletedItems('user-a').length, 0);
});

test('server optimizer previews and runs per user with admin-only persistent progress', async () => {
  const users = ['optimizer-a', 'optimizer-b'];
  const pixels = Buffer.alloc(700 * 700 * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 17 + Math.floor(i / 79)) % 256;
  const photo = await sharp(pixels, { raw: { width: 700, height: 700, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
  for (const user of users) {
    upsertUser({ id: user, google_id: user, email: `${user}@example.com`, name: user });
    upsertRecord(user, { date: '2026-08-01', entries: [{ id: 'p', photo: `data:image/jpeg;base64,${photo.toString('base64')}` }], note: '', updatedAt: 10 });
  }
  const endpoint = '/api/admin/optimizer';
  assert.equal((await request('user-a', endpoint, { mode: 'preview' })).status, 403);
  assert.equal((await request('admin', endpoint, { mode: 'preview' })).status, 202);
  assert.equal((await request('admin', endpoint, { mode: 'preview' })).status, 409);
  const waitJob = async () => {
    for (let i = 0; i < 200; i++) {
      const { data } = await request('admin', endpoint);
      if (data.job.status !== 'running') return data.job;
      await delay(20);
    }
    throw new Error('Optimizer did not finish');
  };
  const preview = await waitJob();
  assert.equal(preview.status, 'completed');
  assert.equal(preview.users.filter(item => users.includes(item.id)).length, 2);
  assert.ok(preview.users.find(item => item.id === users[0]).estimatedBytes > 0);
  assert.ok(getRecords(users[0])[0].entries[0].photo.startsWith('data:'));
  assert.equal((await request('admin', endpoint, { mode: 'optimize', userId: users[0] })).status, 202);
  const job = await waitJob();
  assert.equal(job.status, 'completed');
  assert.equal(job.processed, job.total);
  assert.equal(job.users.length, 1);
  assert.equal(job.users[0].optimized, 1);
  assert.ok(job.users[0].savedBytes > 0);
  assert.ok(job.users[0].afterBytes < job.users[0].beforeBytes);
  assert.ok(getRecords(users[0])[0].entries[0].photo.startsWith('/uploads/'));
  assert.ok(getRecords(users[1])[0].entries[0].photo.startsWith('data:'));
  const history = await request('admin', endpoint);
  assert.ok(history.data.users[users[0]].savedBytes > 0);
  assert.equal(history.data.users[users[0]].estimatedBytes, null);
  assert.ok(history.data.users[users[1]].estimatedBytes > 0);
  assert.equal((await request('admin', endpoint, { mode: 'optimize', userId: users[0] })).status, 202);
  const repeated = await waitJob();
  assert.equal(repeated.users[0].optimized, 0);
  assert.equal(repeated.users[0].savedBytes, 0);
});

test('admin optimization preserves originals and prevents old clients restoring large embedded photos', async () => {
  const original = 'data:image/jpeg;base64,' + Buffer.alloc(1000, 42).toString('base64');
  const webp = Buffer.from('5249464610000000574542505650382000000000', 'hex');
  const dataUrl = `data:image/webp;base64,${webp.toString('base64')}`;
  const record = { date: '2026-06-01', entries: [{ id: 'p1', time: '08:00', type: 'In', photo: original }], note: 'original', updatedAt: 10 };
  upsertRecord('user-a', record);
  const body = { kind: 'embedded', date: record.date, index: 0, expectedHash: createHash('sha256').update(original).digest('hex'), dataUrl };
  const endpoint = '/api/admin/users/user-a/optimize-photo';
  assert.equal((await request('user-b', endpoint, body)).status, 403);
  assert.equal((await request('admin', endpoint, { ...body, expectedHash: '0'.repeat(64) })).status, 409);
  const result = await request('admin', endpoint, body);
  assert.equal(result.status, 200);
  assert.equal(result.data.optimized, true);
  const optimized = getRecords('user-a').find(item => item.date === record.date).entries[0].photo;
  assert.ok(optimized.startsWith('/uploads/user-a/optimized_'));
  assert.equal((await request('admin', endpoint, body)).status, 409);
  const backups = fs.readdirSync(path.join(testRoot, 'photo-optimization-backups', 'user-a'));
  const backupDir = path.join(testRoot, 'photo-optimization-backups', 'user-a');
  assert.equal(fs.readFileSync(path.join(backupDir, backups.find(name => name.endsWith('.txt'))), 'utf8'), original);
  const metadata = JSON.parse(fs.readFileSync(path.join(backupDir, backups.find(name => name.endsWith('.json'))), 'utf8'));
  assert.equal(metadata.date, record.date);
  const syncResult = await request('user-a', '/api/sync/push', { records: [{ ...record, note: 'edited on old phone', updatedAt: 20 }] });
  assert.equal(syncResult.status, 200);
  const after = getRecords('user-a').find(item => item.date === record.date);
  assert.equal(after.note, 'edited on old phone');
  assert.equal(after.entries[0].photo, optimized);
  const pulled = await request('user-a', '/api/sync/pull');
  assert.equal(pulled.data.optimizedPhotos[0].url, optimized);
  // A new photo on the same entry must remain a real change, not be replaced by the alias.
  const replacement = 'data:image/png;base64,bmV3';
  const changed = { ...record, entries: [{ ...record.entries[0], photo: replacement }], updatedAt: 30 };
  assert.equal((await request('user-a', '/api/sync/push', { records: [changed] })).status, 200);
  assert.equal(getRecords('user-a').find(item => item.date === record.date).entries[0].photo, replacement);
});

test('admin optimization preserves uploaded file identity and its original bytes', async () => {
  const dir = path.join(uploadDir, 'user-a');
  fs.mkdirSync(dir, { recursive: true });
  const original = Buffer.concat([Buffer.from('524946461000000057454250', 'hex'), Buffer.alloc(500, 42)]);
  const smaller = Buffer.from('5249464610000000574542505650382000000000', 'hex');
  fs.writeFileSync(path.join(dir, 'large.webp'), original);
  addFileRecord('large-file', 'user-a', 'large.webp', 'large.webp', original.length);
  const body = { kind: 'file', fileId: 'large-file', expectedHash: createHash('sha256').update(original).digest('hex'), dataUrl: `data:image/webp;base64,${smaller.toString('base64')}` };
  const endpoint = '/api/admin/users/user-a/optimize-photo';
  assert.equal((await request('user-b', endpoint, body)).status, 403);
  assert.equal((await request('admin', '/api/admin/users/user-b/optimize-photo', body)).status, 404);
  assert.equal((await request('admin', endpoint, body)).data.optimized, true);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'large.webp')), smaller);
  assert.equal(db.prepare('SELECT size_bytes FROM files WHERE id = ?').get('large-file').size_bytes, smaller.length);
  const backups = fs.readdirSync(path.join(testRoot, 'photo-optimization-backups', 'user-a'));
  assert.ok(backups.filter(name => name.endsWith('.webp')).some(name => fs.readFileSync(path.join(testRoot, 'photo-optimization-backups', 'user-a', name)).equals(original)));
  assert.equal((await request('admin', endpoint, body)).status, 409);
  assert.equal((await request('user-a', '/api/storage/delete', { collection: 'photos', id: 'large-file' })).status, 200);
  assert.equal(fs.readdirSync(path.join(testRoot, 'photo-optimization-backups', 'user-a')).some(name => name.endsWith('.webp')), false);
});

test('admin photo previews require admin access and match the selected user', async () => {
  const dir = path.join(uploadDir, 'user-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'admin-preview.webp'), 'preview');
  addFileRecord('admin-preview', 'user-a', 'admin-preview.webp', 'preview.webp', 7);
  upsertRecord('user-a', { date: '2026-07-01', entries: [{ photo: 'data:image/png;base64,Zm9v' }], note: '', updatedAt: 100 });
  const get = (id, route) => fetch(`${base}${route}`, { headers: id ? { Authorization: `Bearer ${token(id)}` } : {} });
  const file = '/api/admin/users/user-a/photos/admin-preview';
  const embedded = '/api/admin/users/user-a/records/2026-07-01/photos/0';
  assert.equal((await get(null, file)).status, 401);
  assert.equal((await get('user-b', file)).status, 403);
  assert.equal((await get('user-b', embedded)).status, 403);
  assert.equal((await get('admin', '/api/admin/users/user-b/photos/admin-preview')).status, 404);
  const response = await get('admin', file);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(await response.text(), 'preview');
  const image = await get('admin', embedded);
  assert.equal(image.status, 200);
  assert.equal(await image.text(), 'foo');
  assert.equal((await get('admin', '/api/admin/users/user-b/records/2026-07-01/photos/0')).status, 404);
});

test('photo deletion cannot target another user and stale records cannot restore its URL', async () => {
  const user = 'user-a';
  const filename = 'photo.webp';
  const url = `/uploads/${user}/${filename}`;
  const dir = path.join(uploadDir, user);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), 'example');
  addFileRecord('file-a', user, filename, 'photo.webp', 7);
  const record = { date: '2026-01-02', entries: [{ type: 'In', time: '08:00', photo: url }], note: '', updatedAt: 100 };
  upsertRecord(user, record);
  const photoRequest = async id => fetch(`${base}${url}`, { headers: id ? { Authorization: `Bearer ${token(id)}` } : {} });
  assert.equal((await photoRequest(null)).status, 401);
  assert.equal((await photoRequest('user-b')).status, 403);
  const owned = await photoRequest(user);
  assert.equal(owned.status, 200);
  assert.match(owned.headers.get('cache-control'), /no-store/);
  const nginxAuth = async id => fetch(`${base}/api/storage/authorize-upload`, { headers: { Authorization: `Bearer ${token(id)}`, 'X-Original-URI': url } });
  assert.equal((await nginxAuth(user)).status, 204);
  assert.equal((await nginxAuth('user-b')).status, 403);
  assert.equal((await fetch(`${base}/api/storage/authorize-upload`, { headers: { Cookie: `pronto_session=${token(user)}`, 'X-Original-URI': url } })).status, 204);
  assert.equal((await fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token('user-b')}`, 'X-Original-URI': '/uploads/user-b/other.webp' } })).status, 403);
  assert.equal((await request('user-b', '/api/storage/delete', { collection: 'photos', id: 'file-a' })).status, 404);
  assert.equal(fs.existsSync(path.join(dir, filename)), true);
  const result = await request(user, '/api/storage/delete', { collection: 'photos', id: 'file-a' });
  assert.equal(result.status, 200);
  assert.equal(fs.existsSync(path.join(dir, filename)), false);
  assert.equal((await photoRequest(user)).status, 403);
  assert.equal(getRecords(user).find(r => r.date === record.date).entries[0].photo, null);
  upsertRecord(user, { ...record, updatedAt: Date.now() + 10000 });
  assert.equal(getRecords(user).find(r => r.date === record.date).entries[0].photo, null);
});

test('embedded backup photos can be viewed and deleted without deleting the day', async () => {
  const user = 'user-a';
  const record = { date: '2026-01-03', entries: [{ id: 'entry-1', type: 'In', time: '08:00', photo: 'data:image/png;base64,YWJj' }], note: 'keep this', updatedAt: 200 };
  upsertRecord(user, record);
  const inventory = await request(user, '/api/storage');
  const photo = inventory.data.embeddedPhotos.find(item => item.date === record.date);
  assert.ok(photo);
  assert.equal(await clientPhotoKey(record.date, record.entries[0], 0), serverPhotoKey(record.date, record.entries[0], 0));
  const preview = await fetch(`${base}${photo.url}`, { headers: { Authorization: `Bearer ${token(user)}` } });
  assert.equal(preview.status, 200);
  assert.equal(await preview.text(), 'abc');
  assert.equal((await request('user-b', '/api/storage/delete', { collection: 'embeddedPhotos', id: photo.id, photoKey: photo.photoKey, expectedUpdatedAt: photo.updatedAt })).status, 404);
  const result = await request(user, '/api/storage/delete', { collection: 'embeddedPhotos', id: photo.id, photoKey: photo.photoKey, expectedUpdatedAt: photo.updatedAt });
  assert.equal(result.status, 200);
  assert.equal(getRecords(user).find(item => item.date === record.date).note, 'keep this');
  assert.equal(getRecords(user).find(item => item.date === record.date).entries[0].photo, null);
  upsertRecord(user, { ...record, updatedAt: Date.now() + 10000 });
  assert.equal(getRecords(user).find(item => item.date === record.date).entries[0].photo, null);
  upsertRecord(user, { ...record, entries: [{ ...record.entries[0], photo: 'data:image/png;base64,ZGVm' }], updatedAt: Date.now() + 20000 });
  assert.equal(getRecords(user).find(item => item.date === record.date).entries[0].photo, 'data:image/png;base64,ZGVm');
});

test('suspended accounts cannot access the storage manager', async () => {
  db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run('user-b');
  assert.equal((await request('user-b', '/api/storage')).status, 403);
  db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run('user-b');
});

test('batch delete and mass cleanup endpoints work reliably', async () => {
  const user = 'user-a';
  // Insert sample records
  upsertRecord(user, { date: '2026-03-01', entries: [{ type: 'In', time: '08:00', photo: 'data:image/png;base64,Zm9v' }], note: 'day 1', updatedAt: 10 });
  upsertRecord(user, { date: '2026-03-02', entries: [{ type: 'In', time: '09:00', photo: 'data:image/png;base64,YmFy' }], note: 'day 2', updatedAt: 10 });
  
  // Test batch deleting selected records
  const batchRes = await request(user, '/api/storage/delete-batch', {
    items: [{ collection: 'records', id: '2026-03-01' }]
  });
  assert.equal(batchRes.status, 200);
  assert.equal(getRecords(user).some(r => r.date === '2026-03-01'), false);
  assert.equal(getRecords(user).some(r => r.date === '2026-03-02'), true);

  // Test mass deleting all photos
  const photoRes = await request(user, '/api/storage/delete-batch', { deleteAll: 'photos' });
  assert.equal(photoRes.status, 200);
  const remaining = getRecords(user).find(r => r.date === '2026-03-02');
  assert.equal(remaining.entries[0].photo, null);
  assert.equal(remaining.note, 'day 2'); // Hours & notes stay intact

  // Test wiping all cloud data
  upsertSettings(user, { language: 'en' }, Date.now());
  upsertSettings('user-b', { language: 'fa' }, Date.now());
  const allRes = await request(user, '/api/storage/delete-batch', { deleteAll: 'all' });
  assert.equal(allRes.status, 200);
  assert.equal(getRecords(user).length, 0);
  assert.equal(getSettings(user), null);
  assert.equal(allRes.data.storageUsage.totalBytes, 0);
  assert.equal(fs.existsSync(path.join(testRoot, 'photo-optimization-backups', user)), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM optimizer_processed_files WHERE user_id = ?').get(user).count, 0);
  assert.equal(getSettings('user-b').language, 'fa');
});

test('sync push strictly blocks uploads that exceed user storage quota', async () => {
  const user = 'user-a';
  // Set custom 1 MB storage limit
  db.prepare('UPDATE users SET storage_limit_mb = 1 WHERE id = ?').run(user);

  // Attempt to sync a record payload larger than 1 MB (e.g. 1.5 MB string)
  const hugePayload = {
    records: [{
      date: '2026-05-01',
      entries: [{ type: 'In', time: '08:00', photo: 'data:image/png;base64,' + 'A'.repeat(1500000) }],
      note: 'huge photo',
      updatedAt: 1
    }]
  };

  const pushRes = await request(user, '/api/sync/push', hugePayload);
  assert.equal(pushRes.status, 413);
  assert.equal(pushRes.data.code, 'QUOTA_EXCEEDED');

  // Verify the oversized record was rolled back and NOT saved
  assert.equal(getRecords(user).some(r => r.date === '2026-05-01'), false);

  // Reset limit
  db.prepare('UPDATE users SET storage_limit_mb = NULL WHERE id = ?').run(user);
});
