import type { Culture, CulturePack, Play, Puppet } from '@perde/shared';
import { packTr } from './tr';
import { packEn } from './en';
import { packId } from './id';

/**
 * Registry of every culture pack. Order = order shown in the lobby.
 * Adding a tradition means adding a folder and one line here.
 */
export const packs: CulturePack[] = [packTr, packEn, packId];

export const cultures: Culture[] = packs.map((p) => p.culture);

export function getPack(cultureId: string): CulturePack | undefined {
  return packs.find((p) => p.culture.id === cultureId);
}

export function getPuppet(cultureId: string, puppetId: string): Puppet | undefined {
  return getPack(cultureId)?.puppets.find((p) => p.id === puppetId);
}

export function getPlay(cultureId: string, playId: string): Play | undefined {
  return getPack(cultureId)?.plays.find((p) => p.id === playId);
}

export const allPlays: Play[] = packs.flatMap((p) => p.plays);
export const allPuppets: Puppet[] = packs.flatMap((p) => p.puppets);

export type Plan = 'free' | 'plus';

/** Free users get the non-premium items; Plus unlocks everything. */
export function isUnlocked(item: { premium: boolean }, plan: Plan): boolean {
  return plan === 'plus' || !item.premium;
}

export { packTr } from './tr';
export { packEn } from './en';
export { packId } from './id';
