/**
 * UI for the automation watchdog.
 *
 * Plain DOM, no framework: the smaller the dependency list, the smaller the
 * surface monday's security review has to scan.
 *
 * Read-only. One GraphQL query shape, no mutations, no storage.
 */

import { watch, summarize } from '../core/watch.js';
import { formatDuration } from '../core/cadence.js';
import { fetchBoards, fetchActivity, looksLikeMondayContext } from './monday-source.js';

/** How far back to read activity. Long enough for the engine to learn a rhythm. */
const HISTORY_DAYS = 60;

const STATUS_COPY = {
  silent: { label: 'Stopped', tone: 'silent' },
  late: { label: 'Overdue', tone: 'late' },
  dormant: { label: 'Switched off', tone: 'dormant' },
  healthy: { label: 'Running', tone: 'healthy' },
  insufficient_history: { label: 'Not enough history', tone: 'unknown' },
};

const state = {
  phase: 'loading',
  source: null,
  results: [],
  summary: null,
  unparsedTimestamps: 0,
  now: Date.now(),
  error: null,
  status: '',
};

const $ = (id) => document.getElementById(id);

/** Text-only insertion. Board and automation names are user data, never HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSummary() {
  const wrap = el('div', 'summary');
  for (const status of ['silent', 'late', 'dormant', 'healthy']) {
    const tile = el('div', `tile ${STATUS_COPY[status].tone}`);
    tile.append(
      el('div', 'tile-value', String(state.summary.counts[status] ?? 0)),
      el('div', 'tile-label', STATUS_COPY[status].label),
    );
    wrap.append(tile);
  }
  return wrap;
}

function renderRow(result) {
  const copy = STATUS_COPY[result.status] ?? { label: result.status, tone: 'unknown' };
  const row = el('section', `row ${copy.tone}`);

  const head = el('header', 'row-head');
  head.append(el('span', `pill ${copy.tone}`, copy.label));
  head.append(el('h3', null, result.label));
  row.append(head);

  row.append(el('p', 'reason', result.reason));

  if (result.lastFiredAt) {
    const meta = `Last activity ${formatDuration(state.now - result.lastFiredAt)} ago · ${result.timestamps.length} events observed`;
    row.append(el('p', 'meta', meta));
  }
  return row;
}

function render() {
  const app = $('app');
  app.replaceChildren();

  $('source-note').textContent =
    state.source === 'monday'
      ? `Reading the last ${HISTORY_DAYS} days of activity from monday.com`
      : state.source === 'demo'
        ? 'Demo data — open this inside monday to watch real automations'
        : '';

  if (state.error) {
    const box = el('div', 'error');
    box.append(el('strong', null, 'Could not read activity'), el('p', null, state.error));
    app.append(box);
    return;
  }

  if (state.phase === 'loading') {
    app.append(el('p', 'status', state.status || 'Loading…'));
    return;
  }

  if (state.results.length === 0) {
    app.append(
      el(
        'p',
        'status',
        `Nothing repeats often enough to watch yet. This needs a few weeks of history before it can tell a normal rhythm from a broken one — come back once your automations have been running a while.`,
      ),
    );
    return;
  }

  // The banner is the product. Everything else is context for it.
  const banner = el('div', `banner ${state.summary.shouldAlert ? 'alarm' : 'calm'}`);
  banner.append(
    el(
      'strong',
      null,
      state.summary.shouldAlert
        ? `${state.summary.counts.silent} automation${state.summary.counts.silent === 1 ? ' has' : 's have'} stopped`
        : 'Everything that should be running is running',
    ),
  );
  banner.append(
    el(
      'span',
      null,
      state.summary.shouldAlert
        ? 'monday does not send an alert when this happens. That is why this exists.'
        : `${state.summary.watched} recurring patterns watched.`,
    ),
  );
  app.append(banner);

  app.append(renderSummary());

  // Surfaced rather than hidden: a parsing problem and a quiet account must not
  // look the same, and a wrong timestamp would corrupt every interval.
  if (state.unparsedTimestamps > 0) {
    app.append(
      el(
        'p',
        'warning',
        `${state.unparsedTimestamps} activity entries had a timestamp this app could not read and were ignored. Results may be incomplete.`,
      ),
    );
  }

  const list = el('div', 'rows');
  for (const result of state.results) list.append(renderRow(result));
  app.append(list);
}

async function loadDemo() {
  const response = await fetch(new URL('../../fixtures/demo-activity.json', import.meta.url));
  const demo = await response.json();
  state.source = 'demo';
  state.now = demo.now;
  state.results = watch(demo.entries, demo.now, {
    actorNames: new Map(demo.actors.map((a) => [a.id, a.name])),
    boardNames: new Map(demo.boards.map((b) => [b.id, b.name])),
  });
  state.summary = summarize(state.results);
}

async function loadFromMonday() {
  const { default: mondaySdk } = await import('monday-sdk-js');
  const monday = mondaySdk();

  state.status = 'Finding boards…';
  render();
  const boards = await fetchBoards(monday, (n) => {
    state.status = `Found ${n} boards…`;
    render();
  });

  const now = Date.now();
  state.status = `Reading ${HISTORY_DAYS} days of activity across ${boards.length} boards…`;
  render();

  const { entries, unparsedTimestamps } = await fetchActivity(
    monday,
    boards.map((board) => board.id),
    now - HISTORY_DAYS * 24 * 3600_000,
    now,
    (n) => {
      state.status = `Read ${n} activity entries…`;
      render();
    },
  );

  state.source = 'monday';
  state.now = now;
  state.unparsedTimestamps = unparsedTimestamps;
  state.results = watch(entries, now, { boardNames: new Map(boards.map((b) => [b.id, b.name])) });
  state.summary = summarize(state.results);
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
