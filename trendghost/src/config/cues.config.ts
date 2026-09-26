/**
 * Every cue timing constant lives here and nowhere else (CUE_ENGINE.md "Tuning knobs").
 */

export const CUES = {
  /** ms before a move starts that the `go` cue fires. Humans need ~300-500ms. */
  leadTimeMs: 450,
  /** ms before a move starts that the quiet `prepare` cue appears. */
  prepareLeadMs: 1800,
  /** Minimum gap between any two cues. */
  minCueGapMs: 600,
  /** A given correction cue will not repeat more often than this. */
  correctionCooldownMs: 2500,
  /** How long a `hold` cue counts down for, when the move is a sustained pose. */
  minHoldMs: 700,
  /** Snap `go`/`hit` cues to a detected beat within this window. */
  beatSnapWindowMs: 120,
  /** Score above which a move earns a `praise` cue. */
  praiseThreshold: 0.85,
  /** How long a cue stays on screen after firing. */
  displayMs: 1200,
};

/** CUE_ENGINE.md — segmentation of a timeline into moves. */
export const SEGMENTATION = {
  /** Velocity smoothing window, in frames. */
  smoothingFrames: 5,
  /** A key pose must be at least this far from the previous one, in seconds. */
  minKeyPoseGapSec: 0.45,
  /** Moves longer than this get split. */
  maxMoveSec: 4,
  /** Moves shorter than this get merged into their neighbour. */
  minMoveSec: 0.5,
  /**
   * A move whose peak velocity exceeds this and then drops below `stopVelocity`
   * is a sharp accent — a "cut it" (`hit`) cue rather than an ordinary `go`.
   */
  hitPeakVelocity: 0.9,
  stopVelocity: 0.25,
  /** A move whose peak velocity never exceeds this is a sustained `hold`. */
  holdVelocity: 0.3,
};
