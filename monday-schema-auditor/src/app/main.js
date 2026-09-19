/**
 * UI for the board schema auditor.
 *
 * Deliberately plain DOM with no framework: the smaller the bundle and the
 * dependency list, the smaller the surface monday's security review has to scan.
 *
 * The app is read-only end to end. There is no code path here that writes to a
 * board, stores anything, or contacts any host other than monday's own API.
 */

import { diffBoards } from '../core/diff.js';
import { summarize, rankBoards, toCsv } from '../core/report.js';
import { scoreBoards } from '../core/similarity.js';
import { fetchBoards, looksLikeMondayContext } from './monday-source.js';

const SEVERITY_LABEL = { high: 'Breaks reports', medium: 'Worth a look', low: 'Informational' };

const KIND_LABEL = {
  type_mismatch: 'Type mismatch',
  missing: 'Missing column',
  renamed: 'Likely renamed',
  title_variant: 'Title formatting',
  extra: 'Extra column',
  order: 'Different order',
};

/**
 * All mutable UI state. Kept in one object so render() is a pure function of it.
 *
 * The search box is deliberately NOT in here. Filtering the board list is a
 * view concern with no bearing on the audit, and routing each keystroke through
 * a re-render would blur the input on every character.
 */
const state = {
  source: 'loading',
  boards: [],
  referenceId: null,
  scored: [],
  selectedIds: new Set(),
  results: null,
  error: null,
  status: '',
};

/**
 * Rescores every board against the current reference and pre-selects the ones
 * that look like they came from it. Called whenever the reference changes.
 */
function recomputeScores() {
  const reference = referenceBoard();
  state.scored = reference ? scoreBoards(reference, state.boards) : [];
  state.selectedIds = new Set(state.scored.filter((entry) => entry.suggested).map((entry) => entry.board.id));
  state.results = null;
}

const $ = (id) => document.getElementById(id);

/** Text-only insertion. Board and column names are user data and never HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The board picker: which boards get audited.
 *
 * Boards below the similarity threshold are listed but unticked rather than
 * hidden. An audit tool that quietly drops boards from its own scope would
 * undermine the one thing it is for — and a translated template, which scores
 * zero on names alone, can only be recovered by the user seeing it here.
 */
function renderSelection() {
  const panel = el('section', 'selection');

  const head = el('header', 'selection-head');
  head.append(el('h2', null, `Auditing ${state.selectedIds.size} of ${state.scored.length} boards`));

  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Filter boards…';
  search.setAttribute('aria-label', 'Filter boards');
  head.append(search);
  panel.append(head);

  const list = el('div', 'board-list');
  for (const { board, score, suggested } of state.scored) {
    const row = el('label', 'board-row');
    row.dataset.name = board.name.toLowerCase();

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.selectedIds.has(board.id);
    box.addEventListener('change', () => {
      if (box.checked) state.selectedIds.add(board.id);
      else state.selectedIds.delete(board.id);
      // Selection changes invalidate any report already on screen.
      state.results = null;
      render();
    });

    row.append(box, el('span', 'board-row-name', board.name));
    row.append(
      el('span', `match ${suggested ? 'yes' : 'no'}`, `${Math.round(score * 100)}% match`),
    );
    list.append(row);
  }
  panel.append(list);

  // Filtering touches the DOM directly instead of going through render(), so
  // the input keeps focus and the caret while the user types.
  search.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    for (const row of list.children) {
      row.hidden = term !== '' && !row.dataset.name.includes(term);
    }
  });

  return panel;
}

function renderSummary(summary) {
  const wrap = el('div', 'summary');
  const tiles = [
    ['Boards compared', summary.boardsCompared, ''],
    ['Match the reference', summary.cleanBoards, 'clean'],
    ['Breaks reports', summary.bySeverity.high, 'high'],
    ['Worth a look', summary.bySeverity.medium, 'medium'],
    ['Informational', summary.bySeverity.low, 'low'],
  ];
  for (const [label, value, tone] of tiles) {
    const tile = el('div', `tile ${tone}`.trim());
    tile.append(el('div', 'tile-value', String(value)), el('div', 'tile-label', label));
    wrap.append(tile);
  }
  return wrap;
}

function renderBoard(result) {
  const card = el('section', 'board');
  const head = el('header', 'board-head');
  head.append(el('h3', null, result.boardName));

  if (result.findings.length === 0) {
    head.append(el('span', 'pill clean', 'matches reference'));
    card.append(head);
    return card;
  }

  const counts = ['high', 'medium', 'low']
    .map((severity) => [severity, result.findings.filter((f) => f.severity === severity).length])
    .filter(([, n]) => n > 0);
  for (const [severity, n] of counts) {
    head.append(el('span', `pill ${severity}`, `${n} ${SEVERITY_LABEL[severity].toLowerCase()}`));
  }
  card.append(head);

  const list = el('ul', 'findings');
  for (const item of result.findings) {
    const row = el('li', `finding ${item.severity}`);
    row.append(el('span', 'kind', KIND_LABEL[item.kind] ?? item.kind));
    row.append(el('span', 'message', item.message));
    list.append(row);
  }
  card.append(list);
  return card;
}

function render() {
  const app = $('app');
  app.replaceChildren();

  $('source-note').textContent =
    state.source === 'monday'
      ? 'Reading live boards from monday.com'
      : state.source === 'demo'
        ? 'Demo data — open this inside monday to audit real boards'
        : '';

  if (state.error) {
    const box = el('div', 'error');
    box.append(el('strong', null, 'Could not load boards'), el('p', null, state.error));
    app.append(box);
    return;
  }

  if (state.source === 'loading') {
    app.append(el('p', 'status', state.status || 'Loading boards…'));
    return;
  }

  // Two states that are not errors but leave nothing to do. Without these the
  // user gets an empty dropdown and a dead button with no explanation.
  if (state.boards.length === 0) {
    app.append(
      el('p', 'status', 'No boards found. This app reads the boards your monday user can see — if you expect boards here, check your permissions with an admin.'),
    );
    return;
  }

  if (state.boards.length === 1) {
    app.append(
      el('p', 'status', `Only one board is visible ("${state.boards[0].name}"), so there is nothing to compare it against. This audit needs at least two boards.`),
    );
    return;
  }

  // Reference picker. Everything is compared against this one board.
  const controls = el('div', 'controls');
  const label = el('label', null, 'Compare every board against');
  label.htmlFor = 'reference';
  const select = el('select');
  select.id = 'reference';
  for (const board of [...state.boards].sort((a, b) => a.name.localeCompare(b.name))) {
    const option = el('option', null, `${board.name}  (${board.columns.length} columns)`);
    option.value = board.id;
    if (board.id === state.referenceId) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', (event) => {
    state.referenceId = event.target.value;
    recomputeScores();
    render();
  });

  const run = el('button', 'primary', 'Run audit');
  run.disabled = state.selectedIds.size === 0;
  run.addEventListener('click', runAudit);

  controls.append(label, select, run);

  if (state.results) {
    const csv = el('button', 'secondary', 'Export CSV');
    csv.addEventListener('click', exportCsv);
    controls.append(csv);
  }
  app.append(controls);
  app.append(renderSelection());

  if (!state.results) {
    const skipped = state.scored.length - state.selectedIds.size;
    app.append(
      el(
        'p',
        'status',
        skipped > 0
          ? `${skipped} board${skipped === 1 ? '' : 's'} left out because they do not look like this template. Tick any you want included, then run the audit.`
          : 'Run the audit when you are ready.',
      ),
    );
    return;
  }

  app.append(renderSummary(summarize(state.results)));
  const boards = el('div', 'boards');
  for (const result of rankBoards(state.results)) boards.append(renderBoard(result));
  app.append(boards);
}

function referenceBoard() {
  return state.boards.find((board) => board.id === state.referenceId);
}

function runAudit() {
  const reference = referenceBoard();
  if (!reference) return;
  const selected = state.boards.filter((board) => state.selectedIds.has(board.id));
  state.results = diffBoards(reference, selected);
  render();
}

/**
 * Builds the CSV in the page and hands it to the browser as a blob. Nothing is
 * uploaded anywhere — the file never leaves the user's machine.
 */
function exportCsv() {
  const reference = referenceBoard();
  const csv = toCsv(state.results, reference.name);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `schema-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Demo data, used when the page is opened outside monday. */
async function loadDemo() {
  const response = await fetch(new URL('../../fixtures/demo-boards.json', import.meta.url));
  const data = await response.json();
  state.source = 'demo';
  state.boards = data.boards;
  state.referenceId = data.referenceBoardId;
  recomputeScores();
}

async function loadFromMonday() {
  // Imported lazily so opening index.html directly still works without a bundle.
  const { default: mondaySdk } = await import('monday-sdk-js');
  const monday = mondaySdk();
  state.status = 'Loading boards from monday…';
  render();

  const boards = await fetchBoards(monday, (loaded) => {
    state.status = `Loaded ${loaded} boards…`;
    render();
  });

  state.source = 'monday';
  state.boards = boards;
  state.referenceId = boards[0]?.id ?? null;
  recomputeScores();
}

async function start() {
  try {
    if (looksLikeMondayContext()) {
      await loadFromMonday();
    } else {
      await loadDemo();
    }
  } catch (error) {
    // Falling back to demo data would disguise a real failure as a working app,
    // so a load failure is shown as a load failure.
    state.error = error?.message ?? String(error);
  }
  render();
}

start();
