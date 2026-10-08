/**
 * Which item updates nobody has answered: pure functions over what monday
 * returns (src/app/monday-source.js, fetchUpdates), so the rules are testable
 * offline and shared by the board view and the Sidekick tool.
 *
 * The rule, in one place:
 * - An update is **answered** when someone other than its author replied to
 *   it, or posted a newer update on the same item. A reply from the author
 *   ("any news?") does not count; neither does a like.
 * - Otherwise it is **unanswered**, and its age is counted from when it was
 *   written.
 *
 * The second half of "answered" is a choice, not a monday fact: on monday,
 * people often answer with a new update instead of a reply, and listing those
 * threads as unanswered would bury the real ones (INFERENCE, 8 Oct 2026).
 */

import { singleLine } from './sanitize.js';
import { safeMondayUrl } from './links.js';

const DAY = 24 * 60 * 60 * 1000;

/** How far back the app reads. Past this, an unanswered question is history. */
export const LOOKBACK_DAYS = 30;

/** The default "no reply for N days" (SPEC.md). */
export const DEFAULT_DAYS = 2;

/** The age filter's choices, in days. */
export const AGE_OPTIONS = [1, 2, 3, 7, 14];

/** The views, in the order the board view shows them. "Mine" is the default (SPEC.md). */
export const VIEW_OPTIONS = [
  ['mine', 'Mine'],
  ['mentions', 'Mentioning me'],
  ['all', 'All'],
];

/** A user id as the app compares them: a string of digits, or null. */
export function userIdOf(value) {
  const text = String(value ?? '').trim();
  return /^[1-9]\d*$/.test(text) ? text : null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(text) {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (whole, code) => {
    const lower = code.toLowerCase();
    if (ENTITIES[lower] !== undefined) return ENTITIES[lower];
    if (lower.startsWith('#x')) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16) || 32);
    if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)) || 32);
    return whole;
  });
}

/** An update's HTML as plain text, for when monday sends no `text_body`. */
export function textOf(html) {
  return decodeEntities(String(html ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '));
}

function attribute(attributes, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attributes);
  return match ? decodeEntities(match[2] ?? match[3] ?? '') : null;
}

/** The user id in a link to a monday profile (`…monday.com/users/<id>`), or null. */
function profileLinkId(href) {
  let url;
  try {
    url = new URL(String(href ?? ''), 'https://monday.com');
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'monday.com' && !host.endsWith('.monday.com')) return null;
  return userIdOf(/^\/users\/(\d+)\/?$/.exec(url.pathname)?.[1]);
}

/**
 * The people an update @mentions, from its HTML body.
 *
 * ASSUMPTION (8 Oct 2026), to check on a live update before release
 * (`PLAYGROUND.md`): a user mention is a link carrying
 * `data-mention-type="User"` and `data-mention-id="<id>"`, or a link to
 * `…/users/<id>`, with "@Name" as its text. The schema says only that `body` is
 * HTML. Both forms are read, team and board mentions are left out, and
 * anything else is ignored rather than guessed at.
 *
 * @returns {{id: string, name: string}[]} One entry per person.
 */
export function parseMentions(html) {
  const found = new Map();
  const links = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const [, attributes, inner] of String(html ?? '').matchAll(links)) {
    const type = attribute(attributes, 'data-mention-type');
    let id = null;
    if (type !== null) {
      if (type.toLowerCase() !== 'user') continue;
      id = userIdOf(attribute(attributes, 'data-mention-id'));
    }
    if (id === null) id = profileLinkId(attribute(attributes, 'href'));
    if (id === null || found.has(id)) continue;
    found.set(id, { id, name: singleLine(textOf(inner)).replace(/^@\s*/, '') });
  }
  return [...found.values()];
}

const dateOf = (value) => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null);

/**
 * One update as monday returned it, normalised. Names are flattened to one
 * line here, once, so nothing downstream can be handed a line break.
 *
 * `authorId` is null when monday names no person: ASSUMPTION, updates written
 * by automations or integrations look like that (`PLAYGROUND.md`).
 */
export function normaliseUpdate(raw) {
  const item = raw?.item ?? null;
  const board = item?.board ?? null;
  const authorId = userIdOf(raw?.creator_id ?? raw?.creator?.id);
  return {
    id: String(raw?.id ?? ''),
    authorId,
    authorName: singleLine(raw?.creator?.name ?? '') || (authorId ? `User ${authorId}` : ''),
    createdAt: dateOf(raw?.created_at),
    text: singleLine(typeof raw?.text_body === 'string' && raw.text_body.trim() !== '' ? raw.text_body : textOf(raw?.body), 300),
    mentions: parseMentions(raw?.body),
    itemId: item?.id !== undefined && item?.id !== null ? String(item.id) : null,
    itemName: item ? singleLine(item.name ?? '') || 'Untitled item' : '',
    itemUrl: safeMondayUrl(item?.url),
    boardId: board?.id !== undefined && board?.id !== null ? String(board.id) : null,
    boardName: board ? singleLine(board.name ?? '') || `Board ${board.id}` : '',
    replies: (Array.isArray(raw?.replies) ? raw.replies : []).map((reply) => ({
      authorId: userIdOf(reply?.creator_id ?? reply?.creator?.id),
      createdAt: dateOf(reply?.created_at),
    })),
  };
}

/**
 * Every unanswered update, newest first, of any age.
 *
 * Left out, and counted: updates with no person as author, and updates not on
 * an item. Neither can be answered in the sense this app means.
 *
 * @param {ReturnType<typeof normaliseUpdate>[]} updates  All updates read, any order.
 * @returns {{rows: object[], skipped: number}}
 */
export function findUnanswered(updates) {
  // The newest update by each other person on each item: an update older than
  // that, by someone else, has been answered on the item itself.
  const latestByItem = new Map();
  for (const update of updates) {
    if (!update.itemId || !update.authorId || !update.createdAt) continue;
    const list = latestByItem.get(update.itemId) ?? [];
    list.push({ authorId: update.authorId, at: Date.parse(update.createdAt) });
    latestByItem.set(update.itemId, list);
  }

  const rows = [];
  let skipped = 0;
  for (const update of updates) {
    if (!update.authorId || !update.itemId || !update.createdAt) {
      skipped += 1;
      continue;
    }
    const at = Date.parse(update.createdAt);
    const replied = update.replies.some((reply) => reply.authorId && reply.authorId !== update.authorId);
    const followed = (latestByItem.get(update.itemId) ?? []).some((other) => other.authorId !== update.authorId && other.at > at);
    if (replied || followed) continue;
    rows.push({
      id: update.id,
      authorId: update.authorId,
      authorName: update.authorName,
      createdAt: update.createdAt,
      at,
      text: update.text,
      mentions: update.mentions,
      itemId: update.itemId,
      itemName: update.itemName,
      itemUrl: update.itemUrl,
      boardId: update.boardId,
      board: update.boardName || 'Unknown board',
      ownReplies: update.replies.length,
    });
  }
  rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return { rows, skipped };
}

const fold = (text) => String(text ?? '').toLocaleLowerCase('en').normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Whether a row belongs to a view, for the user `userId`. */
export function inView(row, view, userId) {
  if (view === 'mine') return userId !== null && row.authorId === userId;
  if (view === 'mentions') return userId !== null && row.mentions.some((mention) => mention.id === userId);
  return true;
}

/**
 * The rows one view shows: in the view, at least `minDays` old at `now`, and
 * optionally on one board (by name), by one author (by id), and matching every
 * word of a search.
 *
 * @param {object[]} rows  From findUnanswered.
 * @param {{view?: string, userId?: string|null, minDays?: number, now: number,
 *          board?: string, author?: string, query?: string}} filters
 */
export function filterRows(rows, { view = 'mine', userId = null, minDays = DEFAULT_DAYS, now, board = '', author = '', query = '' }) {
  const cutoff = now - minDays * DAY;
  const words = fold(query).split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (row.at > cutoff) return false;
    if (!inView(row, view, userId)) return false;
    if (board && row.board !== board) return false;
    if (author && row.authorId !== author) return false;
    if (words.length === 0) return true;
    const haystack = fold(`${row.text} ${row.itemName} ${row.board} ${row.authorName} ${row.mentions.map((m) => m.name).join(' ')}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** How many unanswered updates each view holds at this age. */
export function countViews(rows, { userId = null, minDays = DEFAULT_DAYS, now }) {
  const old = rows.filter((row) => row.at <= now - minDays * DAY);
  return Object.fromEntries(VIEW_OPTIONS.map(([view]) => [view, old.filter((row) => inView(row, view, userId)).length]));
}

/** The boards with an unanswered update, by name, for the board filter. */
export function boardsIn(rows) {
  return [...new Set(rows.map((row) => row.board))].sort((a, b) => a.localeCompare(b));
}

/** The authors of unanswered updates, by id, sorted by name, for the author filter. */
export function authorsIn(rows) {
  const byId = new Map(rows.map((row) => [row.authorId, row.authorName]));
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/**
 * The window the app reads, as monday's `from_date` and `to_date`: both are
 * inclusive dates (FACT, the schema, 8 Oct 2026). `to` is tomorrow in UTC, so
 * "today" is included wherever the user is.
 */
export function readWindow(now, lookbackDays = LOOKBACK_DAYS) {
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { from: day(now - lookbackDays * DAY), to: day(now + DAY) };
}
