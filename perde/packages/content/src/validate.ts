import { wordCount } from '@perde/shared';
import { packs } from './index';

/**
 * Content lint, run by `pnpm validate:content` and CI. Schema parsing already
 * happened at import time (each pack calls .parse), so this checks the
 * cross-references and the editorial rules from docs/CONTENT_GUIDE.md.
 */
export interface ContentIssue {
  level: 'error' | 'warn';
  where: string;
  message: string;
}

export const MAX_WORDS_PER_LINE = 14;

export function lintContent(): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const pack of packs) {
    const cid = pack.culture.id;
    const puppetIds = new Set(pack.puppets.map((p) => p.id));
    for (const seat of pack.culture.defaultSeats) {
      if (!puppetIds.has(seat.puppetId)) {
        issues.push({
          level: 'error',
          where: `${cid}/culture.defaultSeats`,
          message: `unknown puppet ${seat.puppetId}`,
        });
      }
    }
    for (const puppet of pack.puppets) {
      if (puppet.cultureId !== cid) {
        issues.push({
          level: 'error',
          where: `${cid}/puppets/${puppet.id}`,
          message: `cultureId is ${puppet.cultureId}`,
        });
      }
      if (!puppet.parts.some((p) => p.driver === 'arm')) {
        issues.push({
          level: 'warn',
          where: `${cid}/puppets/${puppet.id}`,
          message: 'no part is driven by the arm axis',
        });
      }
      if (!puppet.parts.some((p) => p.driver === 'talk')) {
        issues.push({
          level: 'warn',
          where: `${cid}/puppets/${puppet.id}`,
          message: 'no part is driven by talking',
        });
      }
    }
    const playIds = new Set<string>();
    for (const play of pack.plays) {
      const where = `${cid}/plays/${play.id}`;
      if (playIds.has(play.id))
        issues.push({ level: 'error', where, message: 'duplicate play id' });
      playIds.add(play.id);
      if (play.cultureId !== cid)
        issues.push({ level: 'error', where, message: `cultureId is ${play.cultureId}` });
      if (play.lang !== pack.culture.lang) {
        issues.push({
          level: 'warn',
          where,
          message: `play lang ${play.lang} differs from culture lang ${pack.culture.lang}`,
        });
      }
      for (const c of play.characters) {
        if (!puppetIds.has(c.puppetId)) {
          issues.push({
            level: 'error',
            where: `${where}/characters/${c.seat}`,
            message: `unknown puppet ${c.puppetId}`,
          });
        }
      }
      play.sections.forEach((s, si) =>
        s.lines.forEach((l, li) => {
          const n = wordCount(l.text);
          if (n > MAX_WORDS_PER_LINE) {
            issues.push({
              level: 'warn',
              where: `${where}/${s.id}#${li + 1}`,
              message: `${n} words (max ${MAX_WORDS_PER_LINE}) — split the line: "${l.text}"`,
            });
          }
          if (si === 0 && li === 0 && l.seat !== play.characters[0]?.seat) {
            issues.push({
              level: 'warn',
              where: `${where}/${s.id}#1`,
              message: 'first line is not spoken by the first character',
            });
          }
        }),
      );
    }
  }
  return issues;
}
