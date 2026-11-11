import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMerge, sameSourceSnapshot, embeddedPhotoKey } from '../src/services/mergeData.js';

const record = (date, time, updatedAt = 1) => ({ date, entries: [{ type: 'entry', time }], note: '', updatedAt });

test('preserves unique records and asks about each conflicting day', async () => {
  const device = { records: [record('2026-01-01', '08:00'), record('2026-01-02', '08:00')] };
  const cloud = { records: [record('2026-01-01', '09:00'), record('2026-01-03', '08:00')] };
  const backup = { records: [record('2026-01-01', '10:00'), record('2026-01-04', '08:00')] };
  const plan = await prepareMerge(device, cloud, backup);
  assert.equal(plan.groups.length, 4);
  assert.equal(plan.conflicts.length, 1);
  assert.deepEqual(plan.conflicts[0].options.map(option => option.sources[0]), ['device', 'cloud', 'backup']);
});

test('identical content is not a conflict, even if timestamps differ', async () => {
  const plan = await prepareMerge({ records: [record('2026-01-01', '08:00', 1)] }, { records: [record('2026-01-01', '08:00', 2)] });
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.groups[0].options[0].sources, ['device', 'cloud']);
});

test('detects new, removed and changed data before applying a review', async () => {
  const original = await prepareMerge({ records: [record('2026-01-01', '08:00')] }, { records: [record('2026-01-01', '09:00', 2)] });
  assert.equal(sameSourceSnapshot(original, await prepareMerge({ records: [record('2026-01-01', '08:00')] }, { records: [record('2026-01-01', '09:00', 2)] }), 'cloud'), true);
  assert.equal(sameSourceSnapshot(original, await prepareMerge({}, { records: [record('2026-01-01', '09:00', 3)] }), 'cloud'), false);
  assert.equal(sameSourceSnapshot(original, await prepareMerge({}, {}), 'device'), false);
});

test('rejects invalid backup records', async () => {
  await assert.rejects(prepareMerge({}, {}, { records: [{ entries: [] }] }), /Invalid/);
});

test('a cloud deletion is reviewed rather than silently restored by a stale device', async () => {
  const device = { records: [record('2026-01-01', '08:00')] };
  const cloud = { deletedItems: [{ collection: 'records', id: '2026-01-01', deletedAt: 42 }] };
  const plan = await prepareMerge(device, cloud);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].options.find(option => option.deleted).sources[0], 'cloud');
  assert.equal(sameSourceSnapshot(plan, await prepareMerge(device, cloud), 'cloud'), true);
  assert.equal(sameSourceSnapshot(plan, await prepareMerge(device, { deletedItems: [] }), 'cloud'), false);
});

test('a deleted cloud photo cannot reappear through stale record data', async () => {
  const url = '/uploads/user/photo.webp';
  const device = { records: [{ date: '2026-01-01', entries: [{ time: '08:00', photo: url }] }] };
  const cloud = { deletedItems: [{ collection: 'photos', id: url, deletedAt: 42 }] };
  const plan = await prepareMerge(device, cloud);
  assert.equal(plan.groups[0].options[0].value.entries[0].photo, null);
  assert.equal(device.records[0].entries[0].photo, url);
});

test('only the deleted embedded photo is removed from a stale backup', async () => {
  const date = '2026-01-02';
  const entry = { id: 'punch-1', photo: 'data:image/png;base64,YWJj' };
  const key = await embeddedPhotoKey(date, entry, 0);
  const device = { records: [{ date, entries: [entry] }, { date: '2026-01-03', entries: [entry] }] };
  const plan = await prepareMerge(device, { deletedItems: [{ collection: 'photos', id: key, deletedAt: 42 }] });
  assert.equal(plan.groups.find(group => group.key === date).options[0].value.entries[0].photo, null);
  assert.equal(plan.groups.find(group => group.key === '2026-01-03').options[0].value.entries[0].photo, entry.photo);
});

test('a photo deleted while a backup is being reviewed invalidates the cloud snapshot', async () => {
  const backup = { records: [{ date: '2026-01-01', entries: [{ photo: '/uploads/user/photo.webp' }] }] };
  const plan = await prepareMerge({}, {}, backup);
  const latest = await prepareMerge({}, { deletedItems: [{ collection: 'photos', id: '/uploads/user/photo.webp', deletedAt: 42 }] });
  assert.equal(sameSourceSnapshot(plan, latest, 'cloud'), false);
});
