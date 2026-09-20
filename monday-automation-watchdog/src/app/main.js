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
import { createMute, isMuteActive, pruneMutes, describeMute, MUTE_PRESETS } from '../core/mutes.js';
import { loadMutes, saveMutes } from './mute-store.js';
import { summarizeRuns } from '../core/run-log.js';
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
  mutes: {},
  muteStoreFailed: false,
  runs: [],
  error: null,
  status: '',
};

/**
 * The strip that says whether the watchdog itself is working.
 *
 * Every failure this product detects is a silent one, so the worst thing it can
 * do is fail silently itself. A scheduled job that has stopped produces exactly
 * the same screen as an account where nothing is broken — calm, no email — and
 * the calm screen is the more convincing of the two. So this is shown always,
 * not only when something is wrong.
 */
function renderRunStatus() {
  const summary = summarizeRuns(state.runs, state.now);

  if (summary.neverRun) {
    const strip = el('div', 'checks warn');
    strip.append(
      el('strong', null, 'Scheduled checks are not running yet'),
      el(
        'span',
        null,
        'This page only reports when you open it. Until checks are scheduled, nothing will email you when an automation stops — which is the whole point.',
      ),
    );
    return strip;
  }

  const ago = formatDuration(summary.sinceLastMs);

  if (summary.isStale) {
    const strip = el('div', 'checks warn');
    strip.append(
      el('strong', null, `No check has run for ${ago}`),
      el('span', null, 'The watchdog itself has stopped. Nothing below is current, and no email will arrive.'),
    );
    return strip;
  }

  if (summary.consecutiveErrors > 0) {
    const strip = el('div', 'checks warn');
    strip.append(
      el('strong', null, `The last ${summary.consecutiveErrors} check${summary.consecutiveErrors === 1 ? '' : 's'} failed`),
      el('span', null, summary.lastError ?? 'monday returned an error.'),
    );
    return strip;
  }

  const strip = el('div', 'checks ok');
  strip.append(el('span', null, `Last checked ${ago} ago. Checks run daily.`));
  return strip;
}

/** True when this signal is currently silenced. */
function isMuted(result) {
  return isMuteActive(state.mutes[result.key], state.now, result.status);
}

function setMute(result, presetId) {
  state.mutes = presetId === null
    ? Object.fromEntries(Object.entries(state.mutes).filter(([key]) => key !== result.key))
    : { ...state.mutes, [result.key]: createMute(presetId, state.now) };

  state.muteStoreFailed = !saveMutes(state.mutes);
  render();
}

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

/**
 * Mute controls. A muted row keeps everything it had and gains a way back:
 * silencing the notification must never hide the information.
 */
function renderMuteControls(result) {
  const wrap = el('div', 'mute');

  if (isMuted(result)) {
    wrap.append(el('span', 'mute-state', describeMute(state.mutes[result.key], state.now)));
    const unmute = el('button', 'link', 'Unmute');
    unmute.addEventListener('click', () => setMute(result, null));
    wrap.append(unmute);
    return wrap;
  }

  // Only offered where it is meaningful. Muting something already healthy is
  // just a way to build a blind spot for free.
  if (result.status === 'healthy' || result.status === 'insufficient_history') return wrap;

  wrap.append(el('span', 'mute-state', 'Mute'));
  for (const preset of MUTE_PRESETS) {
    const button = el('button', 'link', preset.label);
    button.addEventListener('click', () => setMute(result, preset.id));
    wrap.append(button);
  }
  return wrap;
}

function renderRow(result) {
  const copy = STATUS_COPY[result.status] ?? { label: result.status, tone: 'unknown' };
  const muted = isMuted(result);
  const row = el('section', `row ${copy.tone}${muted ? ' muted' : ''}`);

  const head = el('header', 'row-head');
  head.append(el('span', `pill ${copy.tone}`, copy.label));
  head.append(el('h3', null, result.label));
  row.append(head);

  row.append(el('p', 'reason', result.reason));

  if (result.lastFiredAt) {
    const meta = `Last activity ${formatDuration(state.now - result.lastFiredAt)} ago · ${result.timestamps.length} events observed`;
    row.append(el('p', 'meta', meta));
  }

  row.append(renderMuteControls(result));
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

  // Muted signals are excluded from the alarm, exactly as they are from email,
  // but the count is always shown so a blind spot cannot become invisible.
  const mutedCount = state.results.filter(isMuted).length;
  const alarmCount = state.results.filter((r) => r.status === 'silent' && !isMuted(r)).length;

  const banner = el('div', `banner ${alarmCount > 0 ? 'alarm' : 'calm'}`);
  banner.append(
    el(
      'strong',
      null,
      alarmCount > 0
        ? `${alarmCount} automation${alarmCount === 1 ? ' has' : 's have'} stopped`
        : 'Everything that should be running is running',
    ),
  );

  const context = [
    alarmCount > 0
      ? 'monday does not send an alert when this happens. That is why this exists.'
      : `${state.summary.watched} recurring patterns watched.`,
  ];
  if (mutedCount > 0) context.push(`${mutedCount} muted.`);
  banner.append(el('span', null, context.join(' ')));
  app.append(banner);
  app.append(renderRunStatus());

  if (state.muteStoreFailed) {
    app.append(
      el('p', 'warning', 'This browser would not save the mute, so it will come back on reload.'),
    );
  }

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
  state.mutes = pruneMutes(loadMutes(), demo.now);
  state.runs = demo.runs ?? [];
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
  state.mutes = pruneMutes(loadMutes(), now);
  // The board view has no access to the scheduled job's run log yet, so it
  // honestly reports that checks are not running rather than implying they are.
  state.runs = [];
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
