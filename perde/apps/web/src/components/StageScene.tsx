import { useEffect, useRef, useState } from 'react';
import { NEUTRAL_POSE, type Culture, type Gesture, type Pose, type Puppet } from '@perde/shared';
import { Backdrop } from './Backdrop';
import { PuppetSvg, type GestureAnim } from './PuppetSvg';

/**
 * The picture on the TV: parchment, painted scenery, a ground line and the
 * puppets. Poses arrive as targets and are followed tightly every frame; a
 * dragged rod makes the figure's feet trail, legs stride while it walks, a
 * 'turn' flips it on the spot. Puppets with painted artwork use it once the
 * image has loaded; until then their vector rig shows.
 */

export const STAGE_W = 1600;
export const STAGE_H = 900;
const GROUND_Y = 735;
const BOOTH_BOARD_Y = 700;
const GESTURE_MS: Record<Gesture, number> = {
  none: 0,
  wave: 1400,
  jump: 700,
  spin: 900,
  bow: 1200,
  nod: 700,
  shake: 900,
  turn: 380,
};
/** Seconds for the displayed pose to close most of the gap to the phone's pose. */
const FOLLOW_TAU = 0.045;
/** How much a dragged rod makes the feet trail (lean per stage-width/second). */
const SWING_GAIN = 0.22;
const SWING_TAU = 0.12;
/** Stride cycles per stage-width walked. */
const STRIDE_PER_WIDTH = 5;

export interface ScenePuppet {
  key: string;
  puppet: Puppet;
  npc: boolean;
  slot: number;
  speaking: boolean;
  target: Pose;
  gesture?: { gesture: Gesture; at: number };
}

export interface StageSceneProps {
  culture: Culture;
  puppets: ScenePuppet[];
  /** Highlight the puppet whose line it is. */
  highlightSpeaking?: boolean;
}

interface Live {
  pose: Pose;
  facing: 'left' | 'right';
  /** Extra lean from motion, -1..1. */
  swing: number;
  /** Walking phase in radians; legs swing with sin(phase). */
  phase: number;
  /** Last velocity, to fade the stride out when standing. */
  speed: number;
  /** Timestamp of the 'turn' gesture already applied, so it flips once. */
  turnedAt: number;
}

interface Frame {
  /** Seconds since mount. */
  time: number;
  /** performance.now() of this frame, for gesture timing. */
  nowMs: number;
  live: Map<string, Live>;
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

function slotX(slot: number): number {
  // Players: spread left/right; unclaimed characters take the wings.
  const positions = [-0.55, 0.55, -0.2, 0.2, -0.85, 0.85, -0.4, 0.4];
  return positions[slot % positions.length]!;
}

function fresh(slot: number): Live {
  return {
    pose: { ...NEUTRAL_POSE, x: slotX(slot) },
    facing: slotX(slot) < 0 ? 'right' : 'left',
    swing: 0,
    phase: 0,
    speed: 0,
    turnedAt: 0,
  };
}

/** The rig to draw: painted artwork once loaded, else the vector parts. */
function withArt(puppet: Puppet, loaded: Set<string>): Puppet {
  if (!puppet.art || !loaded.has(puppet.art.image)) return puppet;
  return {
    ...puppet,
    image: puppet.art.image,
    width: puppet.art.width,
    height: puppet.art.height,
    rod: puppet.art.rod ?? puppet.rod,
    parts: puppet.art.parts,
  };
}

export function StageScene({ culture, puppets, highlightSpeaking = true }: StageSceneProps) {
  const [frame, setFrame] = useState<Frame>({ time: 0, nowMs: 0, live: new Map() });
  const [loadedArt, setLoadedArt] = useState<Set<string>>(() => new Set());
  const puppetsRef = useRef(puppets);
  useEffect(() => {
    puppetsRef.current = puppets;
  }, [puppets]);

  // Preload painted artwork; a missing file simply leaves the vector rig on stage.
  useEffect(() => {
    const urls = new Set(puppets.map((p) => p.puppet.art?.image).filter((u): u is string => !!u));
    for (const url of urls) {
      if (loadedArt.has(url)) continue;
      const img = new Image();
      img.onload = () => setLoadedArt((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
      img.src = url;
    }
  }, [puppets, loadedArt]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = start;
    const live = new Map<string, Live>();
    const loop = (nowMs: number) => {
      const now = (nowMs - start) / 1000;
      const dt = Math.min(0.1, Math.max(0.001, (nowMs - last) / 1000));
      last = nowMs;
      const k = 1 - Math.exp(-dt / FOLLOW_TAU);
      const ks = 1 - Math.exp(-dt / SWING_TAU);
      for (const p of puppetsRef.current) {
        const cur = live.get(p.key) ?? fresh(p.slot);
        let target = p.target;
        if (p.npc) {
          // Idle life for characters nobody holds: gentle sway, talk when it is their line.
          const sway = Math.sin(now * 1.3 + p.slot) * 0.15;
          target = {
            x: slotX(p.slot),
            y: 0,
            lean: sway,
            arm: p.speaking ? 0.3 + Math.sin(now * 5) * 0.3 : 0,
            talking: p.speaking,
          };
        }
        const next: Pose = {
          x: lerp(cur.pose.x, target.x, k),
          y: lerp(cur.pose.y, target.y, k),
          lean: lerp(cur.pose.lean, target.lean, k),
          arm: lerp(cur.pose.arm, target.arm, k),
          talking: target.talking,
        };
        // Stage-widths per second; a brisk walk is about 1.
        const vx = (next.x - cur.pose.x) / dt;
        const swing = p.npc
          ? 0
          : lerp(cur.swing, Math.max(-0.7, Math.min(0.7, vx * SWING_GAIN)), ks);
        const speed = lerp(cur.speed, Math.min(1, Math.abs(vx)), ks);
        const phase = cur.phase + Math.abs(next.x - cur.pose.x) * STRIDE_PER_WIDTH * Math.PI * 2;
        // Face the way you walk; a 'turn' gesture flips on the spot.
        let facing = cur.facing;
        let turnedAt = cur.turnedAt;
        if (p.npc) facing = slotX(p.slot) < 0 ? 'right' : 'left';
        else if (vx > 0.35) facing = 'right';
        else if (vx < -0.35) facing = 'left';
        if (p.gesture?.gesture === 'turn' && p.gesture.at !== cur.turnedAt) {
          facing = facing === 'left' ? 'right' : 'left';
          turnedAt = p.gesture.at;
        }
        live.set(p.key, { pose: next, facing, swing, phase, speed, turnedAt });
      }
      for (const key of [...live.keys()])
        if (!puppetsRef.current.some((p) => p.key === key)) live.delete(key);
      setFrame({ time: now, nowMs, live: new Map(live) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const booth = culture.stage.kind === 'booth';
  const groundY = booth ? BOOTH_BOARD_Y : GROUND_Y;
  const { time, nowMs } = frame;

  return (
    <svg
      className="stage-svg"
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={culture.tradition}
    >
      <defs>
        <radialGradient id="perde-glow-grad" cx="50%" cy="58%" r="60%">
          <stop offset="0%" stopColor={culture.stage.glow} />
          <stop offset="100%" stopColor={culture.stage.backdrop} />
        </radialGradient>
        <filter id="perde-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={culture.stage.blur} />
        </filter>
        <filter id="perde-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="14" floodColor="#ffffff" floodOpacity="0.9" />
        </filter>
        {/* Parchment grain and a hand-drawn wobble for the inked scenery. */}
        <filter id="perde-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.1  0 0 0 0.16 0"
          />
        </filter>
        <filter id="perde-ink-wobble" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves="2"
            seed="3"
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <pattern id="perde-stripes" width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="40" height="80" fill="#f4f1e6" />
          <rect x="40" width="40" height="80" fill={culture.stage.backdrop} />
        </pattern>
        {/* Painted-leather patterns for vector puppets. */}
        <pattern id="perde-pat-karagoz" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#c8102e" />
          <circle cx="4" cy="4" r="2" fill="#f2c94c" />
          <circle cx="12" cy="12" r="2" fill="#f2c94c" />
          <path d="M12 2 l3 3 -3 3 -3 -3 z" fill="#1f4e8c" />
        </pattern>
        <pattern id="perde-pat-salvar" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#1f4e8c" />
          <path d="M7 1 l3 3 -3 3 -3 -3 z" fill="#f2c94c" opacity="0.9" />
          <circle cx="1" cy="11" r="1.5" fill="#c8102e" />
          <circle cx="13" cy="11" r="1.5" fill="#c8102e" />
        </pattern>
        <pattern id="perde-pat-hacivat" width="18" height="18" patternUnits="userSpaceOnUse">
          <rect width="18" height="18" fill="#2e8b57" />
          <circle cx="9" cy="9" r="3" fill="none" stroke="#f2c94c" strokeWidth="1.2" />
          <circle cx="9" cy="9" r="1" fill="#f2c94c" />
          <circle cx="0" cy="0" r="1.2" fill="#f2c94c" />
          <circle cx="18" cy="18" r="1.2" fill="#f2c94c" />
        </pattern>
        <pattern
          id="perde-pat-sash"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="12" fill="#f2c94c" />
          <rect x="6" width="6" height="12" fill="#c8102e" />
        </pattern>
        <pattern id="perde-pat-check" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#f2c94c" />
          <rect x="5" y="5" width="5" height="5" fill="#f2c94c" />
          <rect x="5" width="5" height="5" fill="#2e8b57" />
          <rect y="5" width="5" height="5" fill="#2e8b57" />
        </pattern>
        <pattern id="perde-pat-celebi" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#1f4e8c" />
          <path d="M0 7 h14 M7 0 v14" stroke="#f4f1e6" strokeWidth="1" opacity="0.6" />
        </pattern>
        <pattern id="perde-pat-zenne" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="16" height="16" fill="#d9578a" />
          <path
            d="M8 3 c2 0 3 2 3 4 c0 3 -3 5 -3 5 c0 0 -3 -2 -3 -5 c0 -2 1 -4 3 -4z"
            fill="#f4f1e6"
            opacity="0.8"
          />
        </pattern>
      </defs>

      {booth ? (
        <>
          <rect width={STAGE_W} height={STAGE_H} fill="#1c1a17" />
          <rect x="120" y="0" width={STAGE_W - 240} height={STAGE_H} fill="url(#perde-stripes)" />
          <rect
            x="200"
            y="60"
            width={STAGE_W - 400}
            height={BOOTH_BOARD_Y - 60}
            fill={culture.stage.glow}
          />
          <Backdrop culture={culture} />
          <rect
            x="200"
            y="60"
            width={STAGE_W - 400}
            height={BOOTH_BOARD_Y - 60}
            fill="url(#perde-glow-grad)"
            opacity="0.35"
          />
        </>
      ) : (
        <>
          <rect width={STAGE_W} height={STAGE_H} fill="url(#perde-glow-grad)" />
          <rect width={STAGE_W} height={STAGE_H} filter="url(#perde-grain)" opacity="0.9" />
          <Backdrop culture={culture} />
          <line
            x1="0"
            y1={GROUND_Y + 2}
            x2={STAGE_W}
            y2={GROUND_Y + 2}
            stroke={culture.stage.ground}
            strokeWidth="5"
            opacity="0.45"
          />
        </>
      )}

      <g filter={culture.stage.blur > 0 ? 'url(#perde-soft)' : undefined}>
        {[...puppets]
          .sort((a, b) => Number(a.speaking) - Number(b.speaking))
          .map((p) => {
            const live = frame.live.get(p.key) ?? fresh(p.slot);
            const px = STAGE_W / 2 + live.pose.x * (STAGE_W / 2 - 220);
            let gestureAnim: GestureAnim | undefined;
            if (p.gesture && p.gesture.gesture !== 'none') {
              const dur = GESTURE_MS[p.gesture.gesture];
              const t = (nowMs - p.gesture.at) / dur;
              if (t >= 0 && t <= 1) gestureAnim = { gesture: p.gesture.gesture, t };
            }
            const rig = withArt(p.puppet, loadedArt);
            return (
              <PuppetSvg
                key={p.key}
                puppet={rig}
                pose={live.pose}
                swing={live.swing}
                stride={Math.sin(live.phase) * live.speed}
                facing={live.facing}
                leanDegrees={booth ? 14 : 28}
                outline={rig.image ? 0 : culture.stage.outline}
                time={time + p.slot}
                gesture={gestureAnim}
                opacity={culture.stage.puppetOpacity}
                x={px}
                y={groundY}
                scale={booth ? 1.55 : 1.25}
                highlight={highlightSpeaking && p.speaking}
              />
            );
          })}
      </g>

      {booth && (
        <>
          <rect
            x="200"
            y={BOOTH_BOARD_Y - 30}
            width={STAGE_W - 400}
            height={STAGE_H - BOOTH_BOARD_Y + 30}
            fill={culture.stage.ground}
          />
          <rect x="200" y={BOOTH_BOARD_Y - 30} width={STAGE_W - 400} height="26" fill="#3a1b0a" />
        </>
      )}
    </svg>
  );
}
