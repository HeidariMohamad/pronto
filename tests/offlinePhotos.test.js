import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const source = (await readFile(new URL('../src/services/offlinePhotos.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\s*$/gm, '')
  .replace(/export (async )?function /g, (_, keyword) => `${keyword || ''}function `);

function setup(records, getImage) {
  const photos = new Map();
  const key = (userId, url) => `${userId}\n${url}`;
  const db = {
    records: {
      toArray: async () => records,
      bulkGet: async dates => dates.map(date => records.find(record => record.date === date)),
      get: async date => records.find(record => record.date === date),
      update: async (date, changes) => Object.assign(records.find(record => record.date === date), changes)
    },
    offline_photos: {
      where: () => ({ equals: userId => ({ toArray: async () => [...photos.values()].filter(item => item.userId === userId) }) }),
      put: async item => photos.set(key(item.userId, item.url), item),
      bulkDelete: async keys => { for (const [userId, url] of keys) photos.delete(key(userId, url)); }
    },
    transaction: async (...args) => args.at(-1)()
  };
  const liveQuery = query => ({ subscribe(observer) { let active = true; Promise.resolve().then(query).then(value => { if (active) observer.next(value); }); return { unsubscribe() { active = false; } }; } });
  const window = new EventTarget();
  window.location = { origin: 'https://pronto.example' };
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const navigator = { onLine: true };
  const service = new Function('liveQuery', 'db', 'api', 'window', 'document', 'navigator', `${source}\nreturn { startOfflinePhotoSync, subscribeOfflinePhotos, pruneOfflinePhotos, isOwnedPhotoUrl, cacheUploadedPhoto, stripSelectedPhotos };`)(liveQuery, db, { getImage }, window, document, navigator);
  return { service, photos, key, window, navigator, db };
}

test('deleting selected cloud photos preserves unrelated or newly edited local photos', () => {
  const { service } = setup([], async () => {});
  const entries = [
    { id: 'a', photo: '/uploads/user-a/a.webp' },
    { id: 'b', photo: '/uploads/user-a/b.webp' },
    { id: 'c', photo: 'newer-embedded-photo' }
  ];
  const matches = [{ date: '2026-01-01', identity: 'id-c', photo: 'previous-embedded-photo' }];
  const result = service.stripSelectedPhotos('2026-01-01', entries, new Set(['/uploads/user-a/a.webp']), matches);
  assert.equal(result[0].photo, null);
  assert.equal(result[1].photo, entries[1].photo);
  assert.equal(result[2].photo, 'newer-embedded-photo');
});

test('new uploaded photos keep a local blob and do not replace a newer photo', async () => {
  const originalPhoto = 'data:image/webp;base64,AAA';
  const url = '/uploads/user-a/new.webp';
  const record = { date: '2026-01-01', entries: [{ id: 'entry', photo: originalPhoto }], updatedAt: 1 };
  const { service, photos, key } = setup([record], async () => {});
  const blob = new Blob(['photo'], { type: 'image/webp' });
  assert.equal(await service.cacheUploadedPhoto({ date: record.date, id: 'entry', originalPhoto, url, blob, userId: 'user-a' }), true);
  assert.equal(record.entries[0].photo, url);
  assert.equal(await photos.get(key('user-a', url)).blob.text(), 'photo');
  record.entries[0].photo = 'newer-photo';
  assert.equal(await service.cacheUploadedPhoto({ date: record.date, id: 'entry', originalPhoto, url, blob, userId: 'user-a' }), false);
  assert.equal(record.entries[0].photo, 'newer-photo');
  await assert.rejects(service.cacheUploadedPhoto({ date: record.date, id: 'entry', originalPhoto, url: '/uploads/user-b/photo.webp', blob, userId: 'user-a' }), /owner/);
});

test('a device storage failure leaves the original photo in the record', async () => {
  const originalPhoto = 'data:image/webp;base64,AAA';
  const record = { date: '2026-01-01', entries: [{ id: 'entry', photo: originalPhoto }], updatedAt: 1 };
  const { service, db } = setup([record], async () => {});
  db.offline_photos.put = async () => { throw new Error('device storage full'); };
  await assert.rejects(service.cacheUploadedPhoto({ date: record.date, id: 'entry', originalPhoto, url: '/uploads/user-a/new.webp', blob: new Blob(['photo']), userId: 'user-a' }), /device storage full/);
  assert.equal(record.entries[0].photo, originalPhoto);
});

async function waitFor(condition) {
  for (let i = 0; i < 100; i++) { if (condition()) return; await delay(5); }
  throw new Error('Offline photo task did not finish');
}

test('downloads referenced photos for the signed-in account and retains them offline', async () => {
  const mine = '/uploads/user-a/photo.webp';
  const other = '/uploads/user-b/private.webp';
  const calls = [];
  const { service, photos, key, navigator } = setup([{ date: '2026-01-01', entries: [{ photo: mine }, { photo: other }, { photo: 'https://elsewhere.example/uploads/user-a/no.webp' }] }], async url => { calls.push(url); return new Blob(['image'], { type: 'image/webp' }); });
  let status;
  const unsubscribe = service.subscribeOfflinePhotos(value => { status = value; });
  const stop = service.startOfflinePhotoSync('user-a');
  await waitFor(() => status?.state === 'idle' && status.total === 1);
  assert.deepEqual(calls, [mine]);
  assert.equal(status.cached, 1);
  assert.equal(await photos.get(key('user-a', mine)).blob.text(), 'image');
  assert.equal(photos.has(key('user-b', other)), false);
  navigator.onLine = false;
  assert.equal(await photos.get(key('user-a', mine)).blob.text(), 'image');
  stop(); unsubscribe();
});

test('a photo deleted while downloading is not re-created in offline storage', async () => {
  const url = '/uploads/user-a/photo.webp';
  const records = [{ date: '2026-01-01', entries: [{ photo: url }] }];
  let finish;
  const { service, photos } = setup(records, () => new Promise(resolve => { finish = resolve; }));
  let status;
  const unsubscribe = service.subscribeOfflinePhotos(value => { status = value; });
  const stop = service.startOfflinePhotoSync('user-a');
  await waitFor(() => !!finish);
  records[0].entries = [];
  finish(new Blob(['image'], { type: 'image/webp' }));
  await waitFor(() => status?.state === 'idle');
  assert.equal(photos.size, 0);
  stop(); unsubscribe();
});

test('failed downloads are reported and unused copies are removed only for their account', async () => {
  const url = '/uploads/user-a/photo.webp';
  const { service, photos, key } = setup([{ date: '2026-01-01', entries: [{ photo: url }] }], async () => { throw new Error('offline'); });
  photos.set(key('user-a', '/uploads/user-a/old.webp'), { userId: 'user-a', url: '/uploads/user-a/old.webp' });
  photos.set(key('user-b', '/uploads/user-b/old.webp'), { userId: 'user-b', url: '/uploads/user-b/old.webp' });
  let status;
  const unsubscribe = service.subscribeOfflinePhotos(value => { status = value; });
  const stop = service.startOfflinePhotoSync('user-a');
  await waitFor(() => status?.state === 'error');
  assert.equal(status.cached, 0);
  assert.equal(status.failed, 1);
  await service.pruneOfflinePhotos('user-a');
  assert.equal(photos.has(key('user-a', '/uploads/user-a/old.webp')), false);
  assert.equal(photos.has(key('user-b', '/uploads/user-b/old.webp')), true);
  stop(); unsubscribe();
});
