import { memo } from 'react';
import type { Culture } from '@perde/shared';

/**
 * Painted scenery behind the puppets, drawn in ink lines with watercolor fills
 * on parchment. Wobbled by a turbulence filter so the lines look hand-drawn.
 * Houses only at the wings and far away; the centre stays empty for puppets.
 */

export const BACKDROP_W = 1600;
export const BACKDROP_H = 900;

const INK = '#4a2e14';
const WALL = '#e9d6a8';
const WALL_2 = '#d8c390';
const ROOF = '#b5482e';
const ROOF_2 = '#9c3b26';
const WOOD = '#8a5a2b';
const SHUTTER = '#5f7a5a';
const LEAF = '#6f8f3d';
const LEAF_2 = '#4f6d2c';

function House({
  x,
  y,
  w,
  h,
  flip = false,
  cumba = true,
  roof = ROOF,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  flip?: boolean;
  cumba?: boolean;
  roof?: string;
}) {
  const t = flip ? `translate(${x + w} ${y}) scale(-1 1)` : `translate(${x} ${y})`;
  return (
    <g transform={t} stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
      {/* walls */}
      <rect x="0" y={h * 0.32} width={w} height={h * 0.68} fill={WALL} />
      <rect
        x="0"
        y={h * 0.32}
        width={w}
        height={h * 0.3}
        fill={WALL_2}
        opacity="0.6"
        stroke="none"
      />
      {/* projecting bay (cumba) */}
      {cumba && (
        <>
          <path
            d={`M${w * 0.55} ${h * 0.42} L${w * 1.12} ${h * 0.42} L${w * 1.12} ${h * 0.72} L${w * 0.55} ${h * 0.72} Z`}
            fill={WALL}
          />
          <path
            d={`M${w * 0.55} ${h * 0.72} L${w * 1.12} ${h * 0.72} L${w * 0.55} ${h * 0.8} Z`}
            fill={WOOD}
          />
          <path
            d={`M${w * 0.55} ${h * 0.42} L${w * 1.12} ${h * 0.42} L${w * 1.06} ${h * 0.36} L${w * 0.55} ${h * 0.36} Z`}
            fill={roof}
          />
          <rect x={w * 0.62} y={h * 0.48} width={w * 0.14} height={h * 0.18} fill="#3b2a14" />
          <rect x={w * 0.84} y={h * 0.48} width={w * 0.14} height={h * 0.18} fill="#3b2a14" />
          <path
            d={`M${w * 0.62} ${h * 0.57} h${w * 0.14} M${w * 0.69} ${h * 0.48} v${h * 0.18} M${w * 0.84} ${h * 0.57} h${w * 0.14} M${w * 0.91} ${h * 0.48} v${h * 0.18}`}
            stroke={SHUTTER}
            strokeWidth="2"
          />
        </>
      )}
      {/* windows */}
      <rect x={w * 0.12} y={h * 0.44} width={w * 0.16} height={h * 0.2} fill="#3b2a14" />
      <path
        d={`M${w * 0.12} ${h * 0.54} h${w * 0.16} M${w * 0.2} ${h * 0.44} v${h * 0.2}`}
        stroke={SHUTTER}
        strokeWidth="2"
      />
      <rect x={w * 0.03} y={h * 0.44} width={w * 0.08} height={h * 0.2} fill={SHUTTER} />
      <rect x={w * 0.12} y={h * 0.74} width={w * 0.16} height={h * 0.2} fill="#3b2a14" />
      <path
        d={`M${w * 0.12} ${h * 0.84} h${w * 0.16} M${w * 0.2} ${h * 0.74} v${h * 0.2}`}
        stroke={SHUTTER}
        strokeWidth="2"
      />
      {/* door */}
      <path
        d={`M${w * 0.34} ${h} v-${h * 0.22} a${w * 0.08} ${w * 0.08} 0 0 1 ${w * 0.16} 0 v${h * 0.22} Z`}
        fill={WOOD}
      />
      {/* roof */}
      <path
        d={`M-${w * 0.08} ${h * 0.34} L${w * 0.5} ${h * 0.02} L${w * 1.08} ${h * 0.34} Z`}
        fill={roof}
      />
      <path
        d={`M-${w * 0.02} ${h * 0.3} L${w * 0.5} ${h * 0.06} L${w * 1.02} ${h * 0.3}`}
        fill="none"
        stroke={ROOF_2}
        strokeWidth="2"
      />
      <path
        d={`M${w * 0.1} ${h * 0.26} L${w * 0.5} ${h * 0.1} L${w * 0.9} ${h * 0.26}`}
        fill="none"
        stroke={ROOF_2}
        strokeWidth="2"
      />
      <path
        d={`M${w * 0.22} ${h * 0.2} L${w * 0.5} ${h * 0.14} L${w * 0.78} ${h * 0.2}`}
        fill="none"
        stroke={ROOF_2}
        strokeWidth="2"
      />
      {/* chimney */}
      <rect x={w * 0.72} y={h * 0.08} width={w * 0.08} height={h * 0.14} fill={WALL_2} />
      {/* wall planks */}
      <path
        d={`M0 ${h * 0.68} h${w * 0.5} M0 ${h * 0.86} h${w * 0.3}`}
        stroke={WOOD}
        strokeWidth="1.5"
        opacity="0.6"
      />
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      stroke={INK}
      strokeWidth="3"
      strokeLinejoin="round"
    >
      <path d="M-14 0 L-10 -120 L10 -120 L14 0 Z" fill={WOOD} />
      <path
        d="M-10 -100 L-70 -150 M10 -110 L60 -160 M0 -120 L-20 -190 M4 -118 L40 -200"
        fill="none"
        strokeWidth="6"
        stroke={WOOD}
      />
      <ellipse cx="-70" cy="-165" rx="55" ry="40" fill={LEAF} />
      <ellipse cx="60" cy="-180" rx="60" ry="42" fill={LEAF} />
      <ellipse cx="-10" cy="-215" rx="75" ry="48" fill={LEAF_2} />
      <ellipse cx="30" cy="-150" rx="45" ry="32" fill={LEAF_2} />
      <ellipse cx="-30" cy="-140" rx="40" ry="28" fill={LEAF} />
    </g>
  );
}

function Minaret({ x, y, h }: { x: number; y: number; h: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={INK} strokeWidth="2" fill={WALL_2}>
      <rect x="-6" y={-h} width="12" height={h} />
      <rect x="-12" y={-h * 0.62} width="24" height="8" />
      <path d={`M-7 ${-h} L0 ${-h - 22} L7 ${-h} Z`} fill={ROOF} />
    </g>
  );
}

function Cobbles({ y }: { y: number }) {
  const stones: React.ReactNode[] = [];
  let i = 0;
  for (let row = 0; row < 4; row++) {
    const ry = y + row * 22;
    for (let x = -30 + (row % 2) * 40; x < BACKDROP_W + 40; x += 80) {
      stones.push(
        <ellipse
          key={i++}
          cx={x}
          cy={ry}
          rx={30}
          ry={8}
          fill="none"
          stroke={INK}
          strokeWidth="1.5"
          opacity={0.35 - row * 0.06}
        />,
      );
    }
  }
  return <g>{stones}</g>;
}

function OttomanStreet({ culture }: { culture: Culture }) {
  return (
    <g filter="url(#perde-ink-wobble)">
      {/* far skyline */}
      <g opacity="0.35">
        <House x={560} y={560} w={90} h={110} cumba={false} />
        <House x={660} y={575} w={80} h={95} cumba={false} roof={ROOF_2} />
        <Minaret x={790} y={670} h={150} />
        <House x={820} y={568} w={100} h={102} cumba={false} />
        <House x={940} y={580} w={80} h={90} cumba={false} />
      </g>
      {/* left wing */}
      <House x={-40} y={290} w={260} h={420} />
      <House x={160} y={430} w={150} h={280} cumba={false} roof={ROOF_2} />
      {/* right wing */}
      <House x={1380} y={310} w={260} h={400} flip />
      <House x={1290} y={440} w={150} h={270} cumba={false} flip roof={ROOF_2} />
      <Tree x={1180} y={712} s={1.15} />
      {/* ground */}
      <path
        d={`M0 700 Q400 690 800 700 T1600 700 L1600 ${BACKDROP_H} L0 ${BACKDROP_H} Z`}
        fill={culture.stage.ground}
        opacity="0.35"
      />
      <Cobbles y={730} />
    </g>
  );
}

function SeasideBooth() {
  return (
    <g filter="url(#perde-ink-wobble)" opacity="0.9">
      <path d="M200 60 L1400 60 L1400 700 L200 700 Z" fill="#9fd3e6" />
      <path
        d="M200 420 Q500 400 800 420 T1400 420 L1400 700 L200 700 Z"
        fill="#3f8fb3"
        opacity="0.7"
      />
      <path d="M200 560 Q600 540 1000 560 T1400 560 L1400 700 L200 700 Z" fill="#e6d3a3" />
      <g stroke="#fff" strokeWidth="3" fill="none" opacity="0.7">
        <path d="M300 470 q30 -14 60 0 q30 14 60 0" />
        <path d="M900 500 q30 -14 60 0 q30 14 60 0" />
        <path d="M1150 460 q30 -14 60 0 q30 14 60 0" />
      </g>
      <circle cx="1180" cy="170" r="55" fill="#ffe27a" stroke="#e0b23a" strokeWidth="3" />
      <g fill="#fff" opacity="0.85">
        <ellipse cx="420" cy="180" rx="90" ry="30" />
        <ellipse cx="470" cy="160" rx="60" ry="26" />
        <ellipse cx="780" cy="130" rx="80" ry="26" />
      </g>
    </g>
  );
}

function BackdropInner({ culture }: { culture: Culture }) {
  switch (culture.stage.backdrop_scene) {
    case 'ottoman-street':
      return <OttomanStreet culture={culture} />;
    case 'seaside-booth':
      return <SeasideBooth />;
    default:
      return null;
  }
}

export const Backdrop = memo(BackdropInner);
