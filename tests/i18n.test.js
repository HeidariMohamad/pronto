import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPunchType, translations } from '../src/services/i18n.js';

test('Portuguese displays old English punches as Entrada and Saída', () => {
  assert.equal(formatPunchType('In 1', 'pt'), 'Entrada 1');
  assert.equal(formatPunchType('Out 1', 'pt'), 'Saída 1');
  assert.equal(formatPunchType('Entrance 2', 'pt'), 'Entrada 2');
  assert.equal(formatPunchType('Exit 2', 'pt'), 'Saída 2');
  assert.equal(formatPunchType('Saida 3', 'pt'), 'Saída 3');
});

test('punch labels follow the selected language without changing custom labels', () => {
  assert.equal(formatPunchType('Entrada 2', 'en'), 'In 2');
  assert.equal(formatPunchType('Saída 2', 'fa'), 'خروج 2');
  assert.equal(formatPunchType('Custom event', 'pt'), 'Custom event');
  assert.equal(formatPunchType(null, 'pt', 'Entrada'), 'Entrada');
});

test('requested Portuguese settings labels are present', () => {
  assert.equal(translations.pt.records_label, 'Registros');
  assert.equal(translations.pt.photos_label, 'Imagens');
  assert.equal(translations.pt.semesters_title, 'Jornadas');
  assert.equal(translations.pt.edit_label, 'Editar');
  assert.equal(translations.pt.add_new, '+ Novo');
});
