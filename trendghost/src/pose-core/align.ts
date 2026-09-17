/**
 * POSE_MATCHING.md §6 — matching a camera frame to the right reference frame.
 *
 * Two things this fixes:
 *  - camera frames arrive late (capture + inference), so we score against the
 *    reference frame at the frame's OWN capture time, not at "now";
 *  - humans are early or late by a beat, so we search a small window and report
 *    the offset separately. "Right pose, wrong time" is a different coaching
 *    problem from "wrong pose".
 */

import { ALIGNMENT } from '../config/scoring.config';
import { extractFeatures } from './features';
import { scoreFrame } from './score';
import type { Sensitivity } from '../config/scoring.config';
import type { FrameScore, PoseFeatures, PoseTimeline, TimelineFrame } from './types';
import { TIMELINE_FPS } from './types';

export function frameIndexAt(timeline: PoseTimeline, t: number): number {
  const index = Math.round(t * TIMELINE_FPS);
  return Math.max(0, Math.min(timeline.frames.length - 1, index));
}

export function frameAt(timeline: PoseTimeline, t: number): TimelineFrame | undefined {
  return timeline.frames[frameIndexAt(timeline, t)];
}

export interface AlignedScore {
  score: FrameScore;
  /** Reference time we ended up scoring against, seconds. */
  referenceTime: number;
  /** How far off the expected time that was, ms. Positive = user is behind. */
  timingOffsetMs: number;
}

/**
 * Score a user frame against the timeline.
 *
 * @param captureTimeSec  the playback-clock time at which the camera frame was
 *                        CAPTURED (not the time inference finished).
 * @param latencyMs       measured capture->result latency; calibration replaces
 *                        the default (POSE_MATCHING.md §8).
 */
export function scoreAgainstTimeline(
  user: PoseFeatures,
  timeline: PoseTimeline,
  captureTimeSec: number,
  sensitivity: Sensitivity = 'normal',
  latencyMs: number = ALIGNMENT.defaultLatencyMs,
): AlignedScore | null {
  if (timeline.frames.length === 0) return null;

  const expected = captureTimeSec - latencyMs / 1000;
  const windowSec = ALIGNMENT.toleranceWindowMs / 1000;
  const step = 1 / TIMELINE_FPS;

  let best: AlignedScore | null = null;

  for (let offset = -windowSec; offset <= windowSec + 1e-9; offset += step) {
    const t = expected + offset;
    if (t < 0 || t > timeline.duration) continue;
    const frame = frameAt(timeline, t);
    if (!frame) continue;

    const candidate = scoreFrame(user, extractFeatures(frame.pose), sensitivity);
    if (candidate.overall === null) continue;

    if (!best || candidate.overall > (best.score.overall ?? -1)) {
      best = {
        score: candidate,
        referenceTime: frame.t,
        timingOffsetMs: Math.round(offset * -1000),
      };
    }
  }

  if (best) return best;

  // Nothing in the window could be scored — report the unscored frame honestly
  // rather than inventing a zero.
  const fallback = frameAt(timeline, Math.max(0, Math.min(timeline.duration, expected)));
  if (!fallback) return null;
  return {
    score: scoreFrame(user, extractFeatures(fallback.pose), sensitivity),
    referenceTime: fallback.t,
    timingOffsetMs: 0,
  };
}
