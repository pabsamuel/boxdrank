/**
 * The Sidekick tool: finds unanswered updates for sidekick, monday's AI
 * assistant — "which of my updates got no answer?", "what was I asked that I
 * never answered?", "which questions on the Sales board are still open?" — in
 * words it can pass straight to the user.
 *
 * FACT (`apps/docs/sidekick-tool`, `sidekick-tools-best-practices`, read 28 Sep
 * 2026 for Automation Watchdog): a tool is an action block whose Run URL must
 * "return results within a few seconds", synchronously; users "talk in names,
 * not numbers"; errors should become guidance; and the answer should say where
 * its data came from and when. FACT (the submission form, 28 Sep 2026):
 * "monday.com is only accepting apps that include AI capabilities."
 *
 * The shape is Automation Inventory's `src/server/sidekick.js`. It reads with
 * the short-lived token monday sends for this one request and stores nothing.
 * A deadline keeps it inside "a few seconds": a read that runs out of time
 * says how far back it got rather than timing out.
 */

import { fetchUpdates } from '../app/monday-source.js';
import { findUnanswered, filterRows, boardsIn, userIdOf, DEFAULT_DAYS, LOOKBACK_DAYS } from '../core/unanswered.js';
import { singleLine } from '../core/sanitize.js';
import { formatDuration } from '../core/time.js';
import { APP_NAME } from '../core/brand.js';

export const SIDEKICK_PATH = '/monday/sidekick/unanswered';

/** Time allowed for reading updates before answering with what was read. */
export const SIDEKICK_BUDGET_MS = 8000;

/** Pages the tool reads at most: the newest 1,000 updates. The board view reads more. */
export const SIDEKICK_MAX_PAGES = 10;

const MAX_LISTED = 15;

const normalise = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * "mine", "mentions" or "all". The block's field asks for one of those words;
 * sidekick is a language model and may pass a phrase instead, so a phrase is
 * read too, with "mine" as the default (SPEC.md).
 */
export function scopeOf(value) {
  const text = normalise(value);
  if (['mine', 'mentions', 'all'].includes(text)) return text;
  if (/mention|tagg?ed|asked me|to me|for me/.test(text)) return 'mentions';
  if (/\b(my|mine|me|i)\b/.test(text)) return 'mine';
  if (/\b(all|every|everyone|everybody|team|account|others)\b/.test(text)) return 'all';
  return 'mine';
}

/** Whole days between 0 and the read window, or the default. */
export function daysOf(value) {
  const number = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(number)) return DEFAULT_DAYS;
  return Math.min(LOOKBACK_DAYS, Math.max(0, Math.floor(number)));
}

/**
 * Reads the updates of the last 30 days the user can see, and picks the
 * unanswered ones for the asked scope.
 *
 * @param {object} deps
 * @param {{api: Function}} deps.monday  A client holding the short-lived token.
 * @param {unknown} deps.userId          The asking user, from the request's JWT.
 * @param {unknown} [deps.scope]         "mine" (default), "mentions" or "all".
 * @param {unknown} [deps.days]          No reply for at least this many days.
 * @param {string} [deps.boardName]      Optional; matched by name, as users say it.
 * @param {number} deps.now
 * @param {() => number} [deps.clock]    For the deadline; real time by default.
 * @param {number} [deps.budgetMs]
 */
export async function findForSidekick({
  monday,
  userId,
  scope,
  days,
  boardName = '',
  now,
  clock = () => Date.now(),
  budgetMs = SIDEKICK_BUDGET_MS,
}) {
  const startedAt = clock();
  const asker = userIdOf(userId);
  let view = scopeOf(scope);
  // Without a user, "mine" would be nobody's: say so and answer for everyone.
  const unknownUser = asker === null && view !== 'all';
  if (unknownUser) view = 'all';
  const minDays = daysOf(days);

  const read = await fetchUpdates(monday, {
    now,
    maxPages: SIDEKICK_MAX_PAGES,
    shouldStop: () => clock() - startedAt > budgetMs,
  });
  const { rows } = findUnanswered(read.updates);

  const wanted = normalise(boardName);
  let board = '';
  if (wanted) {
    const boards = boardsIn(rows);
    board = boards.find((name) => normalise(name) === wanted) ?? boards.find((name) => normalise(name).includes(wanted)) ?? '';
    if (!board) {
      const words = wanted.split(' ').filter((word) => word.length > 2);
      const similar = boards.filter((name) => words.some((word) => normalise(name).includes(word))).slice(0, 5);
      return { notFound: String(boardName), similar, checked: read.updates.length };
    }
  }

  return {
    view,
    unknownUser,
    minDays,
    board,
    matches: filterRows(rows, { view, userId: asker, minDays, now, board }),
    checked: read.updates.length,
    complete: read.complete,
    oldest: read.oldest,
  };
}

const VIEW_WORDS = {
  mine: 'written by you',
  mentions: 'that @mention you',
  all: 'from everyone',
};

/**
 * What sidekick shows the user, as the block's output fields.
 *
 * @returns {{summary: string, unanswered_count: number, checked_updates: number}}
 */
export function sidekickAnswer(found, now) {
  if (found.notFound !== undefined) {
    const hint = found.similar.length > 0
      ? ` Boards with similar names: ${found.similar.map((name) => `"${singleLine(name)}"`).join(', ')}.`
      : ` Check the board name, or ask without one to look at every board.`;
    return {
      summary: `${APP_NAME} found no unanswered update on a board named "${singleLine(found.notFound)}" in the last ${LOOKBACK_DAYS} days.${hint}`,
      unanswered_count: 0,
      checked_updates: found.checked,
    };
  }

  const count = found.matches.length;
  const age = found.minDays === 0 ? 'with no answer yet' : `with no answer for ${found.minDays} day${found.minDays === 1 ? '' : 's'} or more`;
  const where = found.board ? ` on the board "${singleLine(found.board)}"` : '';
  const lines = [];
  if (found.unknownUser) lines.push(`${APP_NAME} could not tell who is asking, so this covers everyone's updates.`);
  lines.push(
    `${APP_NAME} found ${count} update${count === 1 ? '' : 's'} ${VIEW_WORDS[found.view]}${where} ${age}, ` +
    `among ${found.checked} update${found.checked === 1 ? '' : 's'} from the last ${LOOKBACK_DAYS} days, as monday reported them at ` +
    `${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
  );
  if (!found.complete) {
    const back = found.oldest ? `, back to ${found.oldest.slice(0, 10)}` : '';
    lines.push(`It had time to read the newest ${found.checked} updates${back}. Open the ${APP_NAME} board view for the full list.`);
  }
  lines.push('An update counts as answered when someone other than its author replied to it, or posted a newer update on the same item.');

  for (const row of found.matches.slice(0, MAX_LISTED)) {
    // Already single-line from normaliseUpdate; flattened again because a new
    // line here would let an update's author write sidekick's next line.
    const by = found.view === 'mine' ? '' : ` by ${singleLine(row.authorName)}`;
    lines.push(
      `- "${singleLine(row.text, 120)}"${by}, ${formatDuration(Math.max(0, now - row.at))} ago, on "${singleLine(row.itemName)}" (board "${singleLine(row.board)}")`,
    );
  }
  if (count > MAX_LISTED) lines.push(`- and ${count - MAX_LISTED} more, in the ${APP_NAME} board view.`);

  return {
    summary: lines.join('\n'),
    unanswered_count: count,
    checked_updates: found.checked,
  };
}
