import { memo } from 'react';
import { orderParts, type Gesture, type Pose, type Puppet, type PuppetPart } from '@perde/shared';

/**
 * Draws one puppet as nested SVG groups. Each driven part rotates around its
 * pivot by (rest + gain × axis). Gestures are short time-based overlays.
 */

export interface GestureAnim {
  gesture: Gesture;
  /** 0..1 progress through the gesture. */
  t: number;
}

export interface PuppetSvgProps {
  puppet: Puppet;
  pose: Pose;
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
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function axisValue(part: PuppetPart, pose: Pose, talk: number, gesture?: GestureAnim): number {
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
    case 'lean': {
      let v = pose.lean;
      if (gesture?.gesture === 'bow') v += Math.sin(gesture.t * Math.PI) * 0.9;
      if (gesture?.gesture === 'shake')
        v += Math.sin(gesture.t * Math.PI * 8) * 0.5 * (1 - gesture.t);
      return clamp(v, -1.5, 1.5);
    }
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
    default:
      return 0;
  }
}

function PartNode({
  part,
  children,
  angle,
}: {
  part: PuppetPart;
  children: React.ReactNode;
  angle: number;
}) {
  const pivot = part.pivot ?? [0, 0];
  const transform = angle ? `rotate(${angle.toFixed(2)} ${pivot[0]} ${pivot[1]})` : undefined;
  return (
    <g transform={transform}>
      <path
        d={part.d}
        fill={part.fill}
        opacity={part.opacity}
        stroke={part.stroke}
        strokeWidth={part.strokeWidth}
        fillRule="evenodd"
      />
      {children}
    </g>
  );
}

function PuppetSvgInner({
  puppet,
  pose,
  time,
  gesture,
  opacity,
  facing,
  x,
  y,
  scale,
  highlight,
}: PuppetSvgProps) {
  const parts = orderParts(puppet);
  const childrenOf = new Map<string | undefined, PuppetPart[]>();
  for (const p of parts) {
    const list = childrenOf.get(p.parent) ?? [];
    list.push(p);
    childrenOf.set(p.parent, list);
  }
  const talk = pose.talking ? (Math.sin(time * 18) + 1) / 2 : 0;
  const breathe = Math.sin(time * 1.6) * 0.6;

  const render = (part: PuppetPart): React.ReactNode => {
    const v = axisValue(part, pose, talk, gesture);
    const angle = (part.rest ?? 0) + (part.gain ?? 0) * v + (part.driver === 'lean' ? breathe : 0);
    return (
      <PartNode key={part.id} part={part} angle={angle}>
        {(childrenOf.get(part.id) ?? []).map(render)}
      </PartNode>
    );
  };

  // Hop from the pose; jump gesture adds height; spin rotates the whole figure.
  let hop = clamp(pose.y, 0, 1) * 60;
  let spin = 0;
  if (gesture?.gesture === 'jump') hop = Math.max(hop, Math.sin(gesture.t * Math.PI) * 120);
  if (gesture?.gesture === 'spin') spin = gesture.t * 360;
  const flip = facing === 'left' ? -1 : 1;
  const w = puppet.width;
  const h = puppet.height;
  const transform = `translate(${x} ${y - hop}) scale(${scale}) rotate(${spin} 0 ${-h / 2}) scale(${flip} 1) translate(${-w / 2} ${-h})`;
  return (
    <g
      transform={transform}
      opacity={opacity}
      style={{ filter: highlight ? 'url(#perde-glow)' : undefined }}
    >
      {(childrenOf.get(undefined) ?? []).map(render)}
    </g>
  );
}

export const PuppetSvg = memo(PuppetSvgInner);
