/**
 * CUE_ENGINE.md "Where cues come from", steps 1-2.
 * Split a routine into teachable moves and classify each one.
 * Pure functions over a PoseTimeline — no DOM, unit tested.
 */

import { SEGMENTATION } from '../config/cues.config';
import { SEGMENT_IDS } from '../pose-core/features';
import { extractFeatures } from '../pose-core/features';
import type { PoseTimeline, SegmentId } from '../pose-core/types';
import type { Direction } from './phrases';

export type MoveKind = 'go' | 'hit' | 'hold';

export interface Move {
  index: number;
  /** Seconds. */
  startTime: number;
  endTime: number;
  kind: MoveKind;
  /** The 1-2 limbs that changed most, biggest first. */
  drivers: { segment: SegmentId; direction: Direction; delta: number }[];
  /** Whole-body changes worth calling out. */
  wholeBody: (
    'crouchDown' | 'crouchUp' | 'stanceOut' | 'stanceIn' | 'handsApart' | 'handsTogether'
  )[];
  peakVelocity: number;
}

/** Per-frame mean landmark velocity, smoothed. */
export function velocityProfile(timeline: PoseTimeline): number[] {
  const frames = timeline.frames;
  const raw: number[] = new Array(frames.length).fill(0);

  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1]!.pose.points;
    const b = frames[i]!.pose.points;
    let sum = 0;
    let n = 0;
    for (let j = 0; j < b.length; j += 1) {
      const pa = a[j];
      const pb = b[j];
      if (!pa || !pb) continue;
      sum += Math.hypot(pb.x - pa.x, pb.y - pa.y);
      n += 1;
    }
    raw[i] = n === 0 ? 0 : (sum / n) * timeline.fps;
  }

  return smooth(raw, SEGMENTATION.smoothingFrames);
}

function smooth(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = i - half; k <= i + half; k += 1) {
      const v = values[k];
      if (v === undefined) continue;
      sum += v;
      n += 1;
    }
    return n === 0 ? 0 : sum / n;
  });
}

/** Local minima of the velocity profile = the moments the body is momentarily still. */
export function findKeyPoseFrames(timeline: PoseTimeline): number[] {
  const velocity = velocityProfile(timeline);
  if (velocity.length < 3) return [0];

  const minGap = Math.round(SEGMENTATION.minKeyPoseGapSec * timeline.fps);
  const keys: number[] = [0];

  for (let i = 1; i < velocity.length - 1; i += 1) {
    const v = velocity[i]!;
    if (v <= velocity[i - 1]! && v <= velocity[i + 1]! && i - keys[keys.length - 1]! >= minGap) {
      keys.push(i);
    }
  }

  const last = velocity.length - 1;
  if (last - keys[keys.length - 1]! >= minGap) keys.push(last);
  return keys;
}

export function segmentTimeline(timeline: PoseTimeline): Move[] {
  const keys = findKeyPoseFrames(timeline);
  const velocity = velocityProfile(timeline);
  const maxFrames = Math.round(SEGMENTATION.maxMoveSec * timeline.fps);
  const minFrames = Math.round(SEGMENTATION.minMoveSec * timeline.fps);

  // Split over-long spans, drop under-short ones into their neighbour.
  const bounds: number[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const start = keys[i]!;
    bounds.push(start);
    const next = keys[i + 1];
    if (next === undefined) continue;
    let span = next - start;
    while (span > maxFrames) {
      const mid = bounds[bounds.length - 1]! + Math.floor(maxFrames);
      bounds.push(mid);
      span = next - mid;
    }
  }

  const moves: Move[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    if (end - start < minFrames && moves.length > 0) {
      // Merge into the previous move rather than emitting a flicker of a step.
      const prev = moves[moves.length - 1]!;
      prev.endTime = end / timeline.fps;
      continue;
    }
    moves.push(describeMove(timeline, start, end, velocity, moves.length));
  }

  return moves;
}

function describeMove(
  timeline: PoseTimeline,
  startFrame: number,
  endFrame: number,
  velocity: number[],
  index: number,
): Move {
  const startPose = timeline.frames[startFrame]!.pose;
  const endPose = timeline.frames[endFrame]!.pose;
  const from = extractFeatures(startPose);
  const to = extractFeatures(endPose);

  const drivers: Move['drivers'] = [];
  for (const id of SEGMENT_IDS) {
    const a = from.segments[id];
    const b = to.segments[id];
    if (!a || !b) continue;
    const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
    const delta = Math.acos(dot) * (180 / Math.PI);
    if (delta < 15) continue;
    drivers.push({ segment: id, direction: directionOf(a, b), delta });
  }
  drivers.sort((x, y) => y.delta - x.delta);

  const wholeBody: Move['wholeBody'] = [];
  const crouchDelta = diff(from.offsets.crouch, to.offsets.crouch);
  if (crouchDelta !== null && Math.abs(crouchDelta) > 0.25) {
    // Subject space: +y is down the screen, and the hips are the origin, so a
    // SMALLER ankle y means the hips dropped toward the feet.
    wholeBody.push(crouchDelta < 0 ? 'crouchDown' : 'crouchUp');
  }
  const stanceDelta = diff(from.offsets.stanceWidth, to.offsets.stanceWidth);
  if (stanceDelta !== null && Math.abs(stanceDelta) > 0.25) {
    wholeBody.push(stanceDelta > 0 ? 'stanceOut' : 'stanceIn');
  }
  const handDelta = diff(from.offsets.handSeparation, to.offsets.handSeparation);
  if (handDelta !== null && Math.abs(handDelta) > 0.35) {
    wholeBody.push(handDelta > 0 ? 'handsApart' : 'handsTogether');
  }

  let peak = 0;
  for (let i = startFrame; i <= endFrame; i += 1) peak = Math.max(peak, velocity[i] ?? 0);
  const endVelocity = velocity[endFrame] ?? 0;

  let kind: MoveKind = 'go';
  if (peak >= SEGMENTATION.hitPeakVelocity && endVelocity <= SEGMENTATION.stopVelocity) {
    kind = 'hit';
  } else if (peak <= SEGMENTATION.holdVelocity) {
    kind = 'hold';
  }

  return {
    index,
    startTime: startFrame / timeline.fps,
    endTime: endFrame / timeline.fps,
    kind,
    drivers: drivers.slice(0, 2),
    wholeBody,
    peakVelocity: peak,
  };
}

function diff(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : b - a;
}

function directionOf(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Subject space: +y is down the screen.
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down';
  // Away from the body centreline is "out". The vector's own x sign tells us
  // which side the limb is on, so compare magnitudes rather than raw sign.
  return Math.abs(to.x) > Math.abs(from.x) ? 'out' : 'in';
}
