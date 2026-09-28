// REFERENCE ONLY — not wired, not tested on its own.
// The All automations tab as it was in Automation Watchdog's board view
// (src/app/main.js at commit 23fcca6, lines 325-455), kept so the new app does
// not have to dig it out of git history. It relies on Watchdog's `state`,
// `el()`, `render()` and `demoMode`; rewrite it around the new app's own state.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}


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
  const label = row.active === false ? 'Off' : row.active ? 'On' : row.legacy ? 'Older' : 'Unknown';
  const section = el('section', `row ${tone}`);
  const head = el('header', 'row-head');
  const pill = el('span', `pill ${tone}`, label);
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

/**
 * The inventory. The list is redrawn on its own as the search changes, so
 * the search box keeps its focus while typing.
 */
function renderInventory(app) {
  const inventory = state.inventory;
  if (inventory.phase === 'loading' || inventory.phase === 'idle') {
    app.append(el('p', 'status', inventory.progress || 'Listing every automation in the account…'));
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
  if (inventory.failedBoards > 0) {
    app.append(
      el('p', 'warning', `${inventory.failedBoards} board${inventory.failedBoards === 1 ? '' : 's'} could not be read, so their automations are not listed.`),
    );
  }
  app.append(
    el(
      'p',
      'meta',
      'Listed by monday itself, board by board: on and off, older and newer kinds, including automations that have never run.',
    ),
  );
}

async function loadInventory() {
  state.inventory.phase = 'loading';
  try {
    let automations;
    if (state.source === 'monday') {
      const boardIds = state.boards.map((board) => board.id);
      const result = await fetchAutomations(state.sdk, boardIds, (found) => {
        state.inventory.progress = `Found ${found} automations so far…`;
        render();
      });
      automations = result.automations;
      state.inventory.failedBoards = result.failedBoards;
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

