/**
 * CUE_ENGINE.md — building the cue track and firing it against the playback clock.
 *
 * The whole point: a cue fires BEFORE its move. Colour reports the present, which
 * is always slightly too late; cues report what's coming.
 */

import { CUES } from '../config/cues.config';
import type { Move } from './segment';
import { ACCENTS, WHOLE_BODY, movePhrase } from './phrases';

export type CueType =
  'prepare' | 'go' | 'hold' | 'hit' | 'correct' | 'transition' | 'praise' | 'count';

/** Higher wins when two cues collide (CUE_ENGINE.md "Cue types"). */
export const CUE_PRIORITY: Record<CueType, number> = {
  hit: 70,
  go: 60,
  hold: 50,
  correct: 40,
  transition: 30,
  prepare: 20,
  praise: 10,
  count: 65,
};

export interface Cue {
  id: string;
  type: CueType;
  text: string;
  /** Reference-time seconds at which this cue should fire. */
  at: number;
  /** The move it belongs to, if any. */
  moveIndex?: number;
  /** Whether this cue should be spoken and buzzed. */
  voice: boolean;
  haptic: boolean;
}

export interface CueTrackOptions {
  /** Detected beat times in seconds, if we have them. */
  beats?: number[];
  /** Count-in before the routine starts. */
  countIn?: boolean;
}

/** Build the whole cue track once, at ingest. */
export function buildCueTrack(moves: Move[], options: CueTrackOptions = {}): Cue[] {
  const cues: Cue[] = [];
  const lead = CUES.leadTimeMs / 1000;
  const prepareLead = CUES.prepareLeadMs / 1000;

  moves.forEach((move) => {
    const text = phraseForMove(move);
    const goAt = snapToBeat(move.startTime - lead, options.beats);

    if (move.startTime - prepareLead > 0) {
      cues.push({
        id: `prepare-${move.index}`,
        type: 'prepare',
        text: `${text} next`,
        at: move.startTime - prepareLead,
        moveIndex: move.index,
        voice: false,
        haptic: false,
      });
    }

    if (move.kind === 'hit') {
      cues.push({
        id: `hit-${move.index}`,
        type: 'hit',
        text: ACCENTS.hit,
        at: goAt,
        moveIndex: move.index,
        voice: true,
        haptic: true,
      });
    } else if (move.kind === 'hold') {
      cues.push({
        id: `hold-${move.index}`,
        type: 'hold',
        text: ACCENTS.hold,
        at: goAt,
        moveIndex: move.index,
        voice: true,
        haptic: false,
      });
    } else {
      cues.push({
        id: `go-${move.index}`,
        type: 'go',
        text,
        at: goAt,
        moveIndex: move.index,
        voice: true,
        haptic: true,
      });
    }
  });

  // One cue at a time: drop the lower-priority of any pair that collides.
  return resolveCollisions(cues);
}

function phraseForMove(move: Move): string {
  if (move.wholeBody.length > 0) {
    const key = move.wholeBody[0]!;
    return WHOLE_BODY[key];
  }
  const driver = move.drivers[0];
  if (!driver) return ACCENTS.go;
  return movePhrase(driver.segment, driver.direction);
}

function snapToBeat(time: number, beats?: number[]): number {
  if (!beats || beats.length === 0) return time;
  const window = CUES.beatSnapWindowMs / 1000;
  let best = time;
  let bestDistance = window;
  for (const beat of beats) {
    const distance = Math.abs(beat - time);
    if (distance < bestDistance) {
      best = beat;
      bestDistance = distance;
    }
  }
  return best;
}

export function resolveCollisions(cues: Cue[]): Cue[] {
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const gap = CUES.minCueGapMs / 1000;
  const kept: Cue[] = [];

  for (const cue of sorted) {
    const previous = kept[kept.length - 1];
    if (previous && cue.at - previous.at < gap) {
      if (CUE_PRIORITY[cue.type] > CUE_PRIORITY[previous.type]) kept[kept.length - 1] = cue;
      continue;
    }
    kept.push(cue);
  }

  return kept;
}

/**
 * Walks the cue track as the clock advances.
 *
 * Scheduling is done against reference time, not wall time, so scrubbing and
 * speed changes need no special handling — `update` is simply called with the
 * new clock time and fires whatever was crossed.
 */
export class CuePlayer {
  private cursor = 0;
  private lastCorrectionAt = -Infinity;

  constructor(private track: Cue[] = []) {}

  setTrack(track: Cue[]): void {
    this.track = track;
    this.reset();
  }

  reset(): void {
    this.cursor = 0;
    this.lastCorrectionAt = -Infinity;
  }

  /** Call after any seek so we don't fire every cue we skipped over. */
  seek(time: number): void {
    this.cursor = this.track.findIndex((c) => c.at > time);
    if (this.cursor === -1) this.cursor = this.track.length;
  }

  /** Returns the cues crossed since the last call. */
  update(time: number): Cue[] {
    const fired: Cue[] = [];
    while (this.cursor < this.track.length && this.track[this.cursor]!.at <= time) {
      fired.push(this.track[this.cursor]!);
      this.cursor += 1;
    }
    return fired;
  }

  /**
   * Corrections come from live scoring, not the track, so they get their own
   * cooldown — a coach who repeats the same note every frame is just noise.
   */
  maybeCorrect(text: string, now: number): Cue | null {
    if (now - this.lastCorrectionAt < CUES.correctionCooldownMs / 1000) return null;
    this.lastCorrectionAt = now;
    return {
      id: `correct-${now.toFixed(2)}`,
      type: 'correct',
      text,
      at: now,
      voice: false,
      haptic: false,
    };
  }
}
