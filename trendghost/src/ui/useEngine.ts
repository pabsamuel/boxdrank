/**
 * The camera -> inference -> score -> cue loop, shared by Practice and Photo.
 *
 * PERFORMANCE_BUDGET.md rule 1: rendering never waits for inference. The render
 * loop draws the most recent result, whatever its age.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CuePlayer, type Cue } from '../coach/cues';
import { Voice, buzz } from '../coach/voice';
import { LuminanceSampler, checkFraming, firstProblem, type FramingCheck } from '../coach/framing';
import { PoseEngine } from '../inference/poseLandmarker';
import { closeCamera, openCamera, type CameraError, type CameraStream } from '../camera/camera';
import { extractFeatures } from '../pose-core/features';
import { toSubjectSpace } from '../pose-core/normalize';
import { LandmarkSmoother, ScoreSmoother } from '../pose-core/smooth';
import { scoreAgainstTimeline } from '../pose-core/align';
import { correctionPhrase } from '../coach/phrases';
import { worstSegment } from '../pose-core/score';
import type { FrameScore, Landmark, NormalizedPose, PoseTimeline } from '../pose-core/types';
import type { Sensitivity } from '../config/scoring.config';

export interface EngineFrame {
  landmarks: Landmark[] | null;
  pose: NormalizedPose | null;
  score: FrameScore | null;
  timingOffsetMs: number;
  referenceTime: number;
}

export interface EngineStats {
  renderFps: number;
  inferenceHz: number;
  inferenceMs: number;
  latencyMs: number;
}

interface EngineOptions {
  mirrored: boolean;
  sensitivity: Sensitivity;
  /** Null while we are not scoring (e.g. during framing). */
  timeline: PoseTimeline | null;
  /** Reference time source; return null when not running. */
  clockTime: () => number | null;
  cues?: Cue[];
  voice?: boolean;
  haptics?: boolean;
  onCue?: (cue: Cue) => void;
  /** Throttle inference; recording drops this (PERFORMANCE_BUDGET.md). */
  inferenceHzCap?: number;
}

export function useEngine(options: EngineOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [cameraError, setCameraError] = useState<CameraError | null>(null);
  const [ready, setReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [framing, setFraming] = useState<FramingCheck[]>([]);
  const [stats, setStats] = useState<EngineStats>({
    renderFps: 0,
    inferenceHz: 0,
    inferenceMs: 0,
    latencyMs: 0,
  });

  const cameraRef = useRef<CameraStream | null>(null);
  const engineRef = useRef<PoseEngine | null>(null);
  const frameRef = useRef<EngineFrame>({
    landmarks: null,
    pose: null,
    score: null,
    timingOffsetMs: 0,
    referenceTime: 0,
  });
  const landmarkSmoother = useRef(new LandmarkSmoother());
  const scoreSmoother = useRef(new ScoreSmoother());
  const cuePlayer = useRef(new CuePlayer());
  const voiceRef = useRef(new Voice());
  const luminance = useRef(new LuminanceSampler());

  useEffect(() => {
    let cancelled = false;
    const voice = voiceRef.current;

    (async () => {
      try {
        const camera = await openCamera('user');
        if (cancelled) return closeCamera(camera);
        cameraRef.current = camera;
      } catch (error) {
        setCameraError(error as CameraError);
        return;
      }

      try {
        const engine = new PoseEngine('lite', 'VIDEO');
        await engine.load();
        if (cancelled) return engine.close();
        engineRef.current = engine;
        setReady(true);
      } catch {
        setModelError(
          "The pose model didn't load. Run `npm run fetch-models`, then reload this page.",
        );
      }
    })();

    return () => {
      cancelled = true;
      closeCamera(cameraRef.current);
      engineRef.current?.close();
      voice.stop();
      cameraRef.current = null;
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    cuePlayer.current.setTrack(options.cues ?? []);
  }, [options.cues]);

  /** Called once per rendered frame by the screen's render loop. */
  const step = useCallback(() => {
    const camera = cameraRef.current;
    const engine = engineRef.current;
    const opts = optionsRef.current;
    if (!camera || !engine) return frameRef.current;

    const captureMs = performance.now();
    const cap = opts.inferenceHzCap ?? 30;
    const minGap = 1000 / cap;

    if (captureMs - lastInference.current >= minGap) {
      const result = engine.detect(camera.video, captureMs);
      if (result) {
        lastInference.current = captureMs;
        inferenceCount.current += 1;
        lastInferenceMs.current = result.inferenceMs;

        const raw = result.landmarks;
        if (raw) {
          const smoothedLandmarks = landmarkSmoother.current.apply(raw);
          const pose = toSubjectSpace(smoothedLandmarks, opts.mirrored);
          const features = extractFeatures(pose);
          const clock = opts.clockTime();

          let score: FrameScore | null = null;
          let timingOffsetMs = 0;
          let referenceTime = 0;

          if (opts.timeline && clock !== null) {
            const aligned = scoreAgainstTimeline(
              features,
              opts.timeline,
              clock,
              opts.sensitivity,
              performance.now() - captureMs + lastInferenceMs.current,
            );
            if (aligned) {
              score = scoreSmoother.current.apply(aligned.score);
              timingOffsetMs = aligned.timingOffsetMs;
              referenceTime = aligned.referenceTime;
            }
          }

          frameRef.current = {
            landmarks: smoothedLandmarks,
            pose,
            score,
            timingOffsetMs,
            referenceTime,
          };
        } else {
          landmarkSmoother.current.reset();
          scoreSmoother.current.reset();
          frameRef.current = {
            landmarks: null,
            pose: null,
            score: null,
            timingOffsetMs: 0,
            referenceTime: 0,
          };
        }

        // Framing checks run off the same result; cheap, and they must keep
        // working while the routine plays so we can say "I can't see you".
        setFraming(
          checkFraming(frameRef.current.landmarks, {
            luminance: luminance.current.sample(camera.video),
          }),
        );
        setStats((prev) => ({ ...prev, inferenceMs: lastInferenceMs.current }));
      }
    }

    // Cues fire on the playback clock, not wall time (CUE_ENGINE.md).
    const clock = opts.clockTime();
    if (clock !== null) {
      for (const cue of cuePlayer.current.update(clock)) {
        if (cue.voice && opts.voice) voiceRef.current.say(cue.text);
        if (cue.haptic && opts.haptics) buzz(45);
        opts.onCue?.(cue);
      }

      const score = frameRef.current.score;
      if (score && !score.unscored) {
        const worst = worstSegment(score);
        if (worst && worst.score < 0.4) {
          const correction = cuePlayer.current.maybeCorrect(
            correctionPhrase(worst.id, worst.score < 0.2 ? 'large' : 'small'),
            clock,
          );
          if (correction) opts.onCue?.(correction);
        }
      }
    }

    // fps accounting
    frameCount.current += 1;
    const elapsed = captureMs - lastStatsAt.current;
    if (elapsed >= 500) {
      setStats({
        renderFps: Math.round((frameCount.current * 1000) / elapsed),
        inferenceHz: Math.round((inferenceCount.current * 1000) / elapsed),
        inferenceMs: lastInferenceMs.current,
        latencyMs: Math.round(lastInferenceMs.current),
      });
      frameCount.current = 0;
      inferenceCount.current = 0;
      lastStatsAt.current = captureMs;
    }

    return frameRef.current;
  }, []);

  const lastInference = useRef(0);
  const lastInferenceMs = useRef(0);
  const frameCount = useRef(0);
  const inferenceCount = useRef(0);
  const lastStatsAt = useRef(performance.now());

  const resetCues = useCallback((time: number) => {
    cuePlayer.current.seek(time);
    scoreSmoother.current.reset();
  }, []);

  return {
    camera: cameraRef,
    ready,
    cameraError,
    modelError,
    framing,
    framingProblem: firstProblem(framing),
    stats,
    step,
    resetCues,
    voice: voiceRef.current,
  };
}
