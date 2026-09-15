/**
 * Every word the coach says, in one file, so the wording of the whole app can be
 * edited by a non-programmer without touching logic (CUE_ENGINE.md).
 *
 * Rules: three words or fewer, imperative, a fix not a complaint, and the side is
 * always the side the user sees in their current mirror mode.
 */

import type { SegmentId } from '../pose-core/types';

export type Direction = 'up' | 'down' | 'out' | 'in' | 'across' | 'back';
export type Magnitude = 'small' | 'large';

const SIDE: Partial<Record<SegmentId, 'left' | 'right'>> = {
  upperArmL: 'left',
  forearmL: 'left',
  thighL: 'left',
  shinL: 'left',
  footL: 'left',
  upperArmR: 'right',
  forearmR: 'right',
  thighR: 'right',
  shinR: 'right',
  footR: 'right',
};

const LIMB: Record<SegmentId, string> = {
  upperArmL: 'arm',
  upperArmR: 'arm',
  forearmL: 'arm',
  forearmR: 'arm',
  thighL: 'leg',
  thighR: 'leg',
  shinL: 'leg',
  shinR: 'leg',
  footL: 'foot',
  footR: 'foot',
  torso: 'body',
  head: 'head',
};

const MOVE_VERB: Record<Direction, string> = {
  up: 'up',
  down: 'down',
  out: 'out',
  in: 'in',
  across: 'across',
  back: 'back',
};

/** "left arm up" — what's coming next. */
export function movePhrase(segment: SegmentId, direction: Direction): string {
  const side = SIDE[segment];
  const limb = LIMB[segment];
  const verb = MOVE_VERB[direction];
  if (segment === 'torso') return direction === 'down' ? 'drop low' : `turn ${verb}`;
  if (segment === 'head') return `look ${verb}`;
  return side ? `${side} ${limb} ${verb}` : `${limb} ${verb}`;
}

/** "left arm higher" — a fix for something currently wrong. */
export function correctionPhrase(segment: SegmentId, magnitude: Magnitude): string {
  const side = SIDE[segment];
  const limb = LIMB[segment];
  const suffix = magnitude === 'small' ? 'a bit off' : 'not there yet';
  if (segment === 'torso') return `square up — ${suffix}`;
  return side ? `${side} ${limb} — ${suffix}` : `${limb} — ${suffix}`;
}

export const WHOLE_BODY = {
  crouchDown: 'drop low',
  crouchUp: 'stand tall',
  stanceOut: 'step out',
  stanceIn: 'feet together',
  handsApart: 'arms wide',
  handsTogether: 'hands in',
};

export const ACCENTS = {
  hit: 'cut it',
  freeze: 'freeze',
  hold: 'hold it',
  go: 'now',
  praise: 'clean',
  again: 'again',
  cantSeeYou: "I can't see you",
};

export function countIn(hasBeat: boolean): string[] {
  return hasBeat ? ['5', '6', '7', '8'] : ['3', '2', '1'];
}
