import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, isTitleVariant } from '../src/core/normalize.js';

test('normalizeTitle folds case, punctuation and spacing', () => {
  assert.equal(normalizeTitle('Due Date'), 'due date');
  assert.equal(normalizeTitle('  Due   date  '), 'due date');
  assert.equal(normalizeTitle('Due-Date'), 'due date');
  assert.equal(normalizeTitle('Due_Date!'), 'due date');
});

test('normalizeTitle strips diacritics, including Turkish dotted capital I', () => {
  // Samet's users write Turkish board names. Without NFKD decomposition the
  // dotted capital I lowercases to "i" plus a combining dot and fails to match.
  assert.equal(normalizeTitle('İsim'), normalizeTitle('isim'));
  assert.equal(normalizeTitle('Görev'), 'gorev');
  assert.equal(normalizeTitle('SON TARİH'), normalizeTitle('son tarih'));
});

test('normalizeTitle handles missing and non-string input', () => {
  assert.equal(normalizeTitle(null), '');
  assert.equal(normalizeTitle(undefined), '');
  assert.equal(normalizeTitle(42), '42');
});

test('isTitleVariant is true only for cosmetic differences', () => {
  assert.equal(isTitleVariant('Due date', 'Due Date'), true);
  assert.equal(isTitleVariant('Owner', 'Owner '), true);
  assert.equal(isTitleVariant('Owner', 'Owner'), false, 'identical titles are not variants');
  assert.equal(isTitleVariant('Owner', 'Assignee'), false);
});
