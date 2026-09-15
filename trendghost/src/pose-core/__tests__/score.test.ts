/**
 * The 7 fixtures from POSE_MATCHING.md §9.
 * Case 5 (one wrong arm) is the product promise: if it fails, nothing else matters.
 */

import { describe, expect, it } from 'vitest';
import { extractFeatures } from '../features';
import { toSubjectSpace } from '../normalize';
import { scoreFrame } from '../score';
import { makePose, mirrorRaw, occlude } from '../testing';
import { LM } from '../types';

const features = (raw: Parameters<typeof toSubjectSpace>[0], mirrored = false) =>
  extractFeatures(toSubjectSpace(raw, mirrored));

describe('POSE_MATCHING §9 fixtures', () => {
  it('1. identity — a pose scored against itself is ~perfect', () => {
    const pose = features(makePose());
    const result = scoreFrame(pose, pose);
    expect(result.unscored).toBe(false);
    expect(result.overall).toBeGreaterThanOrEqual(0.98);
  });

  // Strongly asymmetric: left arm straight up, right arm straight down, legs apart.
  const ASYMMETRIC = { upperArmL: 250, forearmL: 250, upperArmR: 80, forearmR: 80, thighL: 115 };

  it('2. mirror — a mirrored capture in mirror mode matches the reference', () => {
    const reference = features(makePose(ASYMMETRIC));
    const user = features(mirrorRaw(makePose(ASYMMETRIC)), true);
    expect(scoreFrame(user, reference).overall).toBeGreaterThanOrEqual(0.95);
  });

  it('2b. mirror — an asymmetric pose scores clearly worse when NOT un-mirrored', () => {
    const reference = features(makePose(ASYMMETRIC));
    const uncorrected = features(mirrorRaw(makePose(ASYMMETRIC)), false);
    expect(scoreFrame(uncorrected, reference).overall).toBeLessThan(0.7);
  });

  it('3. scale — the same pose at 2m and 4m scores the same', () => {
    const near = features(makePose({}, { scale: 0.3 }));
    const far = features(makePose({}, { scale: 0.15 }));
    expect(scoreFrame(far, near).overall).toBeGreaterThanOrEqual(0.9);
  });

  it('4. translation — left of frame vs right of frame does not matter', () => {
    const left = features(makePose({}, { center: { x: 0.25, y: 0.5 } }));
    const right = features(makePose({}, { center: { x: 0.75, y: 0.5 } }));
    expect(scoreFrame(left, right).overall).toBeGreaterThanOrEqual(0.95);
  });

  it('5. one wrong arm — that limb is red, everything else stays green', () => {
    const reference = features(makePose());
    const user = features(makePose({ forearmL: 80 })); // left forearm ~90 degrees off

    const result = scoreFrame(user, reference);

    expect(result.segments.forearmL.score).toBeLessThan(0.4);
    expect(result.segments.forearmL.band).toBe('red');

    for (const id of ['upperArmR', 'forearmR', 'thighL', 'thighR', 'torso'] as const) {
      expect(result.segments[id].score, `${id} should be unaffected`).toBeGreaterThan(0.8);
    }

    expect(result.overall).toBeGreaterThan(0.6);
    expect(result.overall).toBeLessThan(0.85);
  });

  it('6. occlusion — a limb out of frame is unknown, never red', () => {
    const reference = features(makePose());
    const user = features(occlude(makePose(), [LM.leftElbow, LM.leftWrist]));

    const result = scoreFrame(user, reference);

    expect(result.segments.forearmL.score).toBeNull();
    expect(result.segments.forearmL.band).toBe('unknown');
    expect(result.segments.upperArmL.band).toBe('unknown');
    expect(result.segments.thighR.band).toBe('green');
  });

  it('6b. most of the body missing — the frame is unscored, not zero', () => {
    const reference = features(makePose());
    const user = features(
      occlude(makePose(), [
        LM.leftElbow,
        LM.leftWrist,
        LM.rightElbow,
        LM.rightWrist,
        LM.leftKnee,
        LM.leftAnkle,
        LM.rightKnee,
        LM.rightAnkle,
        LM.leftFootIndex,
        LM.rightFootIndex,
      ]),
    );

    const result = scoreFrame(user, reference);
    expect(result.unscored).toBe(true);
    expect(result.overall).toBeNull();
  });

  it('offsets — same limb angles but a much wider stance scores lower', () => {
    const narrow = features(makePose({ thighL: 95, thighR: 85, shinL: 90, shinR: 90 }));
    const wide = features(makePose({ thighL: 120, thighR: 60, shinL: 90, shinR: 90 }));
    const identical = scoreFrame(narrow, narrow).overall!;
    const different = scoreFrame(wide, narrow).overall!;
    expect(different).toBeLessThan(identical);
  });
});
