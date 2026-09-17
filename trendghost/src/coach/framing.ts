/**
 * Phase 5 — the framing coach. Get the user trackable BEFORE scoring starts, so
 * we never paint someone red who was never visible (RISKS.md R3).
 *
 * Pure function over a raw pose + frame stats, so it is unit testable.
 */

import { MIN_VISIBILITY } from '../config/scoring.config';
import type { Landmark } from '../pose-core/types';
import { LM } from '../pose-core/types';

export type FramingCheckId = 'person' | 'fullBody' | 'distance' | 'angle' | 'lighting';

export interface FramingCheck {
  id: FramingCheckId;
  ok: boolean;
  /** One plain-English instruction. Shown one at a time, most important first. */
  fix: string;
}

export interface FramingOptions {
  /** Photo mode can accept an upper-body-only target. */
  requireFullBody?: boolean;
  /** Mean luminance of the frame, 0..1. Omit to skip the lighting check. */
  luminance?: number;
}

const TARGET_TORSO = { min: 0.12, max: 0.42 };

/** Checks are returned in priority order: fix the first failing one. */
export function checkFraming(
  landmarks: readonly Landmark[] | null,
  options: FramingOptions = {},
): FramingCheck[] {
  const requireFullBody = options.requireFullBody ?? true;

  if (!landmarks) {
    return [{ id: 'person', ok: false, fix: 'Step into the frame so I can see you' }];
  }

  const visible = (i: number) => (landmarks[i]?.visibility ?? 0) >= MIN_VISIBILITY;
  const at = (i: number) => landmarks[i];

  const checks: FramingCheck[] = [];

  const coreVisible =
    visible(LM.leftShoulder) &&
    visible(LM.rightShoulder) &&
    visible(LM.leftHip) &&
    visible(LM.rightHip);
  checks.push({
    id: 'person',
    ok: coreVisible,
    fix: 'Step into the frame so I can see you',
  });

  const head = visible(LM.nose);
  const feet = visible(LM.leftAnkle) && visible(LM.rightAnkle);
  const inBounds = [LM.nose, LM.leftAnkle, LM.rightAnkle, LM.leftWrist, LM.rightWrist].every(
    (i) => {
      const p = at(i);
      return (
        !p ||
        p.visibility < MIN_VISIBILITY ||
        (p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98)
      );
    },
  );
  checks.push({
    id: 'fullBody',
    ok: requireFullBody ? head && feet && inBounds : head && coreVisible,
    fix: !head
      ? 'Tilt the phone up a little'
      : !feet
        ? 'Step back so your feet are in frame'
        : 'Move to the middle of the frame',
  });

  const ls = at(LM.leftShoulder);
  const rs = at(LM.rightShoulder);
  const lh = at(LM.leftHip);
  const rh = at(LM.rightHip);
  let torsoLength = 0;
  if (ls && rs && lh && rh) {
    const shoulderY = (ls.y + rs.y) / 2;
    const hipY = (lh.y + rh.y) / 2;
    const shoulderX = (ls.x + rs.x) / 2;
    const hipX = (lh.x + rh.x) / 2;
    torsoLength = Math.hypot(shoulderX - hipX, shoulderY - hipY);
  }
  checks.push({
    id: 'distance',
    ok: torsoLength >= TARGET_TORSO.min && torsoLength <= TARGET_TORSO.max,
    fix: torsoLength < TARGET_TORSO.min ? 'Come a bit closer' : 'Step back a bit',
  });

  // Camera height/tilt: with a roughly level phone, shoulders sit above hips by
  // most of the torso length. A steep floor-up or ceiling-down angle squashes that.
  const verticalRatio =
    torsoLength > 0 && ls && rs && lh && rh
      ? Math.abs((lh.y + rh.y) / 2 - (ls.y + rs.y) / 2) / torsoLength
      : 1;
  checks.push({
    id: 'angle',
    ok: verticalRatio > 0.75,
    fix: 'Prop your phone about waist height, pointing straight at you',
  });

  if (options.luminance !== undefined) {
    checks.push({
      id: 'lighting',
      ok: options.luminance > 0.12,
      fix: 'Turn on a light — it is too dark to track you',
    });
  }

  return checks;
}

export function firstProblem(checks: FramingCheck[]): FramingCheck | null {
  return checks.find((c) => !c.ok) ?? null;
}

export function allClear(checks: FramingCheck[]): boolean {
  return checks.every((c) => c.ok);
}

/**
 * Mean luminance for the lighting check.
 *
 * Deliberately samples a tiny (32x32) offscreen canvas rather than the visible
 * stage: `getImageData` on the render canvas forces a GPU readback and stalls the
 * pipeline — measured at ~2fps in a software-GL browser before this moved off the
 * stage (PERFORMANCE_BUDGET.md).
 */
export class LuminanceSampler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private lastSampleAt = 0;
  private lastValue = 0.5;

  /** Samples at most every `intervalMs`; otherwise returns the last reading. */
  sample(source: CanvasImageSource, intervalMs = 500): number {
    const now = performance.now();
    if (now - this.lastSampleAt < intervalMs) return this.lastValue;
    this.lastSampleAt = now;

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 32;
      this.canvas.height = 32;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.ctx) return this.lastValue;

    try {
      this.ctx.drawImage(source, 0, 0, 32, 32);
      const { data } = this.ctx.getImageData(0, 0, 32, 32);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
      }
      this.lastValue = sum / (data.length / 4);
    } catch {
      // Source not ready yet: keep the previous reading.
    }
    return this.lastValue;
  }
}
