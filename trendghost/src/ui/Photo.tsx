/** Phase 7 — match a single pose, shutter fires itself (GHOST_OVERLAY.md "Photo mode"). */

import { useCallback, useEffect, useRef, useState } from 'react';
import { describeCameraError } from '../camera/camera';
import {
  BAND_COLORS,
  BAND_COLORS_CB,
  drawGhostSkeleton,
  drawUserSkeleton,
  fitGhost,
} from '../render/skeleton';
import { buzz } from '../coach/voice';
import type { Routine } from '../storage/db';
import { useEngine } from './useEngine';
import { useSettings } from './useSettings';

const MATCH_THRESHOLD = 0.8;
const HOLD_MS = 600;

export function Photo({ routine, onExit }: { routine: Routine; onExit: () => void }) {
  const settings = useSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [ring, setRing] = useState(0);
  const heldSince = useRef<number | null>(null);
  const firing = useRef(false);

  const clockTime = useCallback(() => 0, []);
  const engine = useEngine({
    mirrored: settings.mirrored,
    sensitivity: settings.sensitivity,
    timeline: routine.timeline,
    clockTime,
    voice: false,
    haptics: settings.haptics,
  });

  const capture = useCallback(() => {
    const canvas = canvasRef.current;
    const video = engine.camera.current?.video;
    if (!canvas || !video) return;
    const out = document.createElement('canvas');
    out.width = video.videoWidth;
    out.height = video.videoHeight;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    if (settings.mirrored) {
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    setShots((prev) => [...prev, out.toDataURL('image/jpeg', 0.92)].slice(-3));
    if (settings.haptics) buzz([30, 40, 30]);
  }, [engine.camera, settings.mirrored, settings.haptics]);

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

      ctx.save();
      if (settings.mirrored) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      const scale = Math.max(
        width / (video.videoWidth || width),
        height / (video.videoHeight || height),
      );
      const dw = (video.videoWidth || width) * scale;
      const dh = (video.videoHeight || height) * scale;
      ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
      ctx.restore();

      const frame = engine.step();
      const view = { width, height, mirrored: settings.mirrored };
      const target = routine.timeline.frames[0];

      if (target && !target.pose.lowConfidence) {
        drawGhostSkeleton(ctx, target.pose.points, fitGhost(target.pose, frame.pose), view, 0.6);
      }
      if (frame.landmarks) drawUserSkeleton(ctx, frame.landmarks, frame.score, view, palette);

      const overall = frame.score?.overall ?? 0;
      if (overall >= MATCH_THRESHOLD) {
        heldSince.current ??= performance.now();
        const held = performance.now() - heldSince.current;
        setRing(Math.min(1, held / HOLD_MS));
        if (held >= HOLD_MS && !firing.current) {
          firing.current = true;
          capture();
          setTimeout(() => {
            firing.current = false;
            heldSince.current = null;
            setRing(0);
          }, 900);
        }
      } else {
        heldSince.current = null;
        setRing(0);
      }
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [engine, routine, settings.mirrored, settings.colorBlind, capture]);

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
      <canvas ref={canvasRef} className="stage" />
      <div className="hud">
        <button className="ghost-button" onClick={onExit}>
          ✕
        </button>
      </div>

      {engine.framingProblem && ring === 0 && (
        <p className="instruction bottom">{engine.framingProblem.fix}</p>
      )}

      <div className="shutter-wrap">
        <div className="shutter-ring" style={{ '--fill': ring } as React.CSSProperties} />
        <button className="shutter" onClick={capture} aria-label="Take photo" />
      </div>

      {shots.length > 0 && (
        <div className="shot-strip">
          {shots.map((src, i) => (
            <a key={i} href={src} download={`trendghost-${i + 1}.jpg`}>
              <img src={src} alt={`Shot ${i + 1}`} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
