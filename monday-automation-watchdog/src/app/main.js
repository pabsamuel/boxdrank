/**
 * UI for the automation watchdog.
 *
 * Plain DOM, no framework: the smaller the dependency list, the smaller the
 * surface monday's security review has to scan.
 *
 * Read-only. One GraphQL query shape, no mutations, no storage. Its one call to
 * this app's own server fetches the scheduled job's history for the signed-in
 * account.
 */

import { watch, summarize } from '../core/watch.js';
import { formatDuration } from '../core/cadence.js';
import { createMute, isMuteActive, pruneMutes, describeMute, MUTE_PRESETS } from '../core/mutes.js';
import { loadMutes, saveMutes } from './mute-store.js';
import { summarizeRuns } from '../core/run-log.js';
import { fetchBoards, fetchActivity, fetchUsers, fetchAutomations, looksLikeMondayContext } from './monday-source.js';
import { buildInventory, searchInventory } from '../core/inventory.js';
import { classifyActors } from '../core/actors.js';

/** How far back to read activity. Long enough for the engine to learn a rhythm. */
const HISTORY_DAYS = 60;

/** Set once the welcome page has been dismissed in this browser. */
const WELCOME_KEY = 'watchdog:welcomed:v1';

const STATUS_COPY = {
  silent: {
    label: 'Stopped',
    tone: 'silent',
    hint: 'Used to act on a regular rhythm and has now been quiet far longer than its normal gap.',
  },
  late: {
    label: 'Overdue',
    tone: 'late',
    hint: 'Past its usual gap, but not yet long enough to call it stopped.',
  },
  dormant: {
    label: 'Switched off',
    tone: 'dormant',
    hint: 'Quiet for over a month. Treated as retired on purpose rather than broken.',
  },
  healthy: { label: 'Running', tone: 'healthy', hint: 'Acting on its normal rhythm.' },
  insufficient_history: {
    label: 'Not enough history',
    tone: 'unknown',
    hint: 'Has not acted often enough yet to learn what normal looks like.',
  },
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
  installed: null,
  plan: null,
  viewOnly: false,
  sdk: null,
  valueReported: false,
  welcome: !hasSeenWelcome(),
  error: null,
  status: '',
  boards: [],
  tab: 'watch',
  inventory: { phase: 'idle', rows: [], counts: null, error: null, query: '' },
};

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

/**
 * monday's own theme, so the view matches the page around it.
 * FACT (`apps/docs/mondayget`, read 27 Sep 2026): context `theme` is "light",
 * "dark" or "black". Anything else leaves the operating system's preference.
 */
function applyTheme(theme) {
  if (['light', 'dark', 'black'].includes(theme)) document.documentElement.dataset.theme = theme;
}

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

  if (state.plan === 'none') {
    // Before "checks not running": that is what the stopped checks would look
    // like, and the honest reason is the plan, not a fault.
    const strip = el('div', 'checks warn');
    strip.append(
      el('strong', null, 'Email alerts are paused: this account has no active plan'),
      el('span', null, 'This page still works. Choose a plan to have stopped automations emailed to you again. '),
    );
    if (state.sdk) {
      const choose = el('button', 'link', 'Choose a plan');
      // FACT (`apps/docs/mondayexecute`): opens monday's plan selection page;
      // it only works for live marketplace apps.
      choose.addEventListener('click', () => {
        state.sdk.execute('openPlanSelection', { isInPlanSelection: true }).catch(() => {});
      });
      strip.append(choose);
    }
    return strip;
  }

  if (state.installed === false) {
    // Opened in a new tab: monday's authorization page is not one to put in
    // an iframe, and the install has to happen as a top-level visit for its
    // one-time state cookie to be sent back.
    const strip = el('div', 'checks warn');
    const link = el('a', null, 'Set up email alerts');
    link.href = new URL('../oauth/start', window.location.href).toString();
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    strip.append(
      el('strong', null, 'Email alerts are not set up for this account'),
      el('span', null, 'This page only reports when you open it. Set up alerts so a stopped automation emails you. '),
      link,
    );
    return strip;
  }

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
    tile.title = STATUS_COPY[status].hint;
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
  const pill = el('span', `pill ${copy.tone}`, copy.label);
  if (copy.hint) pill.title = copy.hint;
  head.append(pill);
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

/**
 * Shown once, before the main page, as monday's review asks of board views:
 * a welcome, first-time instructions with a screenshot, and what to know first.
 */
function renderWelcome() {
  const box = el('section', 'welcome');
  box.append(el('h2', null, 'Welcome to Automation Watchdog'));
  box.append(
    el(
      'p',
      null,
      'monday switches automations off in several situations, some of them without telling anyone. This view learns how often each automation normally acts and shows you the ones that have gone quiet.',
    ),
  );

  const steps = el('ol', 'steps');
  for (const text of [
    'Leave this view on any board. It reads the last 60 days of activity on every board you can see. It never changes anything.',
    'Each automation that repeats gets a status: Running, Overdue, Stopped or Switched off. Hover a status to see what it means.',
    'Click "Set up email alerts" once. A daily check then emails you when an automation stops, so you do not need to keep this page open.',
  ]) {
    steps.append(el('li', null, text));
  }
  box.append(steps);

  const shot = el('img', 'shot');
  shot.src = new URL('./assets/board-view.png', window.location.href).toString();
  shot.alt = 'The board view: a red banner saying one automation has stopped, status counts, and one row per automation.';
  shot.width = 1260;
  shot.height = 868;
  box.append(shot);

  box.append(
    el(
      'p',
      'meta',
      'Good to know: an automation needs a few weeks of history before it can be judged, and one that acts less than about weekly cannot be watched.',
    ),
  );

  const go = el('button', 'primary', 'Show my automations');
  go.addEventListener('click', dismissWelcome);
  box.append(go);
  return box;
}

/** Two views of the same account: what has stopped, and everything there is. */
function renderTabs() {
  const bar = el('nav', 'tabs');
  const tabs = [
    ['watch', 'Stopped automations'],
    ['inventory', state.inventory.counts ? `All automations (${state.inventory.counts.total})` : 'All automations'],
  ];
  for (const [id, label] of tabs) {
    const button = el('button', `tab${state.tab === id ? ' active' : ''}`, label);
    button.addEventListener('click', () => {
      state.tab = id;
      if (id === 'inventory' && state.inventory.phase === 'idle') loadInventory();
      render();
    });
    bar.append(button);
  }
  return bar;
}

function renderInventoryRow(row) {
  const tone = row.notice ? 'late' : row.active === false ? 'dormant' : row.active ? 'healthy' : 'unknown';
  const label = row.active === false ? 'Off' : row.active ? 'On' : 'Unknown';
  const section = el('section', `row ${tone}`);
  const head = el('header', 'row-head');
  const pill = el('span', `pill ${tone}`, label);
  pill.title = row.active === false ? 'Switched off in monday.' : row.active ? 'Switched on in monday.' : 'monday did not say.';
  head.append(pill, el('h3', null, row.title));
  section.append(head);
  if (row.notice) section.append(el('p', 'reason', `monday says: ${row.notice}`));
  const changed = Date.parse(row.updatedAt ?? row.createdAt ?? '');
  const meta = [row.board];
  if (Number.isFinite(changed)) meta.push(`last changed ${formatDuration(Math.max(0, state.now - changed))} ago`);
  section.append(el('p', 'meta', meta.join(' · ')));
  if (row.description) section.append(el('p', 'meta', row.description));
  return section;
}

/**
 * The inventory. The list is redrawn on its own as the search changes, so
 * the search box keeps its focus while typing.
 */
function renderInventory(app) {
  const inventory = state.inventory;
  if (inventory.phase === 'loading' || inventory.phase === 'idle') {
    app.append(el('p', 'status', 'Listing every automation in the account…'));
    return;
  }
  if (inventory.phase === 'error') {
    const box = el('div', 'checks warn');
    box.append(el('strong', null, 'monday did not return the list of automations'), el('span', null, inventory.error));
    app.append(box);
    return;
  }

  const { counts } = inventory;
  const summary = el('div', 'summary');
  for (const [value, label, tone] of [
    [counts.total, 'Automations', ''],
    [counts.off, 'Switched off', 'dormant'],
    [counts.withNotice, 'With a notice from monday', 'late'],
    [counts.boards, 'Boards', ''],
  ]) {
    const tile = el('div', `tile ${tone}`);
    tile.append(el('div', 'tile-value', String(value)), el('div', 'tile-label', label));
    summary.append(tile);
  }
  app.append(summary);

  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'Search by name, board, "off"…';
  search.value = inventory.query;
  search.setAttribute('aria-label', 'Search automations');
  app.append(search);

  const list = el('div', 'rows');
  const draw = () => {
    const matches = searchInventory(inventory.rows, inventory.query);
    list.replaceChildren(...matches.map(renderInventoryRow));
    if (matches.length === 0) list.append(el('p', 'status', inventory.rows.length === 0 ? 'monday listed no automations in this account.' : 'No automation matches that search.'));
  };
  search.addEventListener('input', () => {
    inventory.query = search.value;
    draw();
  });
  draw();
  app.append(list);
  app.append(
    el(
      'p',
      'meta',
      'Listed by monday itself, on and off, including automations that have never run. Automations set up the older way can be missing from an account-wide list; monday returns those only board by board.',
    ),
  );
}

async function loadInventory() {
  state.inventory.phase = 'loading';
  try {
    let automations;
    if (state.source === 'monday') {
      automations = await fetchAutomations(state.sdk);
    } else {
      const response = await fetch(new URL('../../fixtures/demo-automations.json', import.meta.url));
      automations = (await response.json()).automations;
    }
    const { rows, counts } = buildInventory(automations, state.boards);
    Object.assign(state.inventory, { phase: 'ready', rows, counts });
  } catch (error) {
    Object.assign(state.inventory, { phase: 'error', error: error?.message ?? String(error) });
  }
  render();
}

function render() {
  const app = $('app');
  app.replaceChildren();

  if (state.viewOnly) {
    // FACT (`apps/docs/product`): "viewers can't access the API, so your app
    // should display a relevant message".
    const box = el('div', 'checks warn');
    box.append(
      el('strong', null, 'As a viewer, you can\'t use Automation Watchdog'),
      el(
        'span',
        null,
        'It reads board activity through monday\'s API, which viewer accounts cannot use. Ask an admin or a member of this account to open this view.',
      ),
    );
    app.append(box);
    return;
  }

  // After the viewer check: a welcome promising automations a viewer then
  // cannot see would be worse than no welcome.
  if (state.welcome) {
    app.append(renderWelcome());
    return;
  }

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

  app.append(renderTabs());
  if (state.tab === 'inventory') {
    renderInventory(app);
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
      ? 'monday does not always tell anyone when an automation stops. That is why this exists.'
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
  reportValueCreated();
}

/**
 * Tells monday the user has seen what this view exists for: the verdict on
 * every automation. Once per load, when it is first on screen — not while the
 * welcome page is still covering it. FACT (`apps/docs/mondayexecute`):
 * `valueCreatedForUser` takes no parameters; monday's guide recommends
 * reporting it every time the value is delivered, not only the first time.
 */
function reportValueCreated() {
  if (state.source !== 'monday' || state.valueReported || !state.sdk) return;
  state.valueReported = true;
  state.sdk.execute('valueCreatedForUser').catch(() => {});
}

async function loadDemo() {
  const response = await fetch(new URL('../../fixtures/demo-activity.json', import.meta.url));
  const demo = await response.json();
  state.source = 'demo';
  state.boards = demo.boards;
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
  state.boards = boards;
  state.now = now;
  state.mutes = pruneMutes(loadMutes(), now);
  // The scheduled job's history lives server-side. It is asked for with the
  // session token monday issues to this view, which the server verifies, so a
  // view can only ever read its own account's history. If the server cannot be
  // reached the view falls back to saying checks are not running — the one
  // failure it must never hide.
  state.runs = [];
  state.installed = null;
  try {
    const session = await monday.get('sessionToken');
    const response = await fetch(new URL('../api/status', window.location.href), {
      headers: { Authorization: session?.data ?? '' },
    });
    if (response.ok) {
      const body = await response.json();
      state.runs = Array.isArray(body?.runs) ? body.runs : [];
      state.installed = body?.installed === true;
      state.plan = typeof body?.plan === 'string' ? body.plan : null;
    }
  } catch {
    // Left as "not running"; see above.
  }
  state.unparsedTimestamps = unparsedTimestamps;
  // The same narrowing as the daily check and the Sidekick tool: patterns by
  // the account's people are not automations. Without it this view counted a
  // person's routine as a stopped automation — 4 here against 0 from sidekick
  // on the same account, 28 Sep. When the people cannot be listed, every
  // repeating pattern stays watched, as in run-check.js.
  const users = await fetchUsers(monday);
  const { automationActors, unknown } = classifyActors(entries, (users ?? []).map((user) => user.id));
  state.results = watch(entries, now, {
    boardNames: new Map(boards.map((b) => [b.id, b.name])),
    actorNames: new Map((users ?? []).map((user) => [user.id, user.name])),
    automationActors: unknown ? undefined : automationActors,
  });
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
