import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBoards } from '../src/app/monday-source.js';

/** A fake SDK client: pages is an array of board arrays, one per page. */
const fakeSdk = (pages, calls = []) => ({
  api: async (_query, options) => {
    const page = options.variables.page;
    calls.push(page);
    return { data: { boards: pages[page - 1] ?? [] } };
  },
});

const rawBoards = (count, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    id: offset + i,
    name: `Board ${offset + i}`,
    columns: [{ id: 'c1', title: 'Owner', type: 'people' }],
  }));

test('a single short page is fetched in one request', async () => {
  const calls = [];
  const boards = await fetchBoards(fakeSdk([rawBoards(3)], calls));
  assert.equal(boards.length, 3);
  assert.deepEqual(calls, [1], 'a short page means there is no next page');
});

test('a full page triggers fetching the next one', async () => {
  const calls = [];
  const boards = await fetchBoards(fakeSdk([rawBoards(100), rawBoards(7, 100)], calls));
  assert.equal(boards.length, 107);
  assert.deepEqual(calls, [1, 2]);
});

test('an exactly-full final page stops at the following empty page', async () => {
  const calls = [];
  const boards = await fetchBoards(fakeSdk([rawBoards(100), []], calls));
  assert.equal(boards.length, 100);
  assert.deepEqual(calls, [1, 2]);
});

test('numeric ids are normalised to strings', async () => {
  // The API returns GraphQL ID, which serialises as a number on older versions.
  // Everything downstream compares with ===, so this matters.
  const [board] = await fetchBoards(fakeSdk([rawBoards(1)]));
  assert.equal(typeof board.id, 'string');
  assert.equal(typeof board.columns[0].id, 'string');
});

test('GraphQL errors are thrown, not silently read as an empty account', async () => {
  // The SDK resolves rather than rejects on GraphQL errors, so without this
  // check a failed query would look like a user with no boards.
  const failing = { api: async () => ({ errors: [{ message: 'Not authorized' }] }) };
  await assert.rejects(() => fetchBoards(failing), /Not authorized/);
});

test('missing names and columns get defaults instead of crashing', async () => {
  const sparse = { api: async () => ({ data: { boards: [{ id: 7 }] } }) };
  const [board] = await fetchBoards(sparse);
  assert.equal(board.name, '(untitled board)');
  assert.deepEqual(board.columns, []);
});

test('progress is reported with a running total after each page', async () => {
  const seen = [];
  await fetchBoards(fakeSdk([rawBoards(100), rawBoards(5, 100)]), (n) => seen.push(n));
  assert.deepEqual(seen, [100, 105]);
});

test('paging stops at the cap rather than looping forever', async () => {
  // A misconfigured account that always returns a full page must not hang.
  const calls = [];
  const always = {
    api: async (_q, o) => {
      calls.push(o.variables.page);
      return { data: { boards: rawBoards(100) } };
    },
  };
  const boards = await fetchBoards(always);
  assert.equal(calls.length, 50, 'MAX_PAGES caps the loop');
  assert.equal(boards.length, 5000);
});

test('a permission failure explains that monday blocks viewers', async () => {
  // FACT (developer.monday.com/api-reference/docs/basics): viewers, deactivated
  // users, unconfirmed emails and student accounts cannot access the API. A
  // viewer opening this board view would otherwise blame the app.
  const denied = { api: async () => ({ errors: [{ message: 'User unauthorized to perform action' }] }) };
  await assert.rejects(() => fetchBoards(denied), (error) => {
    assert.match(error.message, /User unauthorized to perform action/, 'the original message survives');
    assert.match(error.message, /viewers/i);
    assert.match(error.message, /admin or member/i);
    return true;
  });
});

test('a rate limit failure says to wait rather than showing raw jargon', async () => {
  const limited = { api: async () => ({ errors: [{ message: 'Complexity budget exhausted' }] }) };
  await assert.rejects(() => fetchBoards(limited), /Wait a minute/);
});

test('an unrecognised failure is passed through unchanged', async () => {
  // A wrong guess must degrade to the raw error, never hide it.
  const odd = { api: async () => ({ errors: [{ message: 'Something nobody predicted' }] }) };
  await assert.rejects(() => fetchBoards(odd), /^Error: Something nobody predicted$/);
});

test('a rejected call is explained the same way as a GraphQL error', async () => {
  const offline = { api: async () => { throw new Error('Failed to fetch'); } };
  await assert.rejects(() => fetchBoards(offline), /Failed to fetch/);
});
