/**
 * POSE_MATCHING.md §3–§5 — turning two poses into per-limb colours and one number.
 *
 * Rule that matters most: a limb we cannot see is `unknown` (grey), never red.
 * Fake red is worse than no feedback (RISKS.md R3).
 */

import {
  BANDS,
  MIN_SCORED_WEIGHT_FRACTION,
  OFFSET_CONTRIBUTION,
  OFFSET_TOLERANCE,
  SEGMENT_WEIGHTS,
  SENSITIVITY_SCALE,
  TOLERANCE,
  WORST_SEGMENT_CONTRIBUTION,
  type Sensitivity,
} from '../config/scoring.config';
import { SEGMENT_IDS } from './features';
import type {
  FrameScore,
  OffsetFeatureId,
  PoseFeatures,
  ScoreBand,
  SegmentId,
  SegmentScore,
} from './types';

const RAD_TO_DEG = 180 / Math.PI;
const OFFSET_IDS: OffsetFeatureId[] = [
  'stanceWidth',
  'handSeparation',
  'handHeightL',
  'handHeightR',
  'crouch',
];

export function bandFor(score: number | null): ScoreBand {
  if (score === null) return 'unknown';
  if (score >= BANDS.green) return 'green';
  if (score >= BANDS.amber) return 'amber';
  return 'red';
}

/** POSE_MATCHING.md §3 — one segment's angular error -> 0..1. */
export function scoreSegment(
  user: { x: number; y: number } | null,
  reference: { x: number; y: number } | null,
  sensitivity: Sensitivity = 'normal',
): SegmentScore {
  if (!user || !reference) return { score: null, errorDeg: null, band: 'unknown' };

  const scale = SENSITIVITY_SCALE[sensitivity];
  const free = TOLERANCE.free * scale;
  const zero = TOLERANCE.zero * scale;

  const dot = Math.max(-1, Math.min(1, user.x * reference.x + user.y * reference.y));
  const errorDeg = Math.acos(dot) * RAD_TO_DEG;
  const score = clamp01(1 - (errorDeg - free) / (zero - free));

  return { score, errorDeg, band: bandFor(score) };
}

function scoreOffset(
  user: number | null,
  reference: number | null,
  id: OffsetFeatureId,
  sensitivity: Sensitivity,
): number | null {
  if (user === null || reference === null) return null;
  const scale = SENSITIVITY_SCALE[sensitivity];
  const { free, zero } = OFFSET_TOLERANCE[id];
  const error = Math.abs(user - reference);
  return clamp01(1 - (error - free * scale) / (zero * scale - free * scale));
}

/** POSE_MATCHING.md §5 — the whole frame. */
export function scoreFrame(
  user: PoseFeatures,
  reference: PoseFeatures,
  sensitivity: Sensitivity = 'normal',
): FrameScore {
  const segments = {} as Record<SegmentId, SegmentScore>;
  let weighted = 0;
  let scoredWeight = 0;
  let totalWeight = 0;
  let worst = 1;

  for (const id of SEGMENT_IDS) {
    const weight = SEGMENT_WEIGHTS[id];
    totalWeight += weight;
    const result = scoreSegment(user.segments[id], reference.segments[id], sensitivity);
    segments[id] = result;
    if (result.score !== null) {
      weighted += result.score * weight;
      scoredWeight += weight;
      if (result.score < worst) worst = result.score;
    }
  }

  const offsets = {} as Record<OffsetFeatureId, number | null>;
  let offsetSum = 0;
  let offsetCount = 0;
  for (const id of OFFSET_IDS) {
    const value = scoreOffset(user.offsets[id], reference.offsets[id], id, sensitivity);
    offsets[id] = value;
    if (value !== null) {
      offsetSum += value;
      offsetCount += 1;
    }
  }

  const unscored = scoredWeight / totalWeight < MIN_SCORED_WEIGHT_FRACTION;
  if (unscored) {
    return { overall: null, segments, offsets, unscored: true };
  }

  // Blend the mean with the worst limb, so one badly wrong arm actually costs
  // something (config: WORST_SEGMENT_CONTRIBUTION).
  const mean = weighted / scoredWeight;
  const angleScore = mean * (1 - WORST_SEGMENT_CONTRIBUTION) + worst * WORST_SEGMENT_CONTRIBUTION;
  const overall =
    offsetCount > 0
      ? angleScore * (1 - OFFSET_CONTRIBUTION) + (offsetSum / offsetCount) * OFFSET_CONTRIBUTION
      : angleScore;

  return { overall, segments, offsets, unscored: false };
}

/** The worst-scoring visible segment — what a correction cue should talk about. */
export function worstSegment(score: FrameScore): { id: SegmentId; score: number } | null {
  let worst: { id: SegmentId; score: number } | null = null;
  for (const id of SEGMENT_IDS) {
    const s = score.segments[id].score;
    if (s === null) continue;
    if (!worst || s < worst.score) worst = { id, score: s };
  }
  return worst;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
