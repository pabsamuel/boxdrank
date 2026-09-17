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

/** All mutable UI state. Kept in one object so render() is a pure function of it. */
const state = {
  source: 'loading',
  boards: [],
  referenceId: null,
  results: null,
  error: null,
  status: '',
};

const $ = (id) => document.getElementById(id);

/** Text-only insertion. Board and column names are user data and never HTML. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
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
    state.results = null;
    render();
  });

  const run = el('button', 'primary', 'Run audit');
  run.addEventListener('click', runAudit);

  controls.append(label, select, run);

  if (state.results) {
    const csv = el('button', 'secondary', 'Export CSV');
    csv.addEventListener('click', exportCsv);
    controls.append(csv);
  }
  app.append(controls);

  if (!state.results) {
    app.append(
      el('p', 'status', `${state.boards.length} boards loaded. Pick a reference board and run the audit.`),
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
  state.results = diffBoards(reference, state.boards);
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
