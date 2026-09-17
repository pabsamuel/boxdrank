/**
 * Synthetic pose fixtures (POSE_MATCHING.md §9).
 *
 * Built in code rather than filmed: every transform we need to test (mirror,
 * scale, translation, one wrong limb, occlusion, delay) is exactly constructible
 * from one base pose, and a synthetic fixture cannot silently drift.
 */

import type { Landmark } from './types';
import { LANDMARK_COUNT, LM } from './types';

export interface PoseSpec {
  /** Angles in degrees, 0 = pointing right, 90 = pointing down (screen coords). */
  upperArmL?: number;
  forearmL?: number;
  upperArmR?: number;
  forearmR?: number;
  thighL?: number;
  thighR?: number;
  shinL?: number;
  shinR?: number;
  stanceWidth?: number;
}

const DEFAULTS: Required<PoseSpec> = {
  upperArmL: 170,
  forearmL: 170,
  upperArmR: 10,
  forearmR: 10,
  thighL: 95,
  thighR: 85,
  shinL: 90,
  shinR: 90,
  stanceWidth: 0.06,
};

function polar(from: { x: number; y: number }, deg: number, len: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * len, y: from.y + Math.sin(rad) * len };
}

/**
 * A standing figure in raw image space (0..1), centred at `center`, with body
 * size `scale` (roughly the torso length in image units).
 */
export function makePose(
  spec: PoseSpec = {},
  options: { center?: { x: number; y: number }; scale?: number; visibility?: number } = {},
): Landmark[] {
  const s = { ...DEFAULTS, ...spec };
  const center = options.center ?? { x: 0.5, y: 0.5 };
  const scale = options.scale ?? 0.2;
  const visibility = options.visibility ?? 1;

  const hipCenter = { x: center.x, y: center.y };
  const shoulderCenter = { x: center.x, y: center.y - scale };
  const shoulderHalf = scale * 0.45;
  const hipHalf = scale * 0.3;

  const leftShoulder = { x: shoulderCenter.x + shoulderHalf, y: shoulderCenter.y };
  const rightShoulder = { x: shoulderCenter.x - shoulderHalf, y: shoulderCenter.y };
  const leftHip = { x: hipCenter.x + hipHalf + s.stanceWidth * 0, y: hipCenter.y };
  const rightHip = { x: hipCenter.x - hipHalf, y: hipCenter.y };

  const upperArm = scale * 0.6;
  const forearm = scale * 0.55;
  const thigh = scale * 0.8;
  const shin = scale * 0.75;

  const leftElbow = polar(leftShoulder, s.upperArmL, upperArm);
  const leftWrist = polar(leftElbow, s.forearmL, forearm);
  const rightElbow = polar(rightShoulder, s.upperArmR, upperArm);
  const rightWrist = polar(rightElbow, s.forearmR, forearm);

  const leftKnee = polar(leftHip, s.thighL, thigh);
  const leftAnkle = polar(leftKnee, s.shinL, shin);
  const rightKnee = polar(rightHip, s.thighR, thigh);
  const rightAnkle = polar(rightKnee, s.shinR, shin);

  const points: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({
    x: center.x,
    y: center.y,
    z: 0,
    visibility,
  }));

  const put = (index: number, p: { x: number; y: number }) => {
    points[index] = { x: p.x, y: p.y, z: 0, visibility };
  };

  put(LM.nose, { x: shoulderCenter.x, y: shoulderCenter.y - scale * 0.35 });
  put(LM.leftEar, { x: shoulderCenter.x + scale * 0.1, y: shoulderCenter.y - scale * 0.3 });
  put(LM.rightEar, { x: shoulderCenter.x - scale * 0.1, y: shoulderCenter.y - scale * 0.3 });
  put(LM.leftShoulder, leftShoulder);
  put(LM.rightShoulder, rightShoulder);
  put(LM.leftElbow, leftElbow);
  put(LM.rightElbow, rightElbow);
  put(LM.leftWrist, leftWrist);
  put(LM.rightWrist, rightWrist);
  put(LM.leftHip, leftHip);
  put(LM.rightHip, rightHip);
  put(LM.leftKnee, leftKnee);
  put(LM.rightKnee, rightKnee);
  put(LM.leftAnkle, leftAnkle);
  put(LM.rightAnkle, rightAnkle);
  put(LM.leftFootIndex, { x: leftAnkle.x + scale * 0.12, y: leftAnkle.y + scale * 0.05 });
  put(LM.rightFootIndex, { x: rightAnkle.x - scale * 0.12, y: rightAnkle.y + scale * 0.05 });

  return points;
}

/** Mirror a raw pose horizontally, the way a selfie preview does. */
export function mirrorRaw(points: readonly Landmark[]): Landmark[] {
  return points.map((p) => ({ ...p, x: 1 - p.x }));
}

/** Hide a landmark, as if it left the frame. */
export function occlude(points: readonly Landmark[], indices: number[]): Landmark[] {
  const out = points.map((p) => ({ ...p }));
  for (const i of indices) {
    const p = out[i];
    if (p) p.visibility = 0.1;
  }
  return out;
}
