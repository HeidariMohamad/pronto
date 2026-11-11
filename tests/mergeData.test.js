import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMerge, sameSourceSnapshot } from '../src/services/mergeData.js';

const record = (date, time, updatedAt = 1) => ({ date, entries: [{ type: 'entry', time }], note: '', updatedAt });

test('preserves unique records and asks about each conflicting day', () => {
  const device = { records: [record('2026-01-01', '08:00'), record('2026-01-02', '08:00')] };
  const cloud = { records: [record('2026-01-01', '09:00'), record('2026-01-03', '08:00')] };
  const backup = { records: [record('2026-01-01', '10:00'), record('2026-01-04', '08:00')] };
  const plan = prepareMerge(device, cloud, backup);
  assert.equal(plan.groups.length, 4);
  assert.equal(plan.conflicts.length, 1);
  assert.deepEqual(plan.conflicts[0].options.map(option => option.sources[0]), ['device', 'cloud', 'backup']);
});

test('identical content is not a conflict, even if timestamps differ', () => {
  const plan = prepareMerge({ records: [record('2026-01-01', '08:00', 1)] }, { records: [record('2026-01-01', '08:00', 2)] });
  assert.equal(plan.conflicts.length, 0);
  assert.deepEqual(plan.groups[0].options[0].sources, ['device', 'cloud']);
});

test('detects new, removed and changed data before applying a review', () => {
  const original = prepareMerge({ records: [record('2026-01-01', '08:00')] }, { records: [record('2026-01-01', '09:00', 2)] });
  assert.equal(sameSourceSnapshot(original, prepareMerge({ records: [record('2026-01-01', '08:00')] }, { records: [record('2026-01-01', '09:00', 2)] }), 'cloud'), true);
  assert.equal(sameSourceSnapshot(original, prepareMerge({}, { records: [record('2026-01-01', '09:00', 3)] }), 'cloud'), false);
  assert.equal(sameSourceSnapshot(original, prepareMerge({}, {}), 'device'), false);
});

test('rejects invalid backup records', () => {
  assert.throws(() => prepareMerge({}, {}, { records: [{ entries: [] }] }), /Invalid/);
});
