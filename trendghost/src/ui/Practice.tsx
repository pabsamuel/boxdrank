/**
 * The main screen: framing coach -> countdown -> run -> review.
 * Layer stack and fitting per GHOST_OVERLAY.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Cue } from '../coach/cues';
import { ACCENTS, countIn } from '../coach/phrases';
import { PlaybackClock } from '../playback/PlaybackClock';
import { allClear } from '../coach/framing';
import {
  BAND_COLORS,
  BAND_COLORS_CB,
  drawGhostSkeleton,
  drawUserSkeleton,
  fitGhost,
} from '../render/skeleton';
import { frameAt } from '../pose-core/align';
import { SEGMENT_IDS } from '../pose-core/features';
import type { FrameScore, SegmentId } from '../pose-core/types';
import { describeCameraError } from '../camera/camera';
import {
  readFile,
  saveFile,
  saveRoutine,
  saveTake,
  type Routine,
  type Take,
  type TakeFrame,
} from '../storage/db';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';

export type PracticeMode = 'learn' | 'practice' | 'record';

interface Props {
  routine: Routine;
  mode: PracticeMode;
  onExit: () => void;
  /** Called when a recorded take has been saved, so the app can offer a review. */
  onTakeSaved?: (take: Take) => void;
}

type Phase = 'framing' | 'countdown' | 'running' | 'finished';

const SPEEDS = [0.25, 0.5, 0.75, 1];

export function Practice({ routine, mode, onExit, onTakeSaved }: Props) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostVideoRef = useRef<HTMLVideoElement>(null);
  const clockRef = useRef(new PlaybackClock());

  const [phase, setPhase] = useState<Phase>(settings.skipFraming ? 'countdown' : 'framing');
  const [count, setCount] = useState<string | null>(null);
  const [cue, setCue] = useState<Cue | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [ghostUrl, setGhostUrl] = useState<string | null>(null);
  const [debug] = useState(() => new URLSearchParams(location.search).has('debug'));
  const [moveIndex, setMoveIndex] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);

  const scoresRef = useRef<TakeFrame[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const clockTime = useCallback(
    () => (phaseRef.current === 'running' ? clockRef.current.now() : null),
    [],
  );

  const engine = useEngine({
    mirrored: settings.mirrored,
    sensitivity: settings.sensitivity,
    timeline: phase === 'running' ? routine.timeline : null,
    clockTime,
    cues: mode === 'learn' ? routine.cues : routine.cues.filter((c) => c.type !== 'prepare'),
    voice: settings.voice && mode !== 'record',
    haptics: settings.haptics,
    onCue: setCue,
    inferenceHzCap: mode === 'record' ? 15 : 30,
    onTooSlow: () => {
      // Degrade, but never silently: the user is told what changed and why
      // (PERFORMANCE_BUDGET.md "Reduced mode").
      if (settings.reducedMode) return;
      settings.update('reducedMode', true);
      setSlowNotice(true);
      setTimeout(() => setSlowNotice(false), 6000);
    },
  });

  /* ---- load the ghost video out of local storage ---- */
  useEffect(() => {
    let url: string | null = null;
    (async () => {
      if (!routine.videoFile) return;
      const blob = await readFile(routine.videoFile);
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setGhostUrl(url);
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [routine.videoFile]);

  useEffect(() => {
    clockRef.current.attach(ghostVideoRef.current);
  }, [ghostUrl]);

  /* ---- framing coach gate: all checks green for 1.5s ---- */
  const clearSince = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'framing') return;
    if (allClear(engine.framing) && engine.framing.length > 0) {
      clearSince.current ??= performance.now();
      if (performance.now() - clearSince.current > 1500) setPhase('countdown');
    } else {
      clearSince.current = null;
    }
  }, [engine.framing, phase]);

  /* ---- countdown, then go ---- */
  useEffect(() => {
    if (phase !== 'countdown') return;
    const words = countIn(Boolean(routine.beats?.length));
    // Count in at the routine's own tempo when we found one, so "5, 6, 7, 8"
    // lands in time with the music instead of against it.
    const interval = beatInterval(routine.beats) ?? 700;
    let i = 0;
    setCount(words[0]!);
    const timer = setInterval(() => {
      i += 1;
      if (i < words.length) {
        setCount(words[i]!);
        if (settings.voice) engine.voice.say(words[i]!);
      } else {
        clearInterval(timer);
        setCount(null);
        void start();
      }
    }, interval);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startRecording = useCallback(() => {
    const stream = engine.camera.current?.stream;
    if (!stream || typeof MediaRecorder === 'undefined') return;
    try {
      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType() });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      // Recording unsupported here — the run still works, we just don't save it.
      recorderRef.current = null;
    }
  }, [engine.camera]);

  const start = useCallback(async () => {
    scoresRef.current = [];
    clockRef.current.seek(0);
    engine.resetCues(0);
    setPhase('running');
    await clockRef.current.play();

    if (mode === 'record') startRecording();
  }, [engine, mode, startRecording]);

  const finish = useCallback(async () => {
    clockRef.current.pause();
    setPhase('finished');

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const scored = scoresRef.current.filter((s) => s.score !== null);
      const mean = scored.length
        ? scored.reduce((sum, s) => sum + (s.score ?? 0), 0) / scored.length
        : 0;
      const id = crypto.randomUUID();
      const file = `take-${id}.webm`;
      await saveFile(file, blob);
      const take: Take = {
        id,
        routineId: routine.id,
        createdAt: Date.now(),
        duration: routine.duration,
        scores: scoresRef.current,
        accuracy: mean,
        videoFile: file,
      };
      await saveTake(take);
      onTakeSaved?.(take);
    }

    const scored = scoresRef.current.filter((s) => s.score !== null);
    if (scored.length) {
      const mean = scored.reduce((sum, s) => sum + (s.score ?? 0), 0) / scored.length;
      setAccuracy(mean);
      if (!routine.bestAccuracy || mean > routine.bestAccuracy) {
        await saveRoutine({ ...routine, bestAccuracy: mean, lastPractisedAt: Date.now() });
      }
    }
  }, [routine, onTakeSaved]);

  /* ---- the render loop ---- */
  useEffect(() => {
    let raf = 0;
    const palette = settings.colorBlind ? BAND_COLORS_CB : BAND_COLORS;

    const render = () => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      const video = engine.camera.current?.video;
      if (!canvas || !video) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Layer 1 — camera, cover-fit, mirrored if requested.
      ctx.save();
      if (settings.mirrored) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      drawCover(ctx, video, width, height);
      ctx.restore();

      const frame = engine.step();
      const view = { width, height, mirrored: settings.mirrored };

      const time = clockRef.current.now();
      const reference = frameAt(routine.timeline, phaseRef.current === 'running' ? time : 0);

      // Layers 2-3 — ghost video is a DOM element behind the canvas; here we draw
      // the ghost skeleton, fitted onto wherever the user is standing.
      if (reference && !reference.pose.lowConfidence) {
        const fit = fitGhost(reference.pose, frame.pose);
        drawGhostSkeleton(ctx, reference.pose.points, fit, view, settings.reducedMode ? 1 : 0.85);
      }

      // Layer 4 — the user, coloured per limb.
      if (frame.landmarks) {
        drawUserSkeleton(ctx, frame.landmarks, frame.score, view, palette);
      }

      if (phaseRef.current === 'running') {
        scoresRef.current.push({
          t: time,
          score: frame.score?.overall ?? null,
          segments: frame.score ? compactSegments(frame.score) : undefined,
        });
        setAccuracy(frame.score?.overall ?? null);

        if (mode === 'learn') {
          const move = routine.moves[moveIndex];
          if (move && time >= move.endTime) {
            const hit = (frame.score?.overall ?? 0) >= 0.7;
            if (hit) {
              setWaiting(false);
              setMoveIndex((i) => Math.min(i + 1, routine.moves.length - 1));
            } else {
              setWaiting(true);
              clockRef.current.pause();
            }
          }
        }

        if (clockRef.current.duration > 0 && time >= clockRef.current.duration - 0.05) {
          void finish();
        }
      }
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [
    engine,
    routine,
    settings.mirrored,
    settings.colorBlind,
    settings.reducedMode,
    mode,
    moveIndex,
    finish,
  ]);

  /* ---- learn mode: resume when the user hits the pose ---- */
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if ((accuracy ?? 0) >= 0.7) {
        setWaiting(false);
        setMoveIndex((i) => Math.min(i + 1, routine.moves.length - 1));
        void clockRef.current.play();
      }
    }, 120);
    return () => clearInterval(timer);
  }, [waiting, accuracy, routine.moves.length]);

  const cantSeeYou = phase === 'running' && engine.framing.length > 0 && !allClear(engine.framing);
  const currentMove = useMemo(() => routine.moves[moveIndex], [routine.moves, moveIndex]);

  if (engine.cameraError) {
    return (
      <div className="screen centre">
        <h2>Camera</h2>
        <p>{describeCameraError(engine.cameraError)}</p>
        <button onClick={onExit}>Back</button>
      </div>
    );
  }

  return (
    <div className="practice">
      {ghostUrl && !settings.reducedMode && (
        <video
          ref={ghostVideoRef}
          className="ghost-video"
          src={ghostUrl}
          playsInline
          style={{
            opacity: phase === 'running' ? (mode === 'record' ? 0.1 : settings.ghostOpacity) : 0.2,
            transform: settings.mirrored ? 'scaleX(-1)' : undefined,
          }}
        />
      )}
      <canvas ref={canvasRef} className="stage" />

      <div className="hud">
        <button className="ghost-button" onClick={onExit}>
          ✕
        </button>
        <div className="hud-right">
          {phase === 'running' && (
            <div className="accuracy">
              {accuracy === null ? '—' : `${Math.round(accuracy * 100)}%`}
            </div>
          )}
        </div>
      </div>

      {engine.modelError && <div className="banner error">{engine.modelError}</div>}

      {phase === 'framing' && (
        <div className="coach-overlay">
          <div className="silhouette" data-ok={allClear(engine.framing)} />
          <p className="instruction">{engine.framingProblem?.fix ?? 'Hold it there…'}</p>
          <button className="text-button" onClick={() => setPhase('countdown')}>
            Skip, I know what I'm doing
          </button>
        </div>
      )}

      {count && <div className="countdown">{count}</div>}

      {cantSeeYou && <div className="banner">{ACCENTS.cantSeeYou}</div>}

      {slowNotice && (
        <div className="banner">
          This phone was struggling, so I turned off the ghost video and kept the outline. You can
          switch it back in Settings.
        </div>
      )}

      {cue && phase === 'running' && (
        <div className={`cue cue-${cue.type}`} key={cue.id}>
          {cue.text}
        </div>
      )}

      {waiting && <div className="banner">Waiting for you… {ACCENTS.again}</div>}

      {phase === 'running' && mode === 'learn' && currentMove && (
        <div className="move-list">
          {routine.moves.map((m) => (
            <div key={m.index} className={m.index === moveIndex ? 'move current' : 'move'}>
              {m.index + 1}
            </div>
          ))}
        </div>
      )}

      {phase !== 'finished' && (
        <div className="transport">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              className={clockRef.current.playbackRate === speed ? 'chip active' : 'chip'}
              onClick={() => clockRef.current.setRate(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
      )}

      {phase === 'finished' && (
        <div className="finish-card">
          <h2>{accuracy === null ? 'Take finished' : `${Math.round(accuracy * 100)}% match`}</h2>
          <div className="row">
            <button onClick={() => setPhase('countdown')}>Go again</button>
            <button className="secondary" onClick={onExit}>
              Done
            </button>
          </div>
        </div>
      )}

      {debug && (
        <div className="debug">
          <div>render {engine.stats.renderFps} fps</div>
          <div>inference {engine.stats.inferenceHz} Hz</div>
          <div>infer {engine.stats.inferenceMs.toFixed(1)} ms</div>
          <div>latency {engine.stats.latencyMs} ms</div>
          <div>t {clockRef.current.now().toFixed(2)}s</div>
        </div>
      )}
    </div>
  );
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
}

/**
 * Per-limb scores, rounded and with unseen limbs dropped. Recorded every frame,
 * so keep it small: two decimals is far finer than any colour band.
 */
function compactSegments(score: FrameScore): Partial<Record<SegmentId, number>> {
  const out: Partial<Record<SegmentId, number>> = {};
  for (const id of SEGMENT_IDS) {
    const value = score.segments[id]?.score;
    if (value !== null && value !== undefined) out[id] = Math.round(value * 100) / 100;
  }
  return out;
}

/** Median gap between detected beats, in ms. Null when there is no usable grid. */
function beatInterval(beats: number[] | undefined): number | null {
  if (!beats || beats.length < 3) return null;
  const gaps = beats.slice(1).map((beat, i) => beat - beats[i]!);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!median || median <= 0) return null;
  // A count-in slower than ~1.2s a beat drags; faster than ~250ms is unreadable.
  return Math.max(250, Math.min(1200, median * 1000));
}

function preferredMimeType(): string {
  const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}
