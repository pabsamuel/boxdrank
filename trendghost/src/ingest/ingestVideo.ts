/**
 * Phase 2 — a user-supplied video becomes a PoseTimeline + a cue track.
 *
 * Lanes in: the share sheet and the file picker (CONTENT_SOURCING.md).
 * There is deliberately no URL input anywhere in this file or any other.
 */

import { detectBeats, MIN_CONFIDENCE } from '../coach/beats';
import { buildCueTrack } from '../coach/cues';
import { segmentTimeline } from '../coach/segment';
import { decodeAudio } from './audio';
import { PoseEngine } from '../inference/poseLandmarker';
import { buildTimeline, type SampledFrame } from '../pose-core/timeline';
import type { Routine } from '../storage/db';
import { saveFile, saveRoutine } from '../storage/db';

export interface IngestProgress {
  /** 0..1 */
  progress: number;
  stage: 'decoding' | 'tracking' | 'building' | 'saving' | 'done';
  message: string;
}

export type IngestRejection =
  | { ok: false; reason: 'no-person'; message: string }
  | { ok: false; reason: 'too-noisy'; message: string; lowConfidenceRatio: number }
  | { ok: false; reason: 'too-long'; message: string }
  | { ok: false; reason: 'unreadable'; message: string };

export type IngestResult = { ok: true; routine: Routine } | IngestRejection;

/** Above this fraction of unusable frames we refuse rather than produce garbage. */
const MAX_LOW_CONFIDENCE = 0.35;
const MAX_DURATION_SEC = 180;
/** Frames per second to sample for tracking. 30 is the timeline grid. */
const SAMPLE_FPS = 30;

export async function ingestVideo(
  file: File,
  onProgress: (p: IngestProgress) => void,
  signal?: AbortSignal,
): Promise<IngestResult> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);
  video.src = url;

  try {
    onProgress({ progress: 0, stage: 'decoding', message: 'Reading the video…' });
    await once(video, 'loadedmetadata');

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      return { ok: false, reason: 'unreadable', message: "I couldn't read that video file." };
    }
    if (duration > MAX_DURATION_SEC) {
      return {
        ok: false,
        reason: 'too-long',
        message: `That clip is ${Math.round(duration)}s. Trim it to under ${MAX_DURATION_SEC}s and try again.`,
      };
    }

    const engine = new PoseEngine('full', 'VIDEO');
    onProgress({ progress: 0.05, stage: 'tracking', message: 'Loading the pose model…' });
    await engine.load();

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: 'unreadable', message: 'Could not decode this video.' };

    const samples: SampledFrame[] = [];
    const frameCount = Math.floor(duration * SAMPLE_FPS);

    for (let i = 0; i < frameCount; i += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const t = i / SAMPLE_FPS;
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const result = engine.detect(canvas, Math.round(t * 1000));
      samples.push({ t, landmarks: result?.landmarks ?? null });

      if (i % 5 === 0) {
        onProgress({
          progress: 0.05 + (i / frameCount) * 0.85,
          stage: 'tracking',
          message: `Tracking the dancer… ${Math.round((i / frameCount) * 100)}%`,
        });
        await raf();
      }
    }

    engine.close();

    const tracked = samples.filter((s) => s.landmarks !== null).length;
    if (tracked === 0) {
      return {
        ok: false,
        reason: 'no-person',
        message:
          "I couldn't find a person in that video. Try a clip where the dancer is fully visible.",
      };
    }

    onProgress({ progress: 0.92, stage: 'building', message: 'Working out the moves…' });

    const id = crypto.randomUUID();
    const timeline = buildTimeline(samples, {
      id,
      name: file.name.replace(/\.[^.]+$/, '') || 'Routine',
      duration,
      sourceFps: SAMPLE_FPS,
    });

    if (timeline.lowConfidenceRatio > MAX_LOW_CONFIDENCE) {
      return {
        ok: false,
        reason: 'too-noisy',
        message: `I could only track the dancer for ${Math.round((1 - timeline.lowConfidenceRatio) * 100)}% of that clip — usually that means they're too small in frame or partly cut off. Try another video.`,
        lowConfidenceRatio: timeline.lowConfidenceRatio,
      };
    }

    const moves = segmentTimeline(timeline);

    // Find the beat so cues can land ON it rather than near it (CUE_ENGINE.md).
    // Entirely optional: no audio, an odd codec or a low-confidence result just
    // means cues keep their raw motion timing.
    onProgress({ progress: 0.94, stage: 'building', message: 'Listening for the beat…' });
    const audio = await decodeAudio(file);
    const grid = audio ? detectBeats(audio.samples, audio.sampleRate) : null;
    const beats = grid && grid.confidence >= MIN_CONFIDENCE ? grid.beats : undefined;

    const cues = buildCueTrack(moves, beats ? { beats } : {});

    onProgress({ progress: 0.96, stage: 'saving', message: 'Saving to this device…' });

    const videoFile = `routine-${id}.${extensionOf(file)}`;
    await saveFile(videoFile, file);

    const routine: Routine = {
      id,
      name: timeline.name,
      createdAt: Date.now(),
      duration,
      kind: 'video',
      timeline,
      moves,
      cues,
      beats,
      videoFile,
      thumbnail: await grabThumbnail(video, canvas, ctx),
    };

    await saveRoutine(routine);
    onProgress({ progress: 1, stage: 'done', message: 'Ready' });
    return { ok: true, routine };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function extensionOf(file: File): string {
  const match = /\.([a-z0-9]+)$/i.exec(file.name);
  return match?.[1] ?? 'mp4';
}

async function grabThumbnail(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Promise<string | undefined> {
  try {
    await seekTo(video, Math.min(0.5, video.duration / 2));
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return undefined;
  }
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener('error', () => reject(new Error(`Failed to load (${event})`)), {
      once: true,
    });
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

function raf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
