import { useEffect, useRef, useState } from 'react';
import { NEUTRAL_POSE, type Culture, type Gesture, type Pose, type Puppet } from '@perde/shared';
import { PuppetSvg, type GestureAnim } from './PuppetSvg';

/**
 * The picture on the TV: a lit screen (or a striped booth), a ground line and
 * the puppets. Poses arrive as targets and are eased every frame so 20–30 Hz
 * phone updates look like continuous motion.
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
};

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
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

function slotX(slot: number): number {
  // Players: spread left/right; unclaimed characters take the wings.
  const positions = [-0.55, 0.55, -0.2, 0.2, -0.85, 0.85, -0.4, 0.4];
  return positions[slot % positions.length]!;
}

interface Frame {
  /** Seconds since mount. */
  time: number;
  /** performance.now() of this frame, for gesture timing. */
  nowMs: number;
  live: Map<string, Live>;
}

export function StageScene({ culture, puppets, highlightSpeaking = true }: StageSceneProps) {
  const [frame, setFrame] = useState<Frame>({ time: 0, nowMs: 0, live: new Map() });
  const puppetsRef = useRef(puppets);
  useEffect(() => {
    puppetsRef.current = puppets;
  }, [puppets]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = start;
    const live = new Map<string, Live>();
    const loop = (nowMs: number) => {
      const now = (nowMs - start) / 1000;
      const dt = Math.min(0.1, (nowMs - last) / 1000);
      last = nowMs;
      const k = 1 - Math.pow(0.001, dt); // ~ reach target in ~1s, mostly in 200ms
      for (const p of puppetsRef.current) {
        const cur = live.get(p.key) ?? {
          pose: { ...NEUTRAL_POSE, x: slotX(p.slot) },
          facing: slotX(p.slot) < 0 ? 'right' : 'left',
        };
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
          x: lerp(cur.pose.x, target.x, k * 0.9),
          y: lerp(cur.pose.y, target.y, k),
          lean: lerp(cur.pose.lean, target.lean, k),
          arm: lerp(cur.pose.arm, target.arm, k),
          talking: target.talking,
        };
        let facing = cur.facing;
        if (next.x < -0.08) facing = 'right';
        else if (next.x > 0.08) facing = 'left';
        live.set(p.key, { pose: next, facing });
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
        <pattern id="perde-stripes" width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="40" height="80" fill="#f4f1e6" />
          <rect x="40" width="40" height="80" fill={culture.stage.backdrop} />
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
          <rect
            x="200"
            y="60"
            width={STAGE_W - 400}
            height={BOOTH_BOARD_Y - 60}
            fill="url(#perde-glow-grad)"
            opacity="0.6"
          />
        </>
      ) : (
        <>
          <rect width={STAGE_W} height={STAGE_H} fill="url(#perde-glow-grad)" />
          <rect width={STAGE_W} height={STAGE_H} fill="url(#perde-weave)" opacity="0.35" />
          <line
            x1="0"
            y1={GROUND_Y + 2}
            x2={STAGE_W}
            y2={GROUND_Y + 2}
            stroke={culture.stage.ground}
            strokeWidth="6"
            opacity="0.5"
          />
        </>
      )}

      <g filter={culture.stage.blur > 0 ? 'url(#perde-soft)' : undefined}>
        {[...puppets]
          .sort((a, b) => Number(a.speaking) - Number(b.speaking))
          .map((p) => {
            const live = frame.live.get(p.key) ?? {
              pose: { ...NEUTRAL_POSE, x: slotX(p.slot) },
              facing: 'right' as const,
            };
            const px = STAGE_W / 2 + live.pose.x * (STAGE_W / 2 - 220);
            let gestureAnim: GestureAnim | undefined;
            if (p.gesture && p.gesture.gesture !== 'none') {
              const dur = GESTURE_MS[p.gesture.gesture];
              const t = (nowMs - p.gesture.at) / dur;
              if (t >= 0 && t <= 1) gestureAnim = { gesture: p.gesture.gesture, t };
            }
            return (
              <PuppetSvg
                key={p.key}
                puppet={p.puppet}
                pose={live.pose}
                facing={live.facing}
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
