/**
 * MediaPipe wrapper. One landmarker instance, loaded once, reused
 * (PERFORMANCE_BUDGET.md rule 3).
 */

import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { Landmark } from '../pose-core/types';

const MODEL_BASE = import.meta.env.VITE_MODEL_BASE_URL ?? '/models';

export type ModelVariant = 'lite' | 'full';

const MODEL_FILES: Record<ModelVariant, string> = {
  lite: 'pose_landmarker_lite.task',
  full: 'pose_landmarker_full.task',
};

export interface PoseResult {
  landmarks: Landmark[] | null;
  /** Playback/performance timestamp of the frame this came from. */
  captureTimeMs: number;
  /** How long inference took, ms. */
  inferenceMs: number;
}

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private busy = false;

  constructor(
    private variant: ModelVariant = 'lite',
    private mode: 'VIDEO' | 'IMAGE' = 'VIDEO',
  ) {}

  async load(): Promise<void> {
    if (this.landmarker) return;

    const fileset = await FilesetResolver.forVisionTasks(`${MODEL_BASE}/wasm`);

    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE}/${MODEL_FILES[this.variant]}`,
          delegate: 'GPU',
        },
        runningMode: this.mode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch {
      // Some devices have no usable GPU delegate. CPU is slower but works.
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: `${MODEL_BASE}/${MODEL_FILES[this.variant]}`,
          delegate: 'CPU',
        },
        runningMode: this.mode,
        numPoses: 1,
      });
    }
  }

  get isLoaded(): boolean {
    return this.landmarker !== null;
  }

  /**
   * Run one frame. Returns null if a previous frame is still in flight —
   * the caller keeps rendering with the last result rather than waiting
   * (PERFORMANCE_BUDGET.md rule 1).
   */
  detect(source: HTMLVideoElement | HTMLCanvasElement, captureTimeMs: number): PoseResult | null {
    if (!this.landmarker || this.busy) return null;

    this.busy = true;
    const started = performance.now();
    try {
      const result =
        this.mode === 'VIDEO'
          ? this.landmarker.detectForVideo(source, captureTimeMs)
          : this.landmarker.detect(source);
      return {
        landmarks: toLandmarks(result),
        captureTimeMs,
        inferenceMs: performance.now() - started,
      };
    } finally {
      this.busy = false;
    }
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

function toLandmarks(result: PoseLandmarkerResult): Landmark[] | null {
  const first = result.landmarks?.[0];
  if (!first) return null;
  return first.map((p) => ({
    x: p.x,
    y: p.y,
    z: p.z,
    visibility: p.visibility ?? 1,
  }));
}
