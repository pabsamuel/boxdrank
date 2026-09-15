/**
 * Every tunable number used by scoring lives here and nowhere else (CLAUDE.md rule 7).
 * If you are about to write a numeric literal into scoring code, put it here instead.
 */

import type { OffsetFeatureId, SegmentId } from '../pose-core/types';

export type Sensitivity = 'chill' | 'normal' | 'strict';

/** POSE_MATCHING.md §2a — per-segment weights in the overall score. */
export const SEGMENT_WEIGHTS: Record<SegmentId, number> = {
  upperArmL: 1.0,
  upperArmR: 1.0,
  forearmL: 1.0,
  forearmR: 1.0,
  thighL: 0.9,
  thighR: 0.9,
  shinL: 0.8,
  shinR: 0.8,
  torso: 1.2,
  head: 0.5,
  footL: 0.3,
  footR: 0.3,
};

/** POSE_MATCHING.md §3 — angular tolerances in degrees, before sensitivity scaling. */
export const TOLERANCE = {
  /** Anything within this is a perfect 1.0. */
  free: 12,
  /** This much error or worse scores 0. */
  zero: 60,
};

/** Multipliers applied to both tolerances (POSE_MATCHING.md §3). */
export const SENSITIVITY_SCALE: Record<Sensitivity, number> = {
  chill: 1.4,
  normal: 1.0,
  strict: 0.7,
};

/** POSE_MATCHING.md §4 — score -> colour band. */
export const BANDS = {
  green: 0.75,
  amber: 0.4,
};

/** Below this visibility, a landmark is treated as not seen (never scored red). */
export const MIN_VISIBILITY = 0.5;

/** POSE_MATCHING.md §1 — a torso shorter than this (normalised to frame height) is too far away. */
export const MIN_TORSO_LENGTH = 0.06;

/** POSE_MATCHING.md §5 — need this fraction of total segment weight to score a frame. */
export const MIN_SCORED_WEIGHT_FRACTION = 0.6;

/** POSE_MATCHING.md §5 — split between angle-based and offset-based contributions. */
export const OFFSET_CONTRIBUTION = 0.25;

/**
 * POSE_MATCHING.md §5 — how much the WORST visible segment drags the overall score.
 *
 * A plain weighted mean is too forgiving: one completely wrong forearm out of
 * twelve segments still reads ~0.89, so the app would tell a user "89%" while an
 * arm is pointing the wrong way. Blending in the worst segment makes a single
 * badly wrong limb cost what a person intuitively thinks it should.
 */
export const WORST_SEGMENT_CONTRIBUTION = 0.3;

/** Tolerances for the relative-offset features, in torso-lengths (POSE_MATCHING.md §2b). */
export const OFFSET_TOLERANCE: Record<OffsetFeatureId, { free: number; zero: number }> = {
  stanceWidth: { free: 0.15, zero: 0.8 },
  handSeparation: { free: 0.2, zero: 1.2 },
  handHeightL: { free: 0.15, zero: 0.9 },
  handHeightR: { free: 0.15, zero: 0.9 },
  crouch: { free: 0.15, zero: 0.9 },
};

/** POSE_MATCHING.md §7 — smoothing. */
export const SMOOTHING = {
  /** EMA factor for landmark positions before scoring. Higher = more responsive. */
  landmarkAlpha: 0.5,
  /** EMA factor for per-segment scores. */
  scoreAlpha: 0.35,
  /** Consecutive frames a new colour band must hold before the colour flips. */
  bandHysteresisFrames: 2,
};

/** POSE_MATCHING.md §6 — time alignment. */
export const ALIGNMENT = {
  /** Default capture->result latency in ms, until calibration measures the real one. */
  defaultLatencyMs: 70,
  /** Search this far either side of the expected reference frame for a better match. */
  toleranceWindowMs: 120,
};
