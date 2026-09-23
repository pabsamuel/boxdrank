import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveAccess, buildAccessMatrix, rank } from '../src/permissions.js';

const snapshot = JSON.parse(
  readFileSync(new URL('../fixtures/demo-account.json', import.meta.url), 'utf8'),
);

const user = (id) => snapshot.users.find((u) => u.id === id);
const board = (id) => snapshot.boards.find((b) => b.id === id);
const workspace = (id) => snapshot.workspaces.find((w) => w.id === id);
const access = (uid, bid) => {
  const b = board(bid);
  return deriveAccess(user(uid), b, workspace(b.workspaceId));
};

test('a deactivated user has no access even to boards they own', () => {
  // u8 owns b3 but the account is disabled — ownership must not resurrect access.
  assert.deepEqual(access('u8', 'b3'), { level: 'none', reason: 'account deactivated' });
});

test('an archived board grants nobody access', () => {
  assert.deepEqual(access('u5', 'b12'), { level: 'none', reason: 'board is archived' });
});

test('board owners get the strongest level', () => {
  assert.deepEqual(access('u1', 'b2'), { level: 'own', reason: 'board owner' });
});

test('admins reach boards they are not subscribed to', () => {
  assert.deepEqual(access('u2', 'b5'), { level: 'edit', reason: 'account admin' });
});

test('private boards stay private, even from admins', () => {
  // u4 is an account admin with no relationship to the hiring board.
  assert.deepEqual(access('u4', 'b8'), {
    level: 'none',
    reason: 'private board, admin not subscribed',
  });
});

test('an admin subscribed to a private board does get in', () => {
  assert.equal(access('u1', 'b8').level, 'edit');
});

test('an open workspace grants access to its main boards', () => {
  // u11 is not listed in any w2 membership; w2 being open is the whole path.
  assert.deepEqual(access('u11', 'b7'), { level: 'edit', reason: 'open workspace' });
});

test('a closed workspace keeps non-members out', () => {
  // u10 is a normal member but not in w1, and b6 is not shared with them.
  assert.deepEqual(access('u10', 'b6'), { level: 'none', reason: 'no path to this board' });
});

test('a closed workspace still admits its own members', () => {
  assert.deepEqual(access('u6', 'b6'), { level: 'edit', reason: 'workspace member' });
});

test('guests need the board shared with them explicitly', () => {
  const guest = user('u12');
  const shareBoard = board('b5');
  const notSubscribed = { ...shareBoard, owners: [], subscribers: [] };
  assert.deepEqual(deriveAccess(guest, notSubscribed, workspace('w1')), {
    level: 'none',
    reason: 'guest without explicit access',
  });
});

test('guests cannot be let in by a non-shareable board', () => {
  const guest = user('u12');
  const mainBoard = { ...board('b7'), subscribers: ['u12'] };
  assert.deepEqual(deriveAccess(guest, mainBoard, workspace('w2')), {
    level: 'none',
    reason: 'guest, board is not shareable',
  });
});

test('view-only guests get view, not edit', () => {
  assert.deepEqual(access('u13', 'b5'), { level: 'view', reason: 'guest, explicitly shared' });
});

test('levels are ordered', () => {
  assert.ok(rank('own') > rank('edit'));
  assert.ok(rank('edit') > rank('view'));
  assert.ok(rank('view') > rank('none'));
});

test('the matrix omits every non-grant', () => {
  const matrix = buildAccessMatrix(snapshot);
  assert.ok(matrix.length > 0);
  assert.ok(matrix.every((row) => row.level !== 'none'));
  // Nothing on an archived board should survive.
  assert.equal(matrix.filter((r) => r.boardId === 'b12').length, 0);
});

test('the matrix counts guest reach correctly', () => {
  const matrix = buildAccessMatrix(snapshot);
  const greg = matrix.filter((r) => r.userId === 'u12');
  assert.equal(greg.length, 6, 'Greg is shared into six client boards');
  assert.ok(greg.every((r) => r.reason === 'guest, explicitly shared'));
});
