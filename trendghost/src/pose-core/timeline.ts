/** Building a PoseTimeline: resampling to the fixed 30fps grid. */

import { meanConfidence, toSubjectSpace } from './normalize';
import type { Landmark, PoseTimeline, TimelineFrame } from './types';
import { TIMELINE_FPS } from './types';

export interface SampledFrame {
  /** Seconds from the start of the source video. */
  t: number;
  landmarks: Landmark[] | null;
}

/**
 * Resample arbitrarily-spaced source samples onto the fixed 30fps grid by
 * nearest-neighbour. Nearest rather than interpolated: interpolating between two
 * poses 100ms apart invents a pose the performer never struck.
 */
export function buildTimeline(
  samples: readonly SampledFrame[],
  meta: { id: string; name: string; duration: number; sourceFps: number },
): PoseTimeline {
  const frameCount = Math.max(1, Math.round(meta.duration * TIMELINE_FPS));
  const frames: TimelineFrame[] = [];
  let lowConfidence = 0;
  let cursor = 0;

  for (let i = 0; i < frameCount; i += 1) {
    const t = i / TIMELINE_FPS;

    while (
      cursor + 1 < samples.length &&
      Math.abs(samples[cursor + 1]!.t - t) <= Math.abs(samples[cursor]!.t - t)
    ) {
      cursor += 1;
    }

    const sample = samples[cursor];
    const landmarks = sample?.landmarks ?? null;
    const pose = landmarks ? toSubjectSpace(landmarks, false) : toSubjectSpace([], false);
    const confidence = landmarks ? meanConfidence(landmarks) : 0;

    if (pose.lowConfidence) lowConfidence += 1;
    frames.push({ t, pose, confidence });
  }

  return {
    version: 1,
    id: meta.id,
    name: meta.name,
    duration: meta.duration,
    sourceFps: meta.sourceFps,
    createdAt: Date.now(),
    fps: TIMELINE_FPS,
    frames,
    lowConfidenceRatio: frames.length === 0 ? 1 : lowConfidence / frames.length,
  };
}
