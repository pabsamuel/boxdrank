/**
 * Core pose types. Pure data — no DOM, no camera, no React (DECISIONS.md D2).
 *
 * Coordinate spaces (POSE_MATCHING.md §0), stated explicitly everywhere:
 *   raw      — as the model emits: x,y in 0..1 image coords, z relative depth
 *   mirrored — raw with x -> 1-x (what a selfie preview shows)
 *   subject  — hip-centred, torso-scaled, roll-removed. ALL scoring happens here.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** Model confidence that this landmark is present and correctly placed, 0..1. */
  visibility: number;
}

/** MediaPipe's 33-point pose landmark indices. */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** A pose in `subject` space, plus the scale/offset that got it there. */
export interface NormalizedPose {
  /** Landmarks in subject space. Index-aligned with the raw input. */
  points: Landmark[];
  /** Where the hip centre was, in the source space (used to place the ghost). */
  hipCenter: { x: number; y: number };
  /** Distance hipCenter -> shoulderCenter in the source space (the scale unit). */
  torsoLength: number;
  /** Image-plane rotation removed, radians. */
  rollAngle: number;
  /** True when the pose is too small / too occluded to score (POSE_MATCHING.md §1). */
  lowConfidence: boolean;
}

/** One frame of a reference routine, on the fixed 30fps grid. */
export interface TimelineFrame {
  /** Seconds from the start of the routine. */
  t: number;
  pose: NormalizedPose;
  /** Mean visibility across the scored landmarks, 0..1. */
  confidence: number;
}

export const TIMELINE_FPS = 30;

export interface PoseTimeline {
  version: 1;
  id: string;
  name: string;
  /** Seconds. */
  duration: number;
  sourceFps: number;
  createdAt: number;
  fps: typeof TIMELINE_FPS;
  frames: TimelineFrame[];
  /** Fraction of frames that were too low-confidence to use, 0..1. */
  lowConfidenceRatio: number;
}

/** The 13 limb segments we score (POSE_MATCHING.md §2a). */
export type SegmentId =
  | 'upperArmL'
  | 'upperArmR'
  | 'forearmL'
  | 'forearmR'
  | 'thighL'
  | 'thighR'
  | 'shinL'
  | 'shinR'
  | 'torso'
  | 'head'
  | 'footL'
  | 'footR';

export type OffsetFeatureId =
  'stanceWidth' | 'handSeparation' | 'handHeightL' | 'handHeightR' | 'crouch';

/** Direction vectors per segment, in subject space. `null` = endpoints not visible. */
export type SegmentVectors = Record<SegmentId, { x: number; y: number } | null>;
export type OffsetFeatures = Record<OffsetFeatureId, number | null>;

export interface PoseFeatures {
  segments: SegmentVectors;
  offsets: OffsetFeatures;
}

export type ScoreBand = 'green' | 'amber' | 'red' | 'unknown';

export interface SegmentScore {
  /** 0..1, or null when the segment could not be compared. */
  score: number | null;
  /** Angular error in degrees, or null. Shown in the debug panel. */
  errorDeg: number | null;
  band: ScoreBand;
}

export interface FrameScore {
  /** 0..1 overall, or null when too little of the body was visible to judge. */
  overall: number | null;
  segments: Record<SegmentId, SegmentScore>;
  offsets: Record<OffsetFeatureId, number | null>;
  /** True when we could not score this frame at all — show "I can't see you". */
  unscored: boolean;
}
