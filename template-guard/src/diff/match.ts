import type { ColumnSnapshot } from '../snapshot/types.js';
import type { Confidence } from './types.js';

/**
 * Cross-board column matching.
 *
 * This is the hardest part of the product and the reason the test suite exists.
 *
 * The problem: when monday duplicates a board, every column gets a **new ID**.
 * So we cannot join on identity. We have to infer which column in the copy
 * corresponds to which column in the template, using only title, type and
 * position — and then report differences between the pairs we inferred.
 *
 * The problem under the problem: a renamed column and a "deleted one, added
 * another" are, from the API's point of view, *the same observation*. No
 * amount of cleverness distinguishes them. So the goal is not to be always
 * right — it is to be right on the common cases, and **honest about the rest**.
 * Matches we infer from weak evidence are marked `likely`, and the UI says so.
 *
 * Strategy, most-confident first. Each pass only considers columns still
 * unmatched, and only commits a match when it is unambiguous on BOTH sides —
 * two columns called "Status" of type `status` will never be silently paired
 * with each other's counterpart.
 */

export interface ColumnMatch {
  template: ColumnSnapshot;
  copy: ColumnSnapshot;
  confidence: Confidence;
  /** Which pass produced this match. Surfaced in evidence for debuggability. */
  via: 'title+type' | 'title' | 'type+position' | 'sole-of-type';
}

export interface MatchResult {
  matches: ColumnMatch[];
  /** In the template, nothing in the copy corresponds. */
  templateOnly: ColumnSnapshot[];
  /** In the copy, nothing in the template corresponds. */
  copyOnly: ColumnSnapshot[];
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Levenshtein distance, iterative, single row. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const row: number[] = new Array<number>(b.length + 1);
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((row[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/** 0..1, where 1 is identical. */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return 1;
  const longest = Math.max(na.length, nb.length);
  if (longest === 0) return 1;
  return 1 - editDistance(na, nb) / longest;
}

/**
 * Below this, two titles are considered unrelated.
 *
 * 0.6 is empirical, not principled: it pairs "Client Owner" with "Account
 * Owner" (a plausible rename) while keeping "Budget" away from "Status". Any
 * match resting on similarity alone is reported as `likely`, never `certain`,
 * so the cost of this threshold being slightly wrong is a hedged sentence in
 * the UI rather than a wrong repair.
 */
export const TITLE_SIMILARITY_THRESHOLD = 0.6;

/** Separator that cannot occur inside a normalized title. */
const KEY_SEP = '::';

/**
 * Column types too common to match on type alone.
 *
 * The last-resort pass pairs a lone unmatched column of type X on one side
 * with a lone unmatched column of type X on the other, *ignoring the titles*.
 * That is sound reasoning for a distinctive type — if both boards have exactly
 * one formula column, one mirror, one time-tracking column, it is almost
 * certainly the same column renamed, because nobody deletes their only formula
 * column and adds a different one in the same edit.
 *
 * It is bad reasoning for `text`. Boards accumulate and lose text columns
 * constantly, and pairing "Scope Notes" with "Invoice Reference" purely
 * because both happen to be the last remaining text column would report a
 * confident rename where the truth is one column removed and one added. Two
 * wrong findings, and the user loses trust in the ones that are right.
 *
 * So: generic types must clear the similarity bar in pass 3 or be reported as
 * a straight missing/added pair. Being wrong in the direction of "I don't
 * know" is the only acceptable direction for this app.
 */
const GENERIC_COLUMN_TYPES = new Set([
  'text',
  'long_text',
  'numbers',
  'date',
  'status',
  'people',
  'dropdown',
  'checkbox',
  'email',
  'phone',
  'link',
  'file',
]);

/** Indexes values by key, keeping only keys that appear exactly once. */
function uniqueByKey<T>(items: T[], key: (t: T) => string): Map<string, T> {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(key(it), (counts.get(key(it)) ?? 0) + 1);
  const out = new Map<string, T>();
  for (const it of items) {
    const k = key(it);
    if (counts.get(k) === 1) out.set(k, it);
  }
  return out;
}

export function matchColumns(
  templateColumns: ColumnSnapshot[],
  copyColumns: ColumnSnapshot[],
): MatchResult {
  const matches: ColumnMatch[] = [];
  const templateLeft = templateColumns.filter((c) => !c.archived);
  const copyLeft = copyColumns.filter((c) => !c.archived);

  const usedTemplate = new Set<string>();
  const usedCopy = new Set<string>();

  const remainingTemplate = () => templateLeft.filter((c) => !usedTemplate.has(c.id));
  const remainingCopy = () => copyLeft.filter((c) => !usedCopy.has(c.id));

  const commit = (
    template: ColumnSnapshot,
    copy: ColumnSnapshot,
    confidence: Confidence,
    via: ColumnMatch['via'],
  ) => {
    usedTemplate.add(template.id);
    usedCopy.add(copy.id);
    matches.push({ template, copy, confidence, via });
  };

  // Pass 1 — same normalized title AND same type, unambiguous on both sides.
  // This is the overwhelmingly common case for a real duplicate.
  {
    const keyOf = (c: ColumnSnapshot) => `${normalizeTitle(c.title)}${KEY_SEP}${c.type}`;
    const tIndex = uniqueByKey(remainingTemplate(), keyOf);
    const cIndex = uniqueByKey(remainingCopy(), keyOf);
    for (const [key, t] of tIndex) {
      const c = cIndex.get(key);
      if (c) commit(t, c, 'certain', 'title+type');
    }
  }

  // Pass 2 — same title, different type. Certain that they correspond (an
  // exact unique title match is strong evidence); the type change itself is
  // the finding, raised by the caller.
  {
    const keyOf = (c: ColumnSnapshot) => normalizeTitle(c.title);
    const tIndex = uniqueByKey(remainingTemplate(), keyOf);
    const cIndex = uniqueByKey(remainingCopy(), keyOf);
    for (const [key, t] of tIndex) {
      const c = cIndex.get(key);
      if (c) commit(t, c, 'certain', 'title');
    }
  }

  // Pass 3 — same type, same ordinal position among columns of that type, and
  // titles at least plausibly related. Catches a straightforward rename.
  {
    const byType = new Map<string, { t: ColumnSnapshot[]; c: ColumnSnapshot[] }>();
    for (const t of remainingTemplate()) {
      const e = byType.get(t.type) ?? { t: [], c: [] };
      e.t.push(t);
      byType.set(t.type, e);
    }
    for (const c of remainingCopy()) {
      const e = byType.get(c.type) ?? { t: [], c: [] };
      e.c.push(c);
      byType.set(c.type, e);
    }
    for (const { t, c } of byType.values()) {
      const pairs = Math.min(t.length, c.length);
      for (let i = 0; i < pairs; i += 1) {
        const tc = t[i];
        const cc = c[i];
        if (!tc || !cc) continue;
        if (usedTemplate.has(tc.id) || usedCopy.has(cc.id)) continue;
        if (titleSimilarity(tc.title, cc.title) >= TITLE_SIMILARITY_THRESHOLD) {
          commit(tc, cc, 'likely', 'type+position');
        }
      }
    }
  }

  // Pass 4 — exactly one unmatched column of this DISTINCTIVE type on each
  // side. Weakest evidence we act on, and deliberately not applied to generic
  // types (see GENERIC_COLUMN_TYPES). Always `likely`.
  {
    const tByType = new Map<string, ColumnSnapshot[]>();
    const cByType = new Map<string, ColumnSnapshot[]>();
    for (const t of remainingTemplate()) tByType.set(t.type, [...(tByType.get(t.type) ?? []), t]);
    for (const c of remainingCopy()) cByType.set(c.type, [...(cByType.get(c.type) ?? []), c]);
    for (const [type, ts] of tByType) {
      if (GENERIC_COLUMN_TYPES.has(type)) continue;
      const cs = cByType.get(type);
      if (ts.length === 1 && cs?.length === 1) {
        const t = ts[0];
        const c = cs[0];
        if (t && c) commit(t, c, 'likely', 'sole-of-type');
      }
    }
  }

  return {
    matches,
    templateOnly: remainingTemplate(),
    copyOnly: remainingCopy(),
  };
}
