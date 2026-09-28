/**
 * The board view: every automation on the boards the user can see, in one
 * list, searchable and filterable.
 *
 * Plain DOM, no framework: the smaller the dependency list, the smaller the
 * surface monday's security review has to scan. Read-only: no mutations, no
 * storage, no calls to this app's own server. Names from monday are inserted
 * as text, never as HTML.
 *
 * The patterns — theme, viewer message, value-created event, demo mode outside
 * monday — are Automation Watchdog's, checked there inside monday on 26–28 Sep
 * 2026.
 */

import { buildInventory, searchInventory, filterInventory, boardsIn, SHOW_OPTIONS } from '../core/inventory.js';
import { formatDuration } from '../core/time.js';
import { APP_NAME } from '../core/brand.js';
import { fetchBoards, fetchAutomations, looksLikeMondayContext } from './monday-source.js';

const state = {
  phase: 'loading',
  source: null,
  sdk: null,
  viewOnly: false,
  valueReported: false,
  now: Date.now(),
  rows: [],
  counts: null,
  failedBoards: 0,
  query: '',
  show: 'all',
  board: '',
  status: '',
  error: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * monday's own theme, so the view matches the page around it.
 * FACT (`apps/docs/mondayget`, read 27 Sep 2026): context `theme` is "light",
 * "dark" or "black". Anything else leaves the operating system's preference.
 */
function applyTheme(theme) {
  if (['light', 'dark', 'black'].includes(theme)) document.documentElement.dataset.theme = theme;
}

/** The pill says the state; the row's edge turns amber when monday warns. */
function stateTone(row) {
  if (row.active === false) return 'off';
  if (row.active === true) return 'on';
  return 'unknown';
}

const tone = (row) => (row.notice ? 'warn' : stateTone(row));

function renderRow(row) {
  const label = row.active === false ? 'Off' : row.active ? 'On' : row.legacy ? 'Older' : 'Unknown';
  const section = el('section', `row ${tone(row)}`);
  const head = el('header', 'row-head');
  const pill = el('span', `pill ${stateTone(row)}`, label);
  pill.title = row.active === false
    ? 'Switched off in monday.'
    : row.active
      ? 'Switched on in monday.'
      : row.legacy
        ? 'Set up the older way; monday does not report whether it is on.'
        : 'monday did not say.';
  head.append(pill, el('h3', null, row.title));
  section.append(head);
  if (row.notice) section.append(el('p', 'reason', `monday says: ${row.notice}`));
  const changed = Date.parse(row.updatedAt ?? row.createdAt ?? '');
  const meta = [row.board];
  if (row.legacy) meta.push('older type of automation');
  if (Number.isFinite(changed)) meta.push(`last changed ${formatDuration(Math.max(0, state.now - changed))} ago`);
  section.append(el('p', 'meta', meta.join(' · ')));
  if (row.description) section.append(el('p', 'meta', row.description));
  return section;
}

function renderSummary() {
  const { counts } = state;
  const summary = el('div', 'summary');
  for (const [value, label, className] of [
    [counts.total, 'Automations', ''],
    [counts.off, 'Switched off', 'off'],
    [counts.withNotice, 'With a warning from monday', 'warn'],
    [counts.boards, 'Boards with automations', ''],
  ]) {
    const tile = el('div', `tile ${className}`);
    tile.append(el('div', 'tile-value', String(value)), el('div', 'tile-label', label));
    summary.append(tile);
  }
  return summary;
}

/**
 * The list, redrawn on its own as the search and filters change, so the search
 * box keeps its focus while typing.
 */
function renderList(app) {
  const list = el('div', 'rows');
  const draw = () => {
    const matches = searchInventory(filterInventory(state.rows, { show: state.show, board: state.board }), state.query);
    list.replaceChildren(...matches.map(renderRow));
    if (matches.length === 0) {
      list.append(el('p', 'status', state.rows.length === 0 ? 'monday listed no automations on the boards you can see.' : 'No automation matches.'));
    }
  };

  const filters = el('div', 'filters');
  const chips = SHOW_OPTIONS.map(([id, label]) => {
    const chip = el('button', `chip${state.show === id ? ' active' : ''}`, label);
    chip.type = 'button';
    chip.addEventListener('click', () => {
      state.show = id;
      for (const other of chips) other.classList.toggle('active', other === chip);
      draw();
    });
    return chip;
  });
  filters.append(...chips);

  const boards = boardsIn(state.rows);
  if (boards.length > 1) {
    const select = el('select', 'board');
    select.setAttribute('aria-label', 'Board');
    select.append(Object.assign(el('option', null, 'Every board'), { value: '' }));
    for (const name of boards) select.append(Object.assign(el('option', null, name), { value: name }));
    select.value = state.board;
    select.addEventListener('change', () => {
      state.board = select.value;
      draw();
    });
    filters.append(select);
  }

  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search by name, board or warning…';
  search.value = state.query;
  search.setAttribute('aria-label', 'Search automations');
  search.addEventListener('input', () => {
    state.query = search.value;
    draw();
  });

  draw();
  app.append(filters, search, list);
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
      el('span', null, 'It lists automations through monday\'s API, which viewer accounts cannot use. Ask an admin or a member of this account to open this view.'),
    );
    app.append(box);
    return;
  }

  $('source-note').textContent =
    state.source === 'monday'
      ? 'Listed by monday itself, board by board: on and off, older and newer kinds, including automations that have never run.'
      : state.source === 'demo'
        ? 'Demo data, invented — open this inside monday to list your own automations.'
        : '';

  if (state.error) {
    const box = el('div', 'error');
    box.append(el('strong', null, 'Could not list automations'), el('p', null, state.error));
    app.append(box);
    return;
  }
  if (state.phase === 'loading') {
    app.append(el('p', 'status', state.status || 'Loading…'));
    return;
  }

  app.append(renderSummary());
  if (state.failedBoards > 0) {
    app.append(
      el('p', 'warning', `${state.failedBoards} board${state.failedBoards === 1 ? '' : 's'} could not be read, so ${state.failedBoards === 1 ? 'its' : 'their'} automations are not listed.`),
    );
  }
  renderList(app);
  app.append(el('p', 'meta', 'To switch an automation on or off, open its board\'s Automations page in monday.'));
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

function show(automations, boards, now) {
  const { rows, counts } = buildInventory(automations, boards);
  Object.assign(state, { rows, counts, now });
}

async function loadDemo() {
  // Served at /fixtures/ by the server, which is where this resolves from
  // /view/main.js; Watchdog's demo link broke on exactly this until 28 Sep.
  const response = await fetch(new URL('../../fixtures/demo-automations.json', import.meta.url));
  if (!response.ok) throw new Error(`The demo data did not load (HTTP ${response.status}).`);
  const demo = await response.json();
  state.source = 'demo';
  show(demo.automations, demo.boards, Date.parse('2026-09-28T09:00:00Z'));
}

async function loadFromMonday() {
  const { default: mondaySdk } = await import('monday-sdk-js');
  const monday = mondaySdk();
  state.sdk = monday;

  // FACT (`apps/docs/mondayget`): the context carries `theme` and
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

  state.status = 'Finding boards…';
  render();
  const boards = await fetchBoards(monday, (n) => {
    state.status = `Found ${n} boards…`;
    render();
  });

  const { automations, failedBoards } = await fetchAutomations(
    monday,
    boards.map((board) => board.id),
    (found, read) => {
      state.status = `Read ${read} of ${boards.length} boards, ${found} automations so far…`;
      render();
    },
  );
  state.source = 'monday';
  state.failedBoards = failedBoards;
  show(automations, boards, Date.now());
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
