import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { db, upsertUser, upsertSemester, getSemesters, deleteSemester } = await import('../server/db.js');

test('identical semester IDs cannot overwrite another account, including legacy rows', () => {
  for (const id of ['user-a', 'user-b']) {
    upsertUser({ id, google_id: id, email: `${id}@example.com`, name: id, avatar_url: null });
  }
  const semester = (id, name) => ({ id, name, startDate: '2026-01-01', endDate: '2026-12-31', targets: [] });
  db.prepare('INSERT INTO semesters (id, user_id, name) VALUES (?, ?, ?)').run('1', 'user-a', 'Legacy A');
  upsertSemester('user-b', semester('1', 'B'));
  upsertSemester('user-b', semester('1', 'B updated'));
  assert.equal(getSemesters('user-a')[0].name, 'Legacy A');
  assert.deepEqual(getSemesters('user-b').map(s => [s.id, s.name]), [['1', 'B updated']]);
  deleteSemester('user-b', '1');
  assert.equal(getSemesters('user-b').length, 0);
  assert.equal(getSemesters('user-a')[0].name, 'Legacy A');
});
