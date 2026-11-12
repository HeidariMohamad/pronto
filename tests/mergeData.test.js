import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareMerge, sameSourceSnapshot, embeddedPhotoKey, selectMergeConflict } from '../src/services/mergeData.js';

const record = (date, time, updatedAt = 1) => ({ date, entries: [{ type: 'entry', time }], note: '', updatedAt });

test('backup restore merges unique days and keeps device settings despite cloud deletions', async () => {
  const device = { records: [record('2026-01-01', '08:00'), { date: '2026-01-02', entries: [], note: '' }], settings: { language: 'en' } };
  const cloud = { deletedItems: [{ collection: 'records', id: '2026-01-01', deletedAt: 5 }, { collection: 'records', id: '2026-01-02', deletedAt: 6 }] };
  const backup = { records: [record('2026-01-02', '09:00')], settings: { language: 'pt' } };
  const plan = await prepareMerge(device, cloud, backup);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.groups.find(g => g.key === '2026-01-01').defaultOption.sources[0], 'device');
  assert.equal(plan.groups.find(g => g.key === '2026-01-02').defaultOption.sources[0], 'backup');
  assert.equal(plan.groups.find(g => g.collection === 'settings').defaultOption.value.language, 'en');
  assert.equal(plan.groups.find(g => g.collection === 'settings').options.find(o => o.sources.includes('backup')).value.language, 'pt');
  const latest = await prepareMerge(device, cloud, null, { restoringBackup: true });
  assert.equal(sameSourceSnapshot(plan, latest, 'device'), true);
  assert.equal(sameSourceSnapshot(plan, latest, 'cloud'), true);
});

test('backup restore reports photos removed by cloud deletion rules', async () => {
  const url = '/uploads/user/deleted.webp';
  const backup = { records: [{ date: '2026-01-01', entries: [{ photo: url }] }] };
  const plan = await prepareMerge({}, { deletedItems: [{ collection: 'photos', id: url, deletedAt: 42 }] }, backup);
  const option = plan.groups[0].options[0];
  assert.equal(option.value.entries[0].photo, null);
  assert.equal(option.missingPhotos.backup, 1);
});

test('bulk choice resolves only remaining day conflicts with the chosen source', async () => {
  const device = { records: [record('1', '08:00'), record('2', '08:00'), record('3', '08:00')] };
  const backup = { records: [record('1', '09:00'), record('2', '09:00')] };
  const cloud = { records: [record('3', '10:00')] };
  const plan = await prepareMerge(device, cloud, backup);
  const selected = plan.conflicts[0].options.find(o => o.sources.includes('backup'));
  const result = selectMergeConflict(plan, 0, selected, {}, true);
  assert.equal(result.selections['records:2'].sources[0], 'backup');
  assert.equal(result.selections['records:3'], undefined);
  assert.equal(plan.conflicts[result.nextIndex].key, '3');
  const one = selectMergeConflict(plan, 0, selected, {}, false);
  assert.equal(one.nextIndex, 1);
});

test('bulk choice can select a shared version by its explicitly selected source', async () => {
  const device = { records: [record('1', '08:00'), record('2', '08:00')] };
  const backup = { records: [record('1', '08:00'), record('2', '09:00')] };
  const cloud = { records: [record('1', '10:00')] };
  const plan = await prepareMerge(device, cloud, backup);
  const shared = plan.conflicts[0].options.find(o => o.sources.includes('backup'));
  const result = selectMergeConflict(plan, 0, shared, {}, true, 'backup');
  assert.equal(result.selections['records:2'].sources[0], 'backup');
  assert.equal(result.nextIndex, -1);
});

test('optimized photos reconcile old device records without masking other edits', async () => {
  const photo = 'data:image/jpeg;base64,YWJj';
  const url = '/uploads/user/optimized.webp';
  const local = { date: '2026-01-01', entries: [{ id: '1', type: 'In', time: '08:00', photo }], note: '' };
  const saved = { ...local, entries: [{ ...local.entries[0], photo: url }] };
  const cloud = { records: [saved], optimizedPhotos: [{ date: local.date, identity: 'id-1', hash: createHash('sha256').update(photo).digest('hex'), url }] };
  const plan = await prepareMerge({ records: [local] }, cloud);
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.groups[0].options[0].sources, ['device', 'cloud']);
  const changed = await prepareMerge({ records: [{ ...local, note: 'new note' }] }, cloud);
  assert.equal(changed.conflicts.length, 1);
  const newPhoto = { ...local, entries: [{ ...local.entries[0], photo: 'data:image/jpeg;base64,ZGVm' }] };
  assert.equal((await prepareMerge({ records: [newPhoto] }, cloud)).conflicts.length, 1);
  const deletedCloud = { ...cloud, records: [{ ...saved, entries: [{ ...saved.entries[0], photo: null }] }], deletedItems: [{ collection: 'photos', id: url, deletedAt: 42 }] };
  const deleted = await prepareMerge({ records: [local] }, deletedCloud);
  assert.equal(deleted.conflicts.length, 0);
  assert.equal(deleted.groups[0].options[0].value.entries[0].photo, null);
});

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

test('large embedded photos use compact comparison signatures', async () => {
  const photo = `data:image/jpeg;base64,${'a'.repeat(2 * 1024 * 1024)}`;
  const item = { date: '2026-01-01', entries: [{ photo }] };
  const plan = await prepareMerge({ records: [item] }, { records: [item] }, { records: [item] });
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.groups[0].options[0].signature.length, 64);
  assert.deepEqual(plan.groups[0].options[0].sources, ['device', 'cloud', 'backup']);
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
