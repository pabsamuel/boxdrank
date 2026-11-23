import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMentions,
  normaliseUpdate,
  findUnanswered,
  filterRows,
  countViews,
  boardsIn,
  authorsIn,
  readWindow,
  userIdOf,
  textOf,
} from '../src/core/unanswered.js';
import { fetchUpdates, UPDATES_API_VERSION, PAGE_SIZE } from '../src/app/monday-source.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 8, 9, 0, 0);
const ago = (days) => new Date(NOW - days * DAY).toISOString();

const ME = '7';
const ANA = '8';
const BEN = '9';

const item = (id, board = { id: 1, name: 'Client Projects' }) => ({ id, name: `Item ${id}`, url: `https://acme.monday.com/boards/${board.id}/pulses/${id}`, board });

function raw({ id, author = ME, name, days = 3, itemId = 100, board, body = '<p>Question?</p>', text, replies = [] }) {
  return {
    id,
    body,
    text_body: text,
    created_at: ago(days),
    creator_id: author,
    creator: author ? { id: author, name: name ?? { 7: 'Me', 8: 'Ana', 9: 'Ben' }[author] } : null,
    item: itemId === null ? null : item(itemId, board),
    replies: replies.map(([by, d], i) => ({ id: `${id}-r${i}`, creator_id: by, created_at: ago(d) })),
  };
}

const rowsOf = (...raws) => findUnanswered(raws.map(normaliseUpdate)).rows;

// ---- mentions ----------------------------------------------------------------

test('a user mention is read from data-mention attributes or a /users/ link', () => {
  const html =
    '<p>Hi <a class="user_mention_editor router" href="https://acme.monday.com/users/8" data-mention-type="User" data-mention-id="8">@Ana Lima</a>, ' +
    'and <a href="https://acme.monday.com/users/9-ben">@Ben</a>?</p>';
  // The second link's path is not a bare id, so it is not taken as one.
  assert.deepEqual(parseMentions(html), [{ id: '8', name: 'Ana Lima' }]);
  assert.deepEqual(parseMentions("<a href='/users/9'>@Ben &amp; Co</a>"), [{ id: '9', name: 'Ben & Co' }]);
});

test('team and board mentions, plain links and repeats are not user mentions', () => {
  const html =
    '<a data-mention-type="Team" data-mention-id="5">@Design</a>' +
    '<a data-mention-type="Project" data-mention-id="6" href="https://acme.monday.com/boards/6">#Board</a>' +
    '<a href="https://example.com/users/12">a link</a>' +
    '<a data-mention-type="User" data-mention-id="8">@Ana</a><a data-mention-type="User" data-mention-id="8">@Ana</a>';
  // A /users/ link counts only on monday's own domain.
  assert.deepEqual(parseMentions(html).map((m) => m.id), ['8']);
  assert.deepEqual(parseMentions(null), []);
  assert.deepEqual(parseMentions('<a data-mention-type="User" data-mention-id="abc">@x</a>'), []);
});

test('a mention name cannot carry a line break', () => {
  const [mention] = parseMentions('<a data-mention-type="User" data-mention-id="8">@Ana\n- fake line</a>');
  assert.equal(mention.name, 'Ana - fake line');
});

// ---- normalising -------------------------------------------------------------

test('an update is normalised, its text flattened and its URL checked', () => {
  const update = normaliseUpdate({
    ...raw({ id: 1, text: 'Line one\nLine two' }),
    item: { id: 5, name: 'Bad\nname', url: 'javascript:alert(1)', board: { id: 2, name: 'Sales' } },
  });
  assert.equal(update.text, 'Line one Line two');
  assert.equal(update.itemName, 'Bad name');
  assert.equal(update.itemUrl, null);
  assert.equal(update.boardName, 'Sales');
  assert.equal(update.authorId, ME);
});

test('without text_body, the text comes from the HTML body', () => {
  assert.equal(normaliseUpdate(raw({ id: 1, body: '<p>Can you <b>check</b>&nbsp;this?</p>' })).text, 'Can you check this?');
  assert.equal(textOf('a<br/>b'), 'a b');
});

test('user ids are positive integers as strings, or null', () => {
  assert.equal(userIdOf(42), '42');
  assert.equal(userIdOf(' 42 '), '42');
  for (const value of [null, undefined, '', '0', '-1', 'abc', '4.2']) assert.equal(userIdOf(value), null, String(value));
});

// ---- what counts as answered -------------------------------------------------

test('an update with no reply is unanswered; a reply from someone else answers it', () => {
  const rows = rowsOf(
    raw({ id: 1, itemId: 101 }),
    raw({ id: 2, itemId: 102, replies: [[ANA, 2]] }),
  );
  assert.deepEqual(rows.map((r) => r.id), ['1']);
});

test("the author's own reply does not answer it", () => {
  const rows = rowsOf(raw({ id: 1, replies: [[ME, 1], [ME, 0.5]] }));
  assert.deepEqual(rows.map((r) => r.id), ['1']);
  assert.equal(rows[0].ownReplies, 2);
});

test('a newer update on the same item by someone else answers it; an older one does not', () => {
  const rows = rowsOf(
    raw({ id: 1, itemId: 100, days: 5 }),
    raw({ id: 2, itemId: 100, author: ANA, days: 4 }),
    raw({ id: 3, itemId: 200, author: ANA, days: 6 }),
    raw({ id: 4, itemId: 200, days: 3 }),
  );
  // 1 is answered by Ana's newer update 2. 3 by my newer 4. 2 and 4 are not.
  assert.deepEqual(rows.map((r) => r.id).sort(), ['2', '4']);
});

test('a newer update by the same author on the same item does not answer the older one', () => {
  assert.deepEqual(rowsOf(raw({ id: 1, days: 5 }), raw({ id: 2, days: 3 })).map((r) => r.id), ['2', '1']);
});

test('updates with no person as author, or not on an item, are left out and counted', () => {
  const { rows, skipped } = findUnanswered([
    normaliseUpdate(raw({ id: 1, author: null })),
    normaliseUpdate(raw({ id: 2, author: '-1' })),
    normaliseUpdate(raw({ id: 3, itemId: null })),
    normaliseUpdate(raw({ id: 4 })),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['4']);
  assert.equal(skipped, 3);
});

test('an update by nobody does not answer anything', () => {
  const rows = rowsOf(raw({ id: 1, days: 5 }), raw({ id: 2, author: null, days: 1 }));
  assert.deepEqual(rows.map((r) => r.id), ['1']);
});

test('rows come newest first', () => {
  const rows = rowsOf(raw({ id: 1, itemId: 1, days: 9 }), raw({ id: 2, itemId: 2, days: 3 }), raw({ id: 3, itemId: 3, days: 5 }));
  assert.deepEqual(rows.map((r) => r.id), ['2', '3', '1']);
});

// ---- views and filters -------------------------------------------------------

const mention = (id) => `<p><a data-mention-type="User" data-mention-id="${id}">@x</a> ?</p>`;
const sample = () => rowsOf(
  raw({ id: 1, itemId: 1, days: 3, body: mention(ANA), text: 'Ana, can you send the invoice?' }),
  raw({ id: 2, itemId: 2, author: ANA, days: 4, body: mention(ME), text: 'Is the logo final?', board: { id: 2, name: 'Design' } }),
  raw({ id: 3, itemId: 3, author: BEN, days: 10, text: 'Who owns this?' }),
  raw({ id: 4, itemId: 4, days: 1, text: 'Too new to count' }),
);

test('Mine is my updates; Mentioning me is updates that @mention me; All is everyone', () => {
  const rows = sample();
  const ids = (view) => filterRows(rows, { view, userId: ME, minDays: 2, now: NOW }).map((r) => r.id);
  assert.deepEqual(ids('mine'), ['1']);
  assert.deepEqual(ids('mentions'), ['2']);
  assert.deepEqual(ids('all'), ['1', '2', '3']);
  assert.deepEqual(countViews(rows, { userId: ME, minDays: 2, now: NOW }), { mine: 1, mentions: 1, all: 3 });
});

test('the age filter keeps updates at least N days old', () => {
  const rows = sample();
  assert.deepEqual(filterRows(rows, { view: 'all', userId: ME, minDays: 1, now: NOW }).map((r) => r.id), ['4', '1', '2', '3']);
  assert.deepEqual(filterRows(rows, { view: 'all', userId: ME, minDays: 7, now: NOW }).map((r) => r.id), ['3']);
});

test('with no user known, Mine and Mentioning me are empty rather than everyone', () => {
  const rows = sample();
  assert.equal(filterRows(rows, { view: 'mine', userId: null, now: NOW }).length, 0);
  assert.equal(filterRows(rows, { view: 'mentions', userId: null, now: NOW }).length, 0);
});

test('board, author and search narrow the list', () => {
  const rows = sample();
  const all = { view: 'all', userId: ME, minDays: 2, now: NOW };
  assert.deepEqual(filterRows(rows, { ...all, board: 'Design' }).map((r) => r.id), ['2']);
  assert.deepEqual(filterRows(rows, { ...all, author: BEN }).map((r) => r.id), ['3']);
  assert.deepEqual(filterRows(rows, { ...all, query: 'INVOICE ana' }).map((r) => r.id), ['1']);
  assert.deepEqual(filterRows(rows, { ...all, query: 'invoice logo' }).map((r) => r.id), []);
  assert.deepEqual(boardsIn(rows), ['Client Projects', 'Design']);
  assert.deepEqual(authorsIn(rows), [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: ME, name: 'Me' }]);
});

// ---- reading monday ----------------------------------------------------------

test('the read window is the last 30 days to tomorrow, as inclusive dates', () => {
  assert.deepEqual(readWindow(NOW), { from: '2026-09-08', to: '2026-10-09' });
  assert.deepEqual(readWindow(NOW, 7), { from: '2026-10-01', to: '2026-10-09' });
});

function pagedMonday(total, { onCall, errors } = {}) {
  const all = Array.from({ length: total }, (_, i) => raw({ id: i + 1, itemId: i + 1, days: i / 100 }));
  return {
    calls: [],
    async api(graphql, { variables, apiVersion } = {}) {
      this.calls.push({ variables, apiVersion });
      onCall?.(variables);
      if (errors) return { errors: [{ message: errors }] };
      assert.match(graphql, /updates\(limit: \$limit, page: \$page, from_date: \$from, to_date: \$to\)/);
      const start = (variables.page - 1) * variables.limit;
      return { data: { updates: all.slice(start, start + variables.limit) } };
    },
  };
}

test('updates are read page by page, with the pinned version, until a short page', async () => {
  const monday = pagedMonday(250);
  const progress = [];
  const result = await fetchUpdates(monday, { now: NOW, onProgress: (n) => progress.push(n) });
  assert.equal(result.updates.length, 250);
  assert.equal(result.pagesRead, 3);
  assert.equal(result.complete, true);
  assert.deepEqual(progress, [100, 200, 250]);
  assert.ok(monday.calls.every((c) => c.apiVersion === UPDATES_API_VERSION && c.variables.limit === PAGE_SIZE));
  assert.deepEqual(monday.calls[0].variables, { limit: 100, page: 1, from: '2026-09-08', to: '2026-10-09' });
});

test('a full last page means one more read, which comes back empty', async () => {
  const monday = pagedMonday(200);
  const result = await fetchUpdates(monday, { now: NOW });
  assert.equal(result.pagesRead, 3);
  assert.equal(result.complete, true);
});

test('the page cap and the deadline stop the read, and it says it is incomplete', async () => {
  const capped = await fetchUpdates(pagedMonday(1000), { now: NOW, maxPages: 2 });
  assert.equal(capped.updates.length, 200);
  assert.equal(capped.complete, false);
  assert.ok(capped.oldest);

  let pages = 0;
  const stopped = await fetchUpdates(pagedMonday(1000, { onCall: () => { pages += 1; } }), { now: NOW, shouldStop: () => pages >= 1 });
  assert.equal(stopped.pagesRead, 1);
  assert.equal(stopped.complete, false);
});

test('a GraphQL error is thrown, not read as an account with no updates', async () => {
  await assert.rejects(fetchUpdates(pagedMonday(0, { errors: 'Not Authenticated' }), { now: NOW }), /Not Authenticated[\s\S]*viewers/);
  await assert.rejects(fetchUpdates(pagedMonday(0, { errors: 'Complexity budget exhausted' }), { now: NOW }), /Wait a minute/);
});
