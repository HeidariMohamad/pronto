import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const source = (await readFile(new URL('../src/services/sync.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\s*$/gm, '')
  .replace(/export (async )?function /g, (_, asyncKeyword) => `${asyncKeyword || ''}function `);

function makeSync({ online = true, token = 'token', failSecond = false, onPost = null } = {}) {
  let pending = [
    { id: 1, collection: 'records', docId: 'a' },
    { id: 2, collection: 'records', docId: 'b' }
  ];
  const records = new Map([
    ['a', { date: 'a', note: 'a'.repeat(5 * 1024 * 1024) }],
    ['b', { date: 'b', note: 'b'.repeat(5 * 1024 * 1024) }]
  ]);
  const db = {
    pending_sync: {
      toArray: async () => [...pending],
      bulkDelete: async ids => { pending = pending.filter(item => !ids.includes(item.id)); }
    },
    records: { get: async id => records.get(id) },
    semesters: { get: async () => null },
    settings: { get: async () => null }
  };
  let calls = 0;
  const api = { post: async () => {
    calls++;
    if (onPost) await onPost(calls);
    if (failSecond && calls === 2) throw new Error('network failure');
    return { success: true };
  } };
  const sync = new Function('db', 'api', 'navigator', 'localStorage', 'Blob', 'console', `${source}\nreturn { triggerSync, pauseSync, resumeSync };`)(
    db, api, { onLine: online }, { getItem: () => token }, Blob, { error() {}, warn() {} }
  );
  return { sync, getPending: () => pending, getCalls: () => calls };
}

test('offline and signed-out sync do not report success', async () => {
  await assert.rejects(makeSync({ online: false }).sync.triggerSync(), /internet/);
  await assert.rejects(makeSync({ token: null }).sync.triggerSync(), /Sign in/);
});

test('conflict review pauses automatic sync at a batch boundary', async () => {
  let release;
  let started;
  const gate = new Promise(resolve => { release = resolve; });
  const firstStarted = new Promise(resolve => { started = resolve; });
  const { sync, getPending, getCalls } = makeSync({ onPost: async count => {
    if (count === 1) { started(); await gate; }
  } });
  const running = sync.triggerSync();
  await firstStarted;
  const paused = sync.pauseSync();
  release();
  await running;
  await paused;
  assert.deepEqual(getPending().map(item => item.id), [2]);
  assert.equal((await sync.triggerSync()).paused, true);
  assert.equal(getCalls(), 1);
  sync.resumeSync();
  await sync.triggerSync();
  assert.equal(getPending().length, 0);
});

test('large records are batched and failed batches remain queued', async () => {
  const { sync, getPending, getCalls } = makeSync({ failSecond: true });
  await assert.rejects(sync.triggerSync(), /network failure/);
  assert.equal(getCalls(), 2);
  assert.deepEqual(getPending().map(item => item.id), [2]);
  await sync.triggerSync();
  assert.equal(getPending().length, 0);
});

test('migration reuses an optimized server photo before re-encoding and preserves source hashes', async () => {
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1200);
  const original = { date: '2026-01-01', entries: [{ id: 'entry', time: '08:00', type: 'In', photo }], updatedAt: 10 };
  let local = structuredClone(original);
  const writes = [];
  const db = {
    records: { toArray: async () => [structuredClone(local)], get: async () => structuredClone(local), put: async value => { local = value; } },
    semesters: { toArray: async () => [] }, settings: { get: async () => ({ id: 'v8' }) },
    pending_sync: { toCollection: () => ({ primaryKeys: async () => [] }), bulkDelete: async () => {} },
    transaction: async (...args) => args.at(-1)()
  };
  const hash = createHash('sha256').update(photo).digest('hex');
  const url = '/uploads/user/optimized.webp';
  const api = {
    get: async () => ({ optimizedPhotos: [{ date: original.date, identity: 'id-entry', hash, url }], deletedItems: [] }),
    post: async (route, payload) => { writes.push(payload); return { success: true }; }
  };
  const optimizeImage = async () => { throw new Error('Already optimized photos should not be re-encoded'); };
  const sync = new Function('db', 'api', 'navigator', 'localStorage', 'Blob', 'console', 'optimizeImage', `${source}\nreturn { migrateLocalHistory };`)(db, api, { onLine: true }, { getItem: () => 'token' }, Blob, console, optimizeImage);
  await sync.migrateLocalHistory();
  assert.equal(writes[0].records[0].entries[0].photo, url);
  assert.equal(writes[0].records[0].originalPhotoHashes['id-entry'], hash);
  assert.equal(local.entries[0].photo, url);
  assert.equal(local.originalPhotoHashes, undefined);
});
