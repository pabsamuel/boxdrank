/**
 * POSE_MATCHING.md §1 — normalisation into `subject` space.
 * Kills body size, camera distance, position in frame and camera roll.
 */

import { MIN_TORSO_LENGTH, MIN_VISIBILITY } from '../config/scoring.config';
import type { Landmark, NormalizedPose } from './types';
import { LM } from './types';

const SCORED_LANDMARKS = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
];

/**
 * Convert raw model landmarks into the space we score in.
 *
 * `mirrored` says whether the incoming landmarks came from a mirrored preview.
 * This is the ONLY place a horizontal flip happens (CLAUDE.md rule 8).
 */
export function toSubjectSpace(raw: readonly Landmark[], mirrored: boolean): NormalizedPose {
  const points: Landmark[] = raw.map((p) => ({
    x: mirrored ? 1 - p.x : p.x,
    y: p.y,
    z: mirrored ? -p.z : p.z,
    visibility: p.visibility,
  }));

  const lh = points[LM.leftHip];
  const rh = points[LM.rightHip];
  const ls = points[LM.leftShoulder];
  const rs = points[LM.rightShoulder];

  if (!lh || !rh || !ls || !rs) {
    return unscorable(points);
  }

  const hipCenter = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const shoulderCenter = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

  const dx = shoulderCenter.x - hipCenter.x;
  const dy = shoulderCenter.y - hipCenter.y;
  const torsoLength = Math.hypot(dx, dy);

  const coreVisible =
    Math.min(lh.visibility, rh.visibility, ls.visibility, rs.visibility) >= MIN_VISIBILITY;

  if (torsoLength < MIN_TORSO_LENGTH || !coreVisible) {
    return {
      points,
      hipCenter,
      torsoLength,
      rollAngle: 0,
      lowConfidence: true,
    };
  }

  // Rotate so hip->shoulder points straight up (screen -y). This removes camera
  // roll and a tilted phone; a genuine body lean survives because the limbs are
  // then measured against a torso that leaned with them.
  const rollAngle = Math.atan2(dx, -dy);
  const cos = Math.cos(-rollAngle);
  const sin = Math.sin(-rollAngle);

  const normalized: Landmark[] = points.map((p) => {
    const tx = (p.x - hipCenter.x) / torsoLength;
    const ty = (p.y - hipCenter.y) / torsoLength;
    return {
      x: tx * cos - ty * sin,
      y: tx * sin + ty * cos,
      z: p.z / torsoLength,
      visibility: p.visibility,
    };
  });

  return {
    points: normalized,
    hipCenter,
    torsoLength,
    rollAngle,
    lowConfidence: false,
  };
}

function unscorable(points: Landmark[]): NormalizedPose {
  return {
    points,
    hipCenter: { x: 0.5, y: 0.5 },
    torsoLength: 0,
    rollAngle: 0,
    lowConfidence: true,
  };
}

/** Mean visibility across the landmarks we actually score. */
export function meanConfidence(raw: readonly Landmark[]): number {
  let sum = 0;
  let n = 0;
  for (const i of SCORED_LANDMARKS) {
    const p = raw[i];
    if (p) {
      sum += p.visibility;
      n += 1;
    }
  }
  return n === 0 ? 0 : sum / n;
}
