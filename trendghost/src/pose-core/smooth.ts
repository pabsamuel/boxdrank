/**
 * POSE_MATCHING.md §7 — smoothing for display.
 *
 * Raw per-frame scores flicker and the colours strobe, which is unreadable.
 * Note we smooth what the user SEES; the raw score is what gets stored for the
 * take-review graph.
 */

import { SMOOTHING } from '../config/scoring.config';
import { SEGMENT_IDS } from './features';
import { bandFor } from './score';
import type { FrameScore, Landmark, ScoreBand, SegmentId } from './types';

export class LandmarkSmoother {
  private previous: Landmark[] | null = null;

  reset(): void {
    this.previous = null;
  }

  apply(points: readonly Landmark[]): Landmark[] {
    const alpha = SMOOTHING.landmarkAlpha;
    if (!this.previous || this.previous.length !== points.length) {
      this.previous = points.map((p) => ({ ...p }));
      return this.previous;
    }
    const out = points.map((p, i) => {
      const prev = this.previous![i]!;
      return {
        x: prev.x + (p.x - prev.x) * alpha,
        y: prev.y + (p.y - prev.y) * alpha,
        z: prev.z + (p.z - prev.z) * alpha,
        visibility: p.visibility,
      };
    });
    this.previous = out;
    return out;
  }
}

interface BandState {
  shown: ScoreBand;
  candidate: ScoreBand;
  held: number;
}

/**
 * Smooths per-segment scores and applies colour hysteresis, so a limb hovering
 * on a threshold does not strobe between two colours.
 */
export class ScoreSmoother {
  private scores = new Map<SegmentId, number>();
  private bands = new Map<SegmentId, BandState>();
  private overall: number | null = null;

  reset(): void {
    this.scores.clear();
    this.bands.clear();
    this.overall = null;
  }

  apply(frame: FrameScore): FrameScore {
    const alpha = SMOOTHING.scoreAlpha;
    const segments = { ...frame.segments };

    for (const id of SEGMENT_IDS) {
      const raw = frame.segments[id];
      if (raw.score === null) {
        this.scores.delete(id);
        this.bands.delete(id);
        segments[id] = raw;
        continue;
      }
      const prev = this.scores.get(id);
      const smoothed = prev === undefined ? raw.score : prev + (raw.score - prev) * alpha;
      this.scores.set(id, smoothed);
      segments[id] = {
        score: smoothed,
        errorDeg: raw.errorDeg,
        band: this.stableBand(id, bandFor(smoothed)),
      };
    }

    let overall = frame.overall;
    if (overall !== null) {
      overall = this.overall === null ? overall : this.overall + (overall - this.overall) * alpha;
      this.overall = overall;
    } else {
      this.overall = null;
    }

    return { ...frame, overall, segments };
  }

  private stableBand(id: SegmentId, next: ScoreBand): ScoreBand {
    const state = this.bands.get(id);
    if (!state) {
      this.bands.set(id, { shown: next, candidate: next, held: 0 });
      return next;
    }
    if (next === state.shown) {
      state.candidate = next;
      state.held = 0;
      return state.shown;
    }
    if (next === state.candidate) {
      state.held += 1;
      if (state.held >= SMOOTHING.bandHysteresisFrames) {
        state.shown = next;
        state.held = 0;
      }
    } else {
      state.candidate = next;
      state.held = 1;
    }
    return state.shown;
  }
}
