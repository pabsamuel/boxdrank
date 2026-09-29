import type { LineProgress } from './protocol';

/**
 * Karaoke line matching.
 *
 * Speech recognition on a phone is noisy, children mumble, and Turkish STT
 * sometimes drops diacritics or glues clitics. So we never require an exact
 * transcript. Instead we align the expected words with the heard words using
 * a fuzzy longest-common-subsequence and report which expected words were
 * covered. A line "passes" when enough of its words are covered.
 */

export type Leniency = 'kids' | 'normal' | 'strict';

export interface MatchOptions {
  lang: string;
  leniency?: Leniency;
  /** Sung lines are matched with a much lower bar. */
  song?: boolean;
}

const PASS_RATIO: Record<Leniency, number> = { kids: 0.5, normal: 0.7, strict: 0.9 };
const WORD_SIMILARITY: Record<Leniency, number> = { kids: 0.66, normal: 0.75, strict: 0.85 };

const TR_FOLD: Record<string, string> = {
  ı: 'i',
  i: 'i',
  ş: 's',
  ğ: 'g',
  ç: 'c',
  ö: 'o',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
};

/** Lowercase with locale rules, drop punctuation, collapse whitespace. */
export function normalizeText(text: string, lang: string): string {
  const locale = lang.toLowerCase().startsWith('tr') ? 'tr' : 'en';
  return text
    .replace(/[’'`´ʼ]/g, '')
    .toLocaleLowerCase(locale)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string, lang: string): string[] {
  const n = normalizeText(text, lang);
  return n ? n.split(' ') : [];
}

/** Fold diacritics so "Karagoz" and "Karagöz" compare equal. */
export function fold(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ışğçöüâîû]/g, (ch) => TR_FOLD[ch] ?? ch);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** 1 = identical, 0 = nothing in common. Computed on folded strings. */
export function similarity(a: string, b: string): number {
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb) return 1;
  const max = Math.max(fa.length, fb.length);
  if (max === 0) return 1;
  return 1 - levenshtein(fa, fb) / max;
}

function wordsMatch(expected: string, heard: string, threshold: number): boolean {
  const fe = fold(expected);
  const fh = fold(heard);
  if (fe === fh) return true;
  // Very short words must match exactly after folding; "bu" vs "su" is not close enough.
  if (fe.length <= 3 || fh.length <= 3) return false;
  // Allow a clitic/suffix difference: "karagözüm" ≈ "karagöz".
  if (fe.length >= 5 && (fh.startsWith(fe) || fe.startsWith(fh))) {
    return Math.min(fe.length, fh.length) / Math.max(fe.length, fh.length) >= 0.6;
  }
  return similarity(fe, fh) >= threshold;
}

/**
 * Fuzzy LCS alignment: which expected words were heard, in order.
 * O(n·m) with n, m ≲ 40, so it is cheap enough to run on every interim result.
 */
export function alignWords(expected: string[], heard: string[], threshold: number): boolean[] {
  const n = expected.length;
  const m = heard.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const hit = wordsMatch(expected[i - 1]!, heard[j - 1]!, threshold) ? 1 : 0;
      dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]! + hit);
    }
  }
  const matched = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (dp[i]![j] === dp[i - 1]![j]) {
      i--;
    } else if (dp[i]![j] === dp[i]![j - 1]) {
      j--;
    } else {
      matched[i - 1] = true;
      i--;
      j--;
    }
  }
  return matched;
}

export interface LineMatch extends LineProgress {
  /** Index of the first expected word not yet heard, or tokens.length. */
  cursor: number;
}

/** Compare a spoken transcript against the expected line. */
export function matchLine(expected: string, spoken: string, opts: MatchOptions): LineMatch {
  const leniency = opts.leniency ?? 'normal';
  const originalWords = expected.trim().split(/\s+/).filter(Boolean);
  const expectedTokens = originalWords
    .map((w) => tokenize(w, opts.lang).join(''))
    .map((w) => w || '·');
  const heard = tokenize(spoken, opts.lang);
  const matched = alignWords(expectedTokens, heard, WORD_SIMILARITY[leniency]);
  const hits = matched.filter(Boolean).length;
  const ratio = expectedTokens.length ? hits / expectedTokens.length : 1;
  let passRatio = PASS_RATIO[leniency];
  // Songs are hard to recognise, but a third of the words is the floor.
  if (opts.song) passRatio = Math.max(0.34, passRatio * 0.6);
  // One- or two-word lines ("Aman!", "Evet efendim") pass on a single hit.
  if (expectedTokens.length <= 2) passRatio = Math.min(passRatio, 0.5);
  const cursor = matched.indexOf(false) === -1 ? matched.length : matched.indexOf(false);
  return {
    tokens: originalWords.map((word, k) => ({ word, matched: matched[k] ?? false })),
    ratio,
    passed: ratio >= passRatio,
    cursor,
  };
}

/** A fresh, nothing-heard-yet progress for a line. */
export function emptyProgress(expected: string): LineProgress {
  return {
    tokens: expected
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({ word, matched: false })),
    ratio: 0,
    passed: false,
  };
}
