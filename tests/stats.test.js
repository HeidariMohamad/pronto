import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDailyStats, groupEntriesIntoSessions } from '../src/services/stats.js';

test('a planned exit stays with its entry before and after editing its time', () => {
  const entries = [
    { id: '1', type: 'Entrada 1', time: '14:00' },
    { id: '2', type: 'Saída 1', time: '09:00' }
  ];
  let sessions = groupEntriesIntoSessions(entries);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].inEntry.id, '1');
  assert.equal(sessions[0].outEntry.id, '2');
  assert.equal(sessions[0].durationMinutes, null);
  assert.equal(calculateDailyStats(entries, [480]).worked, 0);

  entries[1].time = '18:00';
  sessions = groupEntriesIntoSessions(entries);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].durationMinutes, 240);
  assert.equal(calculateDailyStats(entries, [480]).worked, 240);
});

test('paired shifts follow their edited start time without swapping exits', () => {
  const entries = [
    { id: '1', type: 'In 1', time: '14:00' },
    { id: '2', type: 'Out 1', time: '18:00' },
    { id: '3', type: 'In 2', time: '08:00' },
    { id: '4', type: 'Out 2', time: '12:00' }
  ];
  const result = groupEntriesIntoSessions(entries);
  assert.deepEqual(result.map(item => item.type), ['session', 'interval', 'session']);
  assert.equal(result[0].inEntry.id, '3');
  assert.equal(result[0].outEntry.id, '4');
  assert.equal(result[1].durationMinutes, 120);
  assert.equal(result[2].inEntry.id, '1');
  assert.equal(result[2].outEntry.id, '2');
  assert.equal(calculateDailyStats(entries, [480]).worked, 480);
});

test('an open shift and tolerance are calculated from the paired sessions', () => {
  const entries = [
    { id: '1', type: 'Entrada 1', time: '07:20' },
    { id: '2', type: 'Saída 1', time: '11:20' },
    { id: '3', type: 'Entrada 2', time: '18:00' }
  ];
  const stats = calculateDailyStats(entries, [480], 10);
  assert.equal(stats.worked, 250);
  assert.equal(stats.prediction, 1310);
  assert.equal(stats.isOpen, true);
});

test('daily tolerance is applied once across multiple completed shifts', () => {
  const entries = [
    { type: 'In 1', time: '07:00' }, { type: 'Out 1', time: '11:00' },
    { type: 'In 2', time: '18:00' }, { type: 'Out 2', time: '22:00' }
  ];
  const withTolerance = calculateDailyStats(entries, [240, 240], 10);
  assert.equal(withTolerance.worked, 490);
  assert.equal(withTolerance.balance, 10);
  assert.equal(calculateDailyStats(entries, [240, 240], 0).worked, 480);
});

test('exit predictions use the daily allowance only once', () => {
  const firstShift = [{ type: 'In 1', time: '07:00' }];
  assert.equal(calculateDailyStats(firstShift, [240, 240], 10).prediction, 650);
  assert.equal(calculateDailyStats(firstShift, [480], 10).prediction, 890);
  const secondShift = [...firstShift, { type: 'Out 1', time: '11:00' }, { type: 'In 2', time: '18:00' }];
  assert.equal(calculateDailyStats(secondShift, [240, 240], 10).prediction, 1310);
  assert.equal(calculateDailyStats([], [480], 10).worked, 0);
});
