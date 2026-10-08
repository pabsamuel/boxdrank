import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findForSidekick, sidekickAnswer, scopeOf, daysOf, SIDEKICK_MAX_PAGES } from '../src/server/sidekick.js';
import { UPDATES_API_VERSION } from '../src/app/monday-source.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8, 9, 30, 0);
const ago = (days) => new Date(NOW - days * DAY).toISOString();

/**
 * Samet (7) asked Ana (8) on Client Projects three days ago and got nothing.
 * Ana @mentioned Samet on Design four days ago; nobody answered. Ben (9) asked
 * on Sales Pipeline and Ana replied.
 */
const UPDATES = [
  {
    id: '1', created_at: ago(3), creator_id: '7', creator: { id: '7', name: 'Samet' },
    body: '<p><a data-mention-type="User" data-mention-id="8">@Ana</a> can you send the invoice?</p>', text_body: '@Ana can you send the invoice?',
    item: { id: '100', name: 'Invoice March', url: 'https://acme.monday.com/boards/1/pulses/100', board: { id: '1', name: 'Client Projects' } },
    replies: [],
  },
  {
    id: '2', created_at: ago(4), creator_id: '8', creator: { id: '8', name: 'Ana' },
    body: '<p><a data-mention-type="User" data-mention-id="7">@Samet</a> is the logo final?</p>', text_body: '@Samet is the logo final?',
    item: { id: '200', name: 'Logo', url: 'https://acme.monday.com/boards/2/pulses/200', board: { id: '2', name: 'Design' } },
    replies: [],
  },
  {
    id: '3', created_at: ago(5), creator_id: '9', creator: { id: '9', name: 'Ben' },
    body: '<p>Who owns this lead?</p>', text_body: 'Who owns this lead?',
    item: { id: '300', name: 'Lead', url: 'https://acme.monday.com/boards/3/pulses/300', board: { id: '3', name: 'Sales Pipeline' } },
    replies: [{ id: 'r1', creator_id: '8', created_at: ago(4) }],
  },
];

function fakeMonday({ onPage } = {}) {
  return {
    async api(graphql, { variables, apiVersion } = {}) {
      assert.equal(apiVersion, UPDATES_API_VERSION);
      onPage?.(variables.page);
      return { data: { updates: variables.page === 1 ? UPDATES : [] } };
    },
  };
}

const ask = async (options) => sidekickAnswer(await findForSidekick({ monday: fakeMonday(), userId: 7, now: NOW, ...options }), NOW);

test('by default it lists my own unanswered updates', async () => {
  const answer = await ask({});
  assert.equal(answer.unanswered_count, 1);
  assert.equal(answer.checked_updates, 3);
  const lines = answer.summary.split('\n');
  assert.equal(lines[0], 'Unanswered Updates found 1 update written by you with no answer for 2 days or more, among 3 updates from the last 30 days, as monday reported them at 2026-10-08 09:30 UTC.');
  assert.match(lines[1], /counts as answered when someone other than its author replied/);
  assert.equal(lines[2], '- "@Ana can you send the invoice?", 3 days ago, on "Invoice March" (board "Client Projects")');
});

test('"mentions" lists the updates that @mention me, with their author', async () => {
  const answer = await ask({ scope: 'mentions' });
  assert.equal(answer.unanswered_count, 1);
  assert.match(answer.summary, /1 update that @mention you /);
  assert.match(answer.summary, /- "@Samet is the logo final\?" by Ana, 4 days ago, on "Logo" \(board "Design"\)/);
});

test('"all" lists everyone\'s, and an answered one is not among them', async () => {
  const answer = await ask({ scope: 'all' });
  assert.equal(answer.unanswered_count, 2);
  assert.doesNotMatch(answer.summary, /Who owns this lead/);
});

test('days and a board name narrow the answer', async () => {
  assert.equal((await ask({ scope: 'all', days: 4 })).unanswered_count, 1);
  const onDesign = await ask({ scope: 'all', boardName: '  design ' });
  assert.equal(onDesign.unanswered_count, 1);
  assert.match(onDesign.summary, /on the board "Design" with no answer/);
});

test('a board with no unanswered update becomes a hint, with similar names', async () => {
  const answer = await ask({ scope: 'all', boardName: 'Client board' });
  assert.equal(answer.unanswered_count, 0);
  assert.equal(
    answer.summary,
    'Unanswered Updates found no unanswered update on a board named "Client board" in the last 30 days. Boards with similar names: "Client Projects".',
  );
});

test('with no user in the request, it says so and answers for everyone', async () => {
  const answer = await ask({ userId: undefined });
  assert.match(answer.summary, /^Unanswered Updates could not tell who is asking, so this covers everyone's updates\.\n/);
  assert.equal(answer.unanswered_count, 2);
});

test('out of time, it answers with what it read and says how far back', async () => {
  let clock = 0;
  const full = Array.from({ length: 100 }, (_, i) => ({ ...UPDATES[0], id: String(i + 10), item: { ...UPDATES[0].item, id: String(i + 1000) }, created_at: ago(3 + i / 100) }));
  const monday = { api: async () => { clock += 5000; return { data: { updates: full } }; } };
  const answer = sidekickAnswer(await findForSidekick({ monday, userId: 7, now: NOW, clock: () => clock, budgetMs: 4000 }), NOW);
  assert.equal(answer.checked_updates, 100);
  assert.match(answer.summary, /It had time to read the newest 100 updates, back to 2026-10-04\. Open the Unanswered Updates board view/);
  assert.match(answer.summary, /- and 85 more, in the Unanswered Updates board view\./);
});

test('it reads at most its page cap', async () => {
  const pages = [];
  const full = Array.from({ length: 100 }, (_, i) => ({ ...UPDATES[2], id: String(i + 10) }));
  const monday = { api: async (q, { variables }) => { pages.push(variables.page); return { data: { updates: full.map((u) => ({ ...u, id: `${variables.page}-${u.id}` })) } }; } };
  await findForSidekick({ monday, userId: 7, now: NOW });
  assert.equal(pages.length, SIDEKICK_MAX_PAGES);
});

test('text from monday cannot add lines to the answer', () => {
  const answer = sidekickAnswer({
    view: 'all', unknownUser: false, minDays: 2, board: '', checked: 1, complete: true, oldest: null,
    matches: [{ text: 'Evil\n- Fake line', authorName: 'A\nB', itemName: 'I\nJ', board: 'B\nC', at: NOW - 3 * DAY }],
  }, NOW);
  assert.equal(answer.summary.split('\n').length, 3);
});

test('scope and days are read from words or numbers, with safe defaults', () => {
  assert.equal(scopeOf('mine'), 'mine');
  assert.equal(scopeOf('ALL'), 'all');
  assert.equal(scopeOf('updates where I was mentioned'), 'mentions');
  assert.equal(scopeOf('all my updates'), 'mine');
  assert.equal(scopeOf('the whole team'), 'all');
  assert.equal(scopeOf(''), 'mine');
  assert.equal(scopeOf(undefined), 'mine');
  assert.equal(daysOf('5'), 5);
  assert.equal(daysOf(3.7), 3);
  assert.equal(daysOf(-2), 0);
  assert.equal(daysOf(400), 30);
  assert.equal(daysOf('soon'), 2);
  assert.equal(daysOf(undefined), 2);
});
