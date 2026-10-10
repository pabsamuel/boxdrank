/**
 * The board view: item updates nobody has answered, across the boards the
 * user can see, in one list. "Mine" first: the updates I wrote that are still
 * waiting (SPEC.md).
 *
 * Plain DOM, no framework: the smaller the dependency list, the smaller the
 * surface monday's security review has to scan. Read-only: no mutations, no
 * storage beyond the welcome flag, no calls to this app's own server. Text
 * from monday is inserted as text, never as HTML.
 *
 * The patterns — theme, viewer message, welcome page, value-created event,
 * demo mode outside monday — are Automation Inventory's, checked inside
 * monday on 28 Sep 2026.
 */

import {
  findUnanswered,
  filterRows,
  countViews,
  boardsIn,
  authorsIn,
  userIdOf,
  VIEW_OPTIONS,
  AGE_OPTIONS,
  DEFAULT_DAYS,
  LOOKBACK_DAYS,
  normaliseUpdate,
} from '../core/unanswered.js';
import { formatDuration } from '../core/time.js';
import { APP_NAME } from '../core/brand.js';
import { fetchUpdates, looksLikeMondayContext } from './monday-source.js';

/** Set once the welcome page has been dismissed in this browser. */
const WELCOME_KEY = 'unanswered:welcomed:v1';

const state = {
  welcome: !hasSeenWelcome(),
  phase: 'loading',
  source: null,
  sdk: null,
  viewOnly: false,
  valueReported: false,
  now: Date.now(),
  userId: null,
  rows: [],
  checked: 0,
  skipped: 0,
  complete: true,
  oldest: null,
  view: 'mine',
  minDays: DEFAULT_DAYS,
  board: '',
  author: '',
  query: '',
  status: '',
  error: null,
};

const $ = (id) => document.getElementById(id);

function hasSeenWelcome() {
  try {
    return window.localStorage.getItem(WELCOME_KEY) !== null;
  } catch {
    // Storage blocked: showing the welcome page every time is the lesser harm.
    return false;
  }
}

function dismissWelcome() {
  try {
    window.localStorage.setItem(WELCOME_KEY, String(Date.now()));
  } catch {
    // Remembered for this page view only.
  }
  state.welcome = false;
  render();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A date as YYYY-MM-DD, from an ISO string or milliseconds. */
const day = (when) => new Date(when).toISOString().slice(0, 10);

/**
 * monday's own theme, so the view matches the page around it.
 * FACT (`apps/docs/mondayget`, read 27 Sep 2026): context `theme` is "light",
 * "dark" or "black". Anything else leaves the operating system's preference.
 */
function applyTheme(theme) {
  if (['light', 'dark', 'black'].includes(theme)) document.documentElement.dataset.theme = theme;
}

/** The older the wait, the warmer the edge. */
const tone = (ageMs) => (ageMs >= 7 * 86_400_000 ? 'old' : ageMs >= 3 * 86_400_000 ? 'warn' : 'new');

function linkButton(text, title, onClick) {
  const button = el('button', 'link', text);
  button.type = 'button';
  button.title = title;
  button.addEventListener('click', onClick);
  return button;
}

function renderRow(row) {
  const age = Math.max(0, state.now - row.at);
  const section = el('section', `row ${tone(age)}`);
  const head = el('header', 'row-head');
  const who = row.authorId === state.userId ? 'You' : row.authorName;
  head.append(el('span', `pill ${tone(age)}`, `${formatDuration(age)} without an answer`), el('span', 'who', who));
  section.append(head);
  section.append(el('p', 'text', row.text || '(no text)'));

  const meta = [row.itemName, row.board];
  if (row.mentions.length > 0) {
    const names = row.mentions.map((mention) => (mention.id === state.userId ? 'you' : mention.name || 'someone'));
    meta.push(`mentions ${names.join(', ')}`);
  }
  if (row.ownReplies > 0) meta.push(`${plural(row.ownReplies, 'follow-up')} by the author`);
  section.append(el('p', 'meta', meta.join(' · ')));

  if (state.sdk) {
    const actions = el('div', 'actions');
    // FACT (`apps/docs/mondayexecute.md`, updated 23 Oct 2025): `openItemCard`
    // takes `itemId` (Integer) and `kind` "updates" or "columns"; users "can
    // also create an update" from it.
    const itemId = Number(row.itemId);
    if (Number.isSafeInteger(itemId) && itemId > 0) {
      actions.append(
        linkButton('Reply ↗', "Opens the item's updates in monday, where you can answer.", () => {
          state.sdk.execute('openItemCard', { itemId, kind: 'updates' }).catch(() => {});
        }),
      );
    }
    if (row.itemUrl) {
      // FACT (`apps/docs/mondayexecute`): `openLinkInTab` "opens a link in a
      // new tab for views". The URL is monday's own, checked to be https on
      // monday.com (safeMondayUrl).
      actions.append(
        linkButton('Open item in a new tab ↗', 'Opens the item on its board in a new tab.', () => {
          state.sdk.execute('openLinkInTab', { url: row.itemUrl }).catch(() => {});
        }),
      );
    }
    section.append(actions);
  }
  return section;
}

function select(className, label, options, value, onChange) {
  const node = el('select', className);
  node.setAttribute('aria-label', label);
  for (const [optionValue, text] of options) node.append(Object.assign(el('option', null, text), { value: optionValue }));
  node.value = value;
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

/**
 * The list and its filters. The rows are redrawn on their own as the filters
 * change, so the search box keeps its focus while typing.
 */
function renderList(app) {
  const list = el('div', 'rows');
  const chips = [];
  let authorSelect = null;

  const draw = () => {
    const counts = countViews(state.rows, { userId: state.userId, minDays: state.minDays, now: state.now });
    for (const chip of chips) {
      chip.classList.toggle('active', chip.dataset.view === state.view);
      chip.textContent = `${chip.dataset.label} (${counts[chip.dataset.view]})`;
    }
    if (authorSelect) authorSelect.hidden = state.view === 'mine';

    const matches = filterRows(state.rows, {
      view: state.view,
      userId: state.userId,
      minDays: state.minDays,
      now: state.now,
      board: state.board,
      author: state.view === 'mine' ? '' : state.author,
      query: state.query,
    });
    list.replaceChildren(...matches.map(renderRow));
    if (matches.length === 0) list.append(el('p', 'status', emptyText()));
  };

  const filters = el('div', 'filters');
  for (const [view, label] of VIEW_OPTIONS) {
    const chip = el('button', 'chip', label);
    chip.type = 'button';
    chip.dataset.view = view;
    chip.dataset.label = label;
    chip.addEventListener('click', () => {
      state.view = view;
      draw();
    });
    chips.push(chip);
  }
  filters.append(...chips);

  const pickers = el('div', 'filters');
  pickers.append(
    select(
      'age',
      'No answer for',
      AGE_OPTIONS.map((days) => [String(days), days === 0 ? 'Any age' : `No answer for ${plural(days, 'day')} or more`]),
      String(state.minDays),
      (value) => {
        state.minDays = Number(value);
        draw();
      },
    ),
  );
  const boards = boardsIn(state.rows);
  if (boards.length > 1) {
    pickers.append(
      select('board', 'Board', [['', 'Every board'], ...boards.map((name) => [name, name])], state.board, (value) => {
        state.board = value;
        draw();
      }),
    );
  }
  const authors = authorsIn(state.rows);
  if (authors.length > 1) {
    authorSelect = select(
      'author',
      'Written by',
      [['', 'Anyone'], ...authors.map(({ id, name }) => [id, id === state.userId ? `${name} (you)` : name])],
      state.author,
      (value) => {
        state.author = value;
        draw();
      },
    );
    pickers.append(authorSelect);
  }

  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search the text, item, board or people…';
  search.value = state.query;
  search.setAttribute('aria-label', 'Search updates');
  search.addEventListener('input', () => {
    state.query = search.value;
    draw();
  });

  draw();
  app.append(filters, pickers, search, list);
}

function emptyText() {
  if (state.rows.length === 0) return `Every update of the last ${LOOKBACK_DAYS} days on the boards you can see has an answer.`;
  if (state.view !== 'all' && state.userId === null) return 'monday did not say who you are, so this view is empty. Choose All.';
  const waited = state.minDays === 0 ? 'is waiting for an answer' : `has waited ${plural(state.minDays, 'day')} or more`;
  if (state.view === 'mine') return `None of your updates ${waited}.`;
  if (state.view === 'mentions') return `No update that @mentions you ${waited}.`;
  return 'No update matches.';
}

/**
 * The first screen, once per browser: what the list is, and what it is not.
 * monday's review asks for onboarding (`apps/docs/product`). The updates load
 * behind it.
 */
function renderWelcome() {
  const box = el('section', 'welcome');
  box.append(
    el('h2', null, 'Updates nobody answered, in one list'),
    el(
      'p',
      null,
      'A question in an item\'s updates is easy to lose: nobody replies, and nothing reminds anyone. This view finds them on every board you can see.',
    ),
  );
  const steps = el('ol', 'steps');
  for (const text of [
    `It reads the updates of the last ${LOOKBACK_DAYS} days on every board you can see. It only reads: it never posts, changes or deletes anything.`,
    'An update counts as answered when someone other than its author replied to it, or posted a newer update on the same item.',
    'Mine shows your own updates still waiting for an answer. Mentioning me shows updates that @mention you. All shows everyone\'s.',
    'Click Reply to open the item\'s updates in monday and answer there.',
    'If your account uses sidekick, monday\'s AI assistant, you can also ask it, for example: "which of my updates got no answer?"',
  ]) {
    steps.append(el('li', null, text));
  }
  box.append(steps);
  const go = el('button', 'primary', 'Show unanswered updates');
  go.type = 'button';
  go.addEventListener('click', dismissWelcome);
  box.append(go);
  return box;
}

function render() {
  const app = $('app');
  app.replaceChildren();

  if (state.viewOnly) {
    // FACT (`apps/docs/product`): "viewers can't access the API, so your app
    // should display a relevant message".
    const box = el('div', 'notice-box');
    box.append(
      el('strong', null, `As a viewer, you can't use ${APP_NAME}`),
      el('span', null, 'It reads updates through monday\'s API, which viewer accounts cannot use. Ask an admin or a member of this account to open this view.'),
    );
    app.append(box);
    return;
  }

  // After the viewer check: a welcome promising a list a viewer then cannot
  // see would be worse than no welcome.
  if (state.welcome) {
    app.append(renderWelcome());
    return;
  }

  $('source-note').textContent =
    state.source === 'monday'
      ? `Read from monday just now: ${plural(state.checked, 'update')} written since ${day(state.now - LOOKBACK_DAYS * 86_400_000)} on the boards you can see.`
      : state.source === 'demo'
        ? 'Demo data, invented — open this inside monday to see your own updates.'
        : '';

  if (state.error) {
    const box = el('div', 'error');
    box.append(el('strong', null, 'Could not read updates'), el('p', null, state.error));
    app.append(box);
    return;
  }
  if (state.phase === 'loading') {
    app.append(el('p', 'status', state.status || 'Loading…'));
    return;
  }

  if (!state.complete) {
    app.append(
      el('p', 'warning', `Only the newest ${plural(state.checked, 'update')} were read${state.oldest ? `, back to ${day(state.oldest)}` : ''}. Older ones are not checked.`),
    );
  }
  renderList(app);
  if (state.skipped > 0) {
    app.append(el('p', 'meta', `${plural(state.skipped, 'update')} with no person as author, or not on an item, ${state.skipped === 1 ? 'is' : 'are'} left out.`));
  }
  reportValueCreated();
}

/**
 * Tells monday the user has seen what this view exists for: the list. Once per
 * load. FACT (`apps/docs/mondayexecute`): `valueCreatedForUser` takes no
 * parameters.
 */
function reportValueCreated() {
  if (state.source !== 'monday' || state.valueReported || !state.sdk) return;
  state.valueReported = true;
  state.sdk.execute('valueCreatedForUser').catch(() => {});
}

function show(updates, now) {
  const { rows, skipped } = findUnanswered(updates);
  Object.assign(state, { rows, skipped, checked: updates.length, now });
  // Without a user, Mine and Mentioning me would be empty for no visible reason.
  if (state.userId === null) state.view = 'all';
}

/**
 * One step of reading. Behind the welcome page the text is only kept for
 * later: redrawing the welcome page on every page read would replace its
 * button, and a click that lands during the swap is lost (found in Automation
 * Inventory, 28 Sep 2026).
 */
function showProgress(text) {
  state.status = text;
  if (!state.welcome) render();
}

async function loadDemo() {
  // Served at /fixtures/ by the server, which is where this resolves from
  // /view/main.js.
  const response = await fetch(new URL('../../fixtures/demo-updates.json', import.meta.url));
  if (!response.ok) throw new Error(`The demo data did not load (HTTP ${response.status}).`);
  const demo = await response.json();
  state.source = 'demo';
  state.userId = userIdOf(demo.userId);
  show(demo.updates.map(normaliseUpdate), Date.parse(demo.now));
}

async function loadFromMonday() {
  const { default: mondaySdk } = await import('monday-sdk-js');
  const monday = mondaySdk();
  state.sdk = monday;

  // FACT (`apps/docs/mondayget`): the context carries `theme`, `user.id` and
  // `user.isViewOnly`. A context that fails to load is not fatal; the API
  // calls below report their own errors.
  const context = (await monday.get('context').catch(() => null))?.data ?? {};
  applyTheme(context.theme);
  monday.listen('context', (event) => applyTheme(event?.data?.theme));
  if (context.user?.isViewOnly === true) {
    state.source = 'monday';
    state.viewOnly = true;
    return;
  }
  state.userId = userIdOf(context.user?.id);

  // Drawn once here, so the welcome page (or the progress) appears at once.
  state.status = 'Reading updates…';
  render();
  const now = Date.now();
  const read = await fetchUpdates(monday, {
    now,
    onProgress: (count, oldest) => showProgress(`Read ${plural(count, 'update')}${oldest ? `, back to ${day(oldest)}` : ''}…`),
  });
  state.source = 'monday';
  state.complete = read.complete;
  state.oldest = read.oldest;
  show(read.updates, now);
}

async function start() {
  try {
    if (looksLikeMondayContext()) await loadFromMonday();
    else await loadDemo();
    state.phase = 'ready';
  } catch (error) {
    // Falling back to demo data would disguise a real failure as a working app.
    state.error = error?.message ?? String(error);
  }
  render();
}

start();
