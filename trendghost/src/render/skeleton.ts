/**
 * GHOST_OVERLAY.md — the layer stack, and fitting the ghost onto the user.
 *
 * Coordinate note: every draw function takes RAW-space landmarks (0..1 of the
 * source image) plus an explicit mirror flag, and does the flip at draw time.
 * Scoring never sees these; it works in subject space (POSE_MATCHING.md §0).
 */

import { SEGMENT_JOINTS, SEGMENT_IDS } from '../pose-core/features';
import { LM } from '../pose-core/types';
import type {
  FrameScore,
  Landmark,
  NormalizedPose,
  ScoreBand,
  SegmentId,
} from '../pose-core/types';

export const BAND_COLORS: Record<ScoreBand, string> = {
  green: '#22e06a',
  amber: '#ffb020',
  red: '#ff3b52',
  unknown: '#7a8494',
};

/** Colour-blind safe alternative (PRODUCT_SPEC.md accessibility). */
export const BAND_COLORS_CB: Record<ScoreBand, string> = {
  green: '#2f9bff',
  amber: '#ffb020',
  red: '#ff3b52',
  unknown: '#7a8494',
};

export interface Viewport {
  width: number;
  height: number;
  /** Mirror horizontally (selfie preview). */
  mirrored: boolean;
}

interface Point {
  x: number;
  y: number;
}

function project(p: Landmark, view: Viewport): Point {
  const x = view.mirrored ? 1 - p.x : p.x;
  return { x: x * view.width, y: p.y * view.height };
}

function resolvePoint(points: readonly Landmark[], index: number): Landmark | undefined {
  if (index === -1) return mid(points[LM.leftHip], points[LM.rightHip]);
  if (index === -2) return mid(points[LM.leftShoulder], points[LM.rightShoulder]);
  return points[index];
}

function mid(a?: Landmark, b?: Landmark): Landmark | undefined {
  if (!a || !b) return undefined;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: 0,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

/** Layer 4 — the user, coloured per limb by its own score. */
export function drawUserSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Landmark[],
  score: FrameScore | null,
  view: Viewport,
  palette: Record<ScoreBand, string> = BAND_COLORS,
): void {
  const width = Math.max(4, view.width * 0.012);

  for (const id of SEGMENT_IDS) {
    const [fromIdx, toIdx] = SEGMENT_JOINTS[id];
    const from = resolvePoint(landmarks, fromIdx);
    const to = resolvePoint(landmarks, toIdx);
    if (!from || !to) continue;

    const band: ScoreBand = score ? (score.segments[id]?.band ?? 'unknown') : 'unknown';
    ctx.strokeStyle = palette[band];
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const a = project(from, view);
    const b = project(to, view);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Joints, so a limb that is `unknown` still reads as a body and not a gap.
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const index of [
    LM.leftShoulder,
    LM.rightShoulder,
    LM.leftElbow,
    LM.rightElbow,
    LM.leftWrist,
    LM.rightWrist,
    LM.leftHip,
    LM.rightHip,
    LM.leftKnee,
    LM.rightKnee,
    LM.leftAnkle,
    LM.rightAnkle,
  ]) {
    const p = landmarks[index];
    if (!p || p.visibility < 0.5) continue;
    const { x, y } = project(p, view);
    ctx.beginPath();
    ctx.arc(x, y, width * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * GHOST_OVERLAY.md "Fitting the ghost" — the similarity transform that puts the
 * reference where the user is standing, at the user's size. This is what stops
 * the user having to shuffle sideways to line up with a video.
 */
export interface GhostFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitGhost(reference: NormalizedPose, user: NormalizedPose | null): GhostFit {
  if (!user || user.lowConfidence || reference.torsoLength === 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = user.torsoLength / reference.torsoLength;
  return {
    scale,
    offsetX: user.hipCenter.x - reference.hipCenter.x * scale,
    offsetY: user.hipCenter.y - reference.hipCenter.y * scale,
  };
}

export function applyFit(p: Landmark, fit: GhostFit): Landmark {
  return {
    x: p.x * fit.scale + fit.offsetX,
    y: p.y * fit.scale + fit.offsetY,
    z: p.z,
    visibility: p.visibility,
  };
}

/** Layer 3 — the ghost skeleton the user actually aims at. */
export function drawGhostSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Landmark[],
  fit: GhostFit,
  view: Viewport,
  opacity = 0.9,
): void {
  const width = Math.max(6, view.width * 0.018);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#8be9ff';
  ctx.shadowColor = 'rgba(139,233,255,0.6)';
  ctx.shadowBlur = width;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';

  for (const id of SEGMENT_IDS) {
    const [fromIdx, toIdx] = SEGMENT_JOINTS[id];
    const from = resolvePoint(landmarks, fromIdx);
    const to = resolvePoint(landmarks, toIdx);
    if (!from || !to) continue;
    const a = project(applyFit(from, fit), view);
    const b = project(applyFit(to, fit), view);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Which segments to highlight on the ghost, e.g. the limb a cue is talking about. */
export function drawSegmentHighlight(
  ctx: CanvasRenderingContext2D,
  landmarks: readonly Landmark[],
  segment: SegmentId,
  view: Viewport,
  color = '#ffffff',
): void {
  const [fromIdx, toIdx] = SEGMENT_JOINTS[segment];
  const from = resolvePoint(landmarks, fromIdx);
  const to = resolvePoint(landmarks, toIdx);
  if (!from || !to) return;
  const a = project(from, view);
  const b = project(to, view);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(8, view.width * 0.022);
  ctx.globalAlpha = 0.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}
