import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/services/sync.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\s*$/gm, '')
  .replace(/export (async )?function /g, (_, asyncKeyword) => `${asyncKeyword || ''}function `);

function makeSync({ online = true, token = 'token', failSecond = false } = {}) {
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
    if (failSecond && calls === 2) throw new Error('network failure');
    return { success: true };
  } };
  const sync = new Function('db', 'api', 'navigator', 'localStorage', 'Blob', 'console', `${source}\nreturn { triggerSync };`)(
    db, api, { onLine: online }, { getItem: () => token }, Blob, { error() {}, warn() {} }
  );
  return { sync, getPending: () => pending, getCalls: () => calls };
}

test('offline and signed-out sync do not report success', async () => {
  await assert.rejects(makeSync({ online: false }).sync.triggerSync(), /internet/);
  await assert.rejects(makeSync({ token: null }).sync.triggerSync(), /Sign in/);
});

test('large records are batched and failed batches remain queued', async () => {
  const { sync, getPending, getCalls } = makeSync({ failSecond: true });
  await assert.rejects(sync.triggerSync(), /network failure/);
  assert.equal(getCalls(), 2);
  assert.deepEqual(getPending().map(item => item.id), [2]);
  await sync.triggerSync();
  assert.equal(getPending().length, 0);
});
