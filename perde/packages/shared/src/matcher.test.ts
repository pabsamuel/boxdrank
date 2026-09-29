import { describe, expect, it } from 'vitest';
import { alignWords, fold, matchLine, normalizeText, similarity, tokenize } from './matcher';

describe('normalizeText', () => {
  it('lowercases with Turkish rules and strips punctuation', () => {
    expect(normalizeText('Yâr bana bir eğlence, İSTER MİSİN?', 'tr-TR')).toBe(
      'yâr bana bir eğlence ister misin',
    );
  });
  it('joins apostrophes so clitics survive', () => {
    expect(tokenize("Karagöz'üm, gel!", 'tr-TR')).toEqual(['karagözüm', 'gel']);
  });
  it('dotted capital I in Turkish becomes dotted i', () => {
    expect(normalizeText('İSTANBUL', 'tr-TR')).toBe('istanbul');
    expect(normalizeText('ISPARTA', 'tr-TR')).toBe('ısparta');
  });
});

describe('fold / similarity', () => {
  it('folds Turkish diacritics', () => {
    expect(fold('karagöz')).toBe('karagoz');
    expect(fold('şığçöü')).toBe('sigcou');
  });
  it('scores near words high and different words low', () => {
    expect(similarity('hacivat', 'hacıvat')).toBe(1);
    expect(similarity('eğlence', 'eglence')).toBe(1);
    expect(similarity('salıncak', 'salincak')).toBe(1);
    expect(similarity('kavak', 'kayık')).toBeLessThan(0.7);
  });
});

describe('alignWords', () => {
  it('marks words heard in order, tolerating extra words', () => {
    const exp = ['yar', 'bana', 'bir', 'eglence'];
    const heard = ['ya', 'yar', 'bana', 'sey', 'bir', 'eglence', 'aman'];
    expect(alignWords(exp, heard, 0.75)).toEqual([true, true, true, true]);
  });
  it('does not match short words fuzzily', () => {
    expect(alignWords(['bu'], ['su'], 0.5)).toEqual([false]);
  });
});

describe('matchLine', () => {
  it('passes an exact line', () => {
    const r = matchLine('Yâr bana bir eğlence!', 'yar bana bir eğlence', { lang: 'tr-TR' });
    expect(r.passed).toBe(true);
    expect(r.ratio).toBe(1);
    expect(r.tokens.map((t) => t.matched)).toEqual([true, true, true, true]);
    expect(r.cursor).toBe(4);
  });
  it('reports partial progress and a cursor for karaoke highlighting', () => {
    const r = matchLine('Aman Hacivat, sen de kim oluyorsun?', 'aman hacivat', { lang: 'tr-TR' });
    expect(r.tokens.slice(0, 2).every((t) => t.matched)).toBe(true);
    expect(r.cursor).toBe(2);
    expect(r.passed).toBe(false);
  });
  it('is lenient for kids', () => {
    const line = 'Hoş geldin Karagöz, safa geldin!';
    expect(matchLine(line, 'hoş geldin karagöz', { lang: 'tr-TR', leniency: 'kids' }).passed).toBe(
      true,
    );
    expect(
      matchLine(line, 'hoş geldin karagöz', { lang: 'tr-TR', leniency: 'strict' }).passed,
    ).toBe(false);
  });
  it('accepts diacritic-less recognition output', () => {
    const r = matchLine('Salıncak kuralım Hacivat!', 'salincak kuralim hacivat', { lang: 'tr-TR' });
    expect(r.passed).toBe(true);
  });
  it('accepts a suffix variation', () => {
    const r = matchLine('Karagözüm, buraya gel.', 'karagöz buraya gel', { lang: 'tr-TR' });
    expect(r.tokens[0]!.matched).toBe(true);
  });
  it('passes sung lines with little coverage', () => {
    const r = matchLine('Bir dilber görmüşüm, gönlümü almış', 'dilber', {
      lang: 'tr-TR',
      song: true,
    });
    expect(r.passed).toBe(false);
    const r2 = matchLine('Bir dilber görmüşüm, gönlümü almış', 'dilber görmüşüm gönlümü', {
      lang: 'tr-TR',
      song: true,
    });
    expect(r2.passed).toBe(true);
    // Two of seven words is not enough even for a song in kids mode.
    const r3 = matchLine('Perde kuruldu, mumlar yandı, gel Karagöz’üm gel!', 'perde kuruldu', {
      lang: 'tr-TR',
      song: true,
      leniency: 'kids',
    });
    expect(r3.passed).toBe(false);
  });
  it('passes one-word lines on a hit', () => {
    expect(matchLine('Aman!', 'aman', { lang: 'tr-TR', leniency: 'strict' }).passed).toBe(true);
  });
  it('works for English', () => {
    const r = matchLine("That's the way to do it!", 'thats the way to do it', { lang: 'en-GB' });
    expect(r.passed).toBe(true);
  });
  it('rejects unrelated speech', () => {
    const r = matchLine('Yâr bana bir eğlence!', 'bugün hava çok güzel', { lang: 'tr-TR' });
    expect(r.passed).toBe(false);
    expect(r.ratio).toBe(0);
  });
});
