import { memo, useId } from 'react';
import {
  orderParts,
  polygonPath,
  rodPoint,
  type Gesture,
  type Pose,
  type Puppet,
  type PuppetPart,
} from '@perde/shared';

/**
 * Draws one puppet as nested SVG groups. The whole figure hangs from its rod
 * point and leans there, like a real Karagöz on its stick; individual parts
 * rotate around their own pivots by (rest + gain × axis).
 *
 * Vector parts are paths. Raster parts show a region (polygon) of the
 * puppet's image; a parent's region has its children's regions cut out, so
 * a raised arm leaves no ghost behind. Gestures are short time-based overlays.
 */

export interface GestureAnim {
  gesture: Gesture;
  /** 0..1 progress through the gesture. */
  t: number;
}

export interface PuppetSvgProps {
  puppet: Puppet;
  pose: Pose;
  /** Extra lean from motion (the feet trailing behind a dragged rod), -1..1. */
  swing?: number;
  /** Walking phase, -1..1, drives 'stride' parts (legs). */
  stride?: number;
  /** Seconds, for the talking wobble and idle breathing. */
  time: number;
  gesture?: GestureAnim;
  opacity: number;
  /** Puppets are authored facing right. */
  facing: 'left' | 'right';
  /** Placement in stage units: feet position and scale. */
  x: number;
  y: number;
  scale: number;
  highlight?: boolean;
  /** Degrees of whole-figure lean at pose.lean = 1. */
  leanDegrees?: number;
  /** Ink outline width for vector parts without their own stroke. */
  outline?: number;
  /** CSS filter for the whole figure, e.g. 'url(#perde-lifted)'. Wins over `highlight`. */
  filter?: string;
  /** Blend the figure into the screen like backlit leather. */
  blend?: 'multiply';
  /** Draw the stick that holds the figure, from the rod point off the bottom of the screen. */
  rod?: { color: string; opacity: number; slantDeg?: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function axisValue(
  part: PuppetPart,
  pose: Pose,
  talk: number,
  stride: number,
  gesture?: GestureAnim,
): number {
  switch (part.driver) {
    case 'arm': {
      let v = clamp(pose.arm, -0.2, 1);
      if (gesture?.gesture === 'wave') v = 0.8 + Math.sin(gesture.t * Math.PI * 6) * 0.2;
      return v;
    }
    case 'arm-inverse': {
      let v = clamp(pose.arm, -0.2, 1);
      if (gesture?.gesture === 'wave') v = 0.8 + Math.sin(gesture.t * Math.PI * 6 + Math.PI) * 0.2;
      return v;
    }
    case 'lean':
      return pose.lean;
    case 'talk': {
      let v = talk;
      if (gesture?.gesture === 'nod') v = Math.max(v, Math.abs(Math.sin(gesture.t * Math.PI * 3)));
      return v;
    }
    case 'bob': {
      let v = clamp(pose.y, 0, 1);
      if (gesture?.gesture === 'jump') v = Math.max(v, Math.sin(gesture.t * Math.PI));
      return v;
    }
    case 'stride':
      return stride;
    case 'stride-inverse':
      return -stride;
    default:
      return 0;
  }
}

interface RenderCtx {
  puppet: Puppet;
  childrenOf: Map<string | undefined, PuppetPart[]>;
  idPrefix: string;
  outline: number;
}

/** Clip for a raster part: its own region minus its children's regions (even-odd holes). */
function clipPathData(part: PuppetPart, ctx: RenderCtx): string {
  const own = part.polygon
    ? polygonPath(part.polygon)
    : polygonPath([
        [0, 0],
        [ctx.puppet.width, 0],
        [ctx.puppet.width, ctx.puppet.height],
        [0, ctx.puppet.height],
      ]);
  const holes = (ctx.childrenOf.get(part.id) ?? [])
    .filter((c) => c.polygon && !c.image)
    .map((c) => polygonPath(c.polygon!));
  return [own, ...holes].join(' ');
}

function PartNode({
  part,
  ctx,
  angle,
  children,
}: {
  part: PuppetPart;
  ctx: RenderCtx;
  angle: number;
  children: React.ReactNode;
}) {
  const pivot = part.pivot ?? [0, 0];
  const transform = angle ? `rotate(${angle.toFixed(2)} ${pivot[0]} ${pivot[1]})` : undefined;
  const image = part.image ?? ctx.puppet.image;
  const raster = !!image && (part.polygon || !part.d);
  const clipId = `${ctx.idPrefix}-${part.id}`;
  return (
    <g transform={transform}>
      {raster ? (
        <>
          <clipPath id={clipId} clipRule="evenodd">
            <path d={clipPathData(part, ctx)} clipRule="evenodd" />
          </clipPath>
          <image
            href={image}
            x={0}
            y={0}
            width={ctx.puppet.width}
            height={ctx.puppet.height}
            preserveAspectRatio="none"
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : (
        <path
          d={part.d}
          fill={part.fill ?? '#000'}
          opacity={part.opacity}
          stroke={part.stroke ?? (ctx.outline > 0 ? '#1a1207' : undefined)}
          strokeWidth={part.strokeWidth ?? (ctx.outline > 0 ? ctx.outline : undefined)}
          strokeLinejoin="round"
          fillRule="evenodd"
        />
      )}
      {children}
    </g>
  );
}

function PuppetSvgInner({
  puppet,
  pose,
  swing = 0,
  stride = 0,
  time,
  gesture,
  opacity,
  facing,
  x,
  y,
  scale,
  highlight,
  leanDegrees = 28,
  outline = 0,
  filter,
  blend,
  rod,
}: PuppetSvgProps) {
  const idPrefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const parts = orderParts(puppet);
  const childrenOf = new Map<string | undefined, PuppetPart[]>();
  for (const p of parts) {
    const list = childrenOf.get(p.parent) ?? [];
    list.push(p);
    childrenOf.set(p.parent, list);
  }
  const ctx: RenderCtx = { puppet, childrenOf, idPrefix, outline };
  const talk = pose.talking ? (Math.sin(time * 18) + 1) / 2 : 0;
  const breathe = Math.sin(time * 1.6) * 0.5;

  const render = (part: PuppetPart): React.ReactNode => {
    const v = axisValue(part, pose, talk, stride, gesture);
    const angle = (part.rest ?? 0) + (part.gain ?? 0) * v + (part.driver === 'lean' ? breathe : 0);
    return (
      <PartNode key={part.id} part={part} ctx={ctx} angle={angle}>
        {(childrenOf.get(part.id) ?? []).map(render)}
      </PartNode>
    );
  };

  // Whole-figure lean around the rod point: the pose, plus the swing of a dragged
  // rod, plus bow/shake gestures.
  let figureLean = clamp(pose.lean + swing, -1.4, 1.4);
  if (gesture?.gesture === 'bow') figureLean += Math.sin(gesture.t * Math.PI) * 0.9;
  if (gesture?.gesture === 'shake')
    figureLean += Math.sin(gesture.t * Math.PI * 8) * 0.5 * (1 - gesture.t);
  const [rx, ry] = rodPoint(puppet);
  const leanAngle = figureLean * leanDegrees;

  // Hop from the pose; jump gesture adds height; spin whirls; turn flips.
  let hop = clamp(pose.y, 0, 1) * 70;
  let spin = 0;
  let squash = 1;
  if (gesture?.gesture === 'jump') hop = Math.max(hop, Math.sin(gesture.t * Math.PI) * 120);
  if (gesture?.gesture === 'spin') spin = gesture.t * 360;
  if (gesture?.gesture === 'turn') squash = Math.max(0.05, Math.abs(Math.cos(gesture.t * Math.PI)));
  const flip = (facing === 'left' ? -1 : 1) * squash;
  const w = puppet.width;
  const h = puppet.height;
  const transform = `translate(${x} ${y - hop}) scale(${scale}) rotate(${spin} 0 ${-h / 2}) scale(${flip} 1) translate(${-w / 2} ${-h}) rotate(${leanAngle.toFixed(2)} ${rx} ${ry})`;
  // The stick is rigid to the figure: it turns with the lean and runs off the
  // bottom edge to the hand nobody sees. Its shadow shows through the leather.
  const rodLen = h * 1.7;
  const rodAngle = ((rod?.slantDeg ?? 9) * Math.PI) / 180;
  const rodW = h * 0.018;
  return (
    <g
      transform={transform}
      opacity={opacity}
      style={{
        filter: filter ?? (highlight ? 'url(#perde-glow)' : undefined),
        mixBlendMode: blend,
      }}
    >
      {(childrenOf.get(undefined) ?? []).map(render)}
      {rod && (
        <g opacity={rod.opacity}>
          <line
            x1={rx}
            y1={ry}
            x2={rx - Math.sin(rodAngle) * rodLen}
            y2={ry + Math.cos(rodAngle) * rodLen}
            stroke={rod.color}
            strokeWidth={rodW}
            strokeLinecap="round"
          />
          <circle cx={rx} cy={ry} r={rodW * 0.95} fill={rod.color} />
        </g>
      )}
    </g>
  );
}

export const PuppetSvg = memo(PuppetSvgInner);
