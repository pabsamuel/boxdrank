import { describe, expect, it } from 'vitest';
import { countLines, flattenLines, orderParts, wordCount } from '@perde/shared';
import {
  allPlays,
  allPuppets,
  cultures,
  getPack,
  getPlay,
  getPuppet,
  isUnlocked,
  packs,
} from './index';
import { lintContent, MAX_WORDS_PER_LINE } from './validate';

describe('content packs', () => {
  it('registers the Turkish, English and Indonesian packs', () => {
    expect(cultures.map((c) => c.id)).toEqual(['tr', 'en', 'id']);
    expect(getPack('tr')?.plays.length).toBeGreaterThanOrEqual(4);
    expect(getPack('en')?.plays.length).toBeGreaterThanOrEqual(1);
    expect(getPack('id')?.plays.length).toBeGreaterThanOrEqual(1);
    expect(getPack('id')?.puppets.map((p) => p.id)).toEqual(['semar', 'petruk', 'rama', 'hanoman']);
  });

  it('has no cross-reference errors', () => {
    const errors = lintContent().filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
  });

  it('keeps every line short enough for children and speech recognition', () => {
    for (const play of allPlays) {
      for (const { line } of flattenLines(play)) {
        expect(wordCount(line.text), `${play.id}: ${line.text}`).toBeLessThanOrEqual(
          MAX_WORDS_PER_LINE,
        );
      }
    }
  });

  it('ships free content in the Turkish pack', () => {
    const free = getPack('tr')!.plays.filter((p) => !p.premium);
    expect(free.map((p) => p.id)).toEqual(['giris', 'salincak']);
    expect(isUnlocked(getPlay('tr', 'kayik')!, 'free')).toBe(false);
    expect(isUnlocked(getPlay('tr', 'kayik')!, 'plus')).toBe(true);
  });

  it('every puppet has a body root and orders parents before children', () => {
    for (const puppet of allPuppets) {
      const ordered = orderParts(puppet);
      expect(ordered[0]!.id, puppet.id).toBe('body');
      const seen = new Set<string>();
      for (const part of ordered) {
        if (part.parent) expect(seen.has(part.parent), `${puppet.id}/${part.id}`).toBe(true);
        seen.add(part.id);
      }
    }
  });

  it('every play resolves its puppets', () => {
    for (const pack of packs) {
      for (const play of pack.plays) {
        for (const c of play.characters) {
          expect(getPuppet(pack.culture.id, c.puppetId), `${play.id}/${c.seat}`).toBeDefined();
        }
        expect(countLines(play)).toBeGreaterThan(5);
      }
    }
  });
});
