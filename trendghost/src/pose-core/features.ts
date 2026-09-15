/**
 * POSE_MATCHING.md §2 — the features we actually compare.
 * Input poses must already be in `subject` space (see normalize.ts).
 */

import { MIN_VISIBILITY } from '../config/scoring.config';
import type {
  Landmark,
  NormalizedPose,
  OffsetFeatures,
  PoseFeatures,
  SegmentId,
  SegmentVectors,
} from './types';
import { LM } from './types';

/** proximal -> distal landmark pairs, per POSE_MATCHING.md §2a. */
export const SEGMENT_JOINTS: Record<SegmentId, [number, number]> = {
  upperArmL: [LM.leftShoulder, LM.leftElbow],
  upperArmR: [LM.rightShoulder, LM.rightElbow],
  forearmL: [LM.leftElbow, LM.leftWrist],
  forearmR: [LM.rightElbow, LM.rightWrist],
  thighL: [LM.leftHip, LM.leftKnee],
  thighR: [LM.rightHip, LM.rightKnee],
  shinL: [LM.leftKnee, LM.leftAnkle],
  shinR: [LM.rightKnee, LM.rightAnkle],
  torso: [-1, -2], // hipCenter -> shoulderCenter, handled specially
  head: [-2, LM.nose], // shoulderCenter -> nose
  footL: [LM.leftAnkle, LM.leftFootIndex],
  footR: [LM.rightAnkle, LM.rightFootIndex],
};

export const SEGMENT_IDS = Object.keys(SEGMENT_JOINTS) as SegmentId[];

function midpoint(a: Landmark | undefined, b: Landmark | undefined): Landmark | undefined {
  if (!a || !b) return undefined;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

function resolve(points: readonly Landmark[], index: number): Landmark | undefined {
  if (index === -1) return midpoint(points[LM.leftHip], points[LM.rightHip]);
  if (index === -2) return midpoint(points[LM.leftShoulder], points[LM.rightShoulder]);
  return points[index];
}

function unit(from: Landmark, to: Landmark): { x: number; y: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return { x: dx / len, y: dy / len };
}

export function extractFeatures(pose: NormalizedPose): PoseFeatures {
  const p = pose.points;
  const segments = {} as SegmentVectors;

  for (const id of SEGMENT_IDS) {
    const [fromIdx, toIdx] = SEGMENT_JOINTS[id];
    const from = resolve(p, fromIdx);
    const to = resolve(p, toIdx);
    if (
      !from ||
      !to ||
      from.visibility < MIN_VISIBILITY ||
      to.visibility < MIN_VISIBILITY ||
      pose.lowConfidence
    ) {
      segments[id] = null;
      continue;
    }
    segments[id] = unit(from, to);
  }

  return { segments, offsets: extractOffsets(pose) };
}

/** POSE_MATCHING.md §2b — what angles alone cannot see. */
function extractOffsets(pose: NormalizedPose): OffsetFeatures {
  const p = pose.points;
  const visible = (i: number) => {
    const lm = p[i];
    return lm && lm.visibility >= MIN_VISIBILITY && !pose.lowConfidence ? lm : undefined;
  };

  const la = visible(LM.leftAnkle);
  const ra = visible(LM.rightAnkle);
  const lw = visible(LM.leftWrist);
  const rw = visible(LM.rightWrist);
  const shoulderCenter = midpoint(visible(LM.leftShoulder), visible(LM.rightShoulder));

  const stanceWidth = la && ra ? Math.abs(la.x - ra.x) : null;
  const handSeparation = lw && rw ? Math.hypot(lw.x - rw.x, lw.y - rw.y) : null;
  const handHeightL = lw && shoulderCenter ? lw.y - shoulderCenter.y : null;
  const handHeightR = rw && shoulderCenter ? rw.y - shoulderCenter.y : null;
  // Hip centre is the origin in subject space, so this is just the ankle height.
  const crouch = la && ra ? (la.y + ra.y) / 2 : null;

  return { stanceWidth, handSeparation, handHeightL, handHeightR, crouch };
}
