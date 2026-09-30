import { useEffect, useRef, useState } from 'react';
import { NEUTRAL_POSE, type Culture, type Gesture, type Pose, type Puppet } from '@perde/shared';
import { Backdrop } from './Backdrop';
import { PuppetSvg, type GestureAnim } from './PuppetSvg';

/**
 * The picture on the TV. A shadow screen is a cloth lit from behind by a lamp
 * in a dark room: the figures are translucent leather pressed against it, the
 * rods that hold them show as dark lines running off the bottom edge, and the
 * lamp flickers. A booth (Punch and Judy) is opaque and front-lit.
 *
 * Poses arrive as targets and are followed tightly every frame; a dragged rod
 * makes the figure's feet trail, legs stride while it walks, a 'turn' flips it
 * on the spot. Puppets with painted artwork use it once the image has loaded;
 * until then their vector rig shows.
 */

export const STAGE_W = 1600;
export const STAGE_H = 900;
const GROUND_Y = 735;
const BOOTH_BOARD_Y = 700;
/** The cloth inside the frame, in stage units. */
const SCREEN = { x: 70, y: 40, w: 1460, h: 790 };
/**
 * Vector rigs are authored 200 × 400; painted artwork and family drawings come
 * in their own pixel size and are scaled to the same stage height.
 */
const NOMINAL_H = 400;
const SHADOW_INK = '#1d1208';
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
/** Facing follows velocity smoothed over this long, so a snap to a new spot cannot flip a figure. */
const DRIFT_TAU = 0.25;
const TURN_SPEED = 0.4;
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
  /**
   * The göstermelik: shown while the room waits, lifted off the top of the
   * screen once `liftedAt` (a performance.now() stamp) is set.
   */
  showpiece?: { shown: boolean; liftedAt: number | null };
}
/** How long the göstermelik takes to leave the screen, in ms. */
const LIFT_MS = 1400;

interface Live {
  pose: Pose;
  facing: 'left' | 'right';
  /** Extra lean from motion, -1..1. */
  swing: number;
  /** Walking phase in radians; legs swing with sin(phase). */
  phase: number;
  /** Last velocity, to fade the stride out when standing. */
  speed: number;
  /** Smoothed signed velocity; facing follows this so a one-frame snap cannot flip a figure. */
  drift: number;
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
    drift: 0,
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

export function StageScene({
  culture,
  puppets,
  highlightSpeaking = true,
  showpiece,
}: StageSceneProps) {
  const [frame, setFrame] = useState<Frame>({ time: 0, nowMs: 0, live: new Map() });
  const [loadedArt, setLoadedArt] = useState<Set<string>>(() => new Set());
  const puppetsRef = useRef(puppets);
  useEffect(() => {
    puppetsRef.current = puppets;
  }, [puppets]);

  // Preload painted artwork; a missing file simply leaves the vector rig on stage.
  useEffect(() => {
    const urls = new Set(
      puppets
        .flatMap((p) => [p.puppet.art?.image, ...(p.puppet.art?.parts.map((pt) => pt.image) ?? [])])
        .filter((u): u is string => !!u),
    );
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
      const kd = 1 - Math.exp(-dt / DRIFT_TAU);
      for (const p of puppetsRef.current) {
        const cur = live.get(p.key) ?? fresh(p.slot);
        // A phone's x is relative to the seat's home spot, so four figures that
        // have not moved yet stand apart instead of in one pile at the centre.
        let target: Pose = {
          ...p.target,
          x: Math.max(-1, Math.min(1, slotX(p.slot) + p.target.x)),
        };
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
        const drift = lerp(cur.drift, Math.max(-1.5, Math.min(1.5, vx)), kd);
        const phase = cur.phase + Math.abs(next.x - cur.pose.x) * STRIDE_PER_WIDTH * Math.PI * 2;
        // Face the way you walk; a 'turn' gesture flips on the spot.
        let facing = cur.facing;
        let turnedAt = cur.turnedAt;
        if (p.npc) facing = slotX(p.slot) < 0 ? 'right' : 'left';
        else if (drift > TURN_SPEED) facing = 'right';
        else if (drift < -TURN_SPEED) facing = 'left';
        if (p.gesture?.gesture === 'turn' && p.gesture.at !== cur.turnedAt) {
          facing = facing === 'left' ? 'right' : 'left';
          turnedAt = p.gesture.at;
        }
        live.set(p.key, { pose: next, facing, swing, phase, speed, drift, turnedAt });
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
  // The lamp breathes: slow drift plus a quick candle flutter.
  const flicker =
    0.1 + 0.05 * Math.sin(time * 1.7) * Math.sin(time * 0.9) + 0.03 * Math.sin(time * 19.3);

  return (
    <svg
      className="stage-svg"
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={culture.tradition}
    >
      <defs>
        {/* Lamp behind the cloth: brightest low and centre, warm at the edges. */}
        <radialGradient id="perde-lamp" cx="50%" cy="76%" r="78%">
          <stop offset="0%" stopColor="#fffaea" />
          <stop offset="38%" stopColor={culture.stage.glow} />
          <stop offset="78%" stopColor={culture.stage.backdrop} />
          <stop offset="100%" stopColor="#cdb289" />
        </radialGradient>
        <radialGradient id="perde-lamp-flare" cx="50%" cy="80%" r="55%">
          <stop offset="0%" stopColor="#fff4cf" />
          <stop offset="100%" stopColor="#fff4cf" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="perde-vignette" cx="50%" cy="60%" r="72%">
          <stop offset="55%" stopColor="#3a2410" stopOpacity="0" />
          <stop offset="100%" stopColor="#3a2410" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient id="perde-glow-grad" cx="50%" cy="58%" r="60%">
          <stop offset="0%" stopColor={culture.stage.glow} />
          <stop offset="100%" stopColor={culture.stage.backdrop} />
        </radialGradient>
        <clipPath id="perde-screen-clip">
          <rect x={SCREEN.x} y={SCREEN.y} width={SCREEN.w} height={SCREEN.h} />
        </clipPath>
        {/* Cloth: fine weave, grain and the broad soft folds of hung muslin. */}
        <pattern id="perde-weave" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 3 H6" stroke="#7a5a2a" strokeWidth="0.8" opacity="0.5" />
          <path d="M3 0 V6" stroke="#7a5a2a" strokeWidth="0.8" opacity="0.35" />
        </pattern>
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
        <filter id="perde-folds" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.012" numOctaves="3" seed="11" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 0.97  0 0 0 0 0.88  0 0 0 0.9 -0.35"
          />
        </filter>
        {/* A figure pressed flat against the cloth is sharp; one held away from it goes soft. */}
        <filter id="perde-pressed" x="-15%" y="-10%" width="130%" height="125%">
          <feDropShadow dx="2" dy="2" stdDeviation="1.4" floodColor="#2a1a08" floodOpacity="0.35" />
        </filter>
        <filter id="perde-lifted" x="-20%" y="-10%" width="140%" height="130%">
          <feGaussianBlur stdDeviation={Math.max(0.6, culture.stage.blur * 2.2)} result="soft" />
          <feDropShadow
            in="soft"
            dx="6"
            dy="4"
            stdDeviation="4"
            floodColor="#2a1a08"
            floodOpacity="0.3"
          />
        </filter>
        <filter id="perde-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={culture.stage.blur} />
        </filter>
        <filter id="perde-set-piece" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="perde-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="14" floodColor="#ffffff" floodOpacity="0.9" />
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
        <pattern id="perde-wood" width="180" height="14" patternUnits="userSpaceOnUse">
          <rect width="180" height="14" fill="#2b1a10" />
          <path d="M0 4 Q45 2 90 5 T180 4" stroke="#3a2617" strokeWidth="1.2" fill="none" />
          <path d="M0 10 Q60 12 120 9 T180 11" stroke="#1d110a" strokeWidth="1" fill="none" />
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
          {/* The dark room, then the lit cloth. */}
          <rect width={STAGE_W} height={STAGE_H} fill="#120c07" />
          <g clipPath="url(#perde-screen-clip)">
            <rect
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              fill="url(#perde-lamp)"
            />
            <rect
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              filter="url(#perde-folds)"
              opacity="0.55"
            />
            <rect
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              fill="url(#perde-weave)"
              opacity="0.22"
            />
            <rect
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              filter="url(#perde-grain)"
              opacity="0.6"
            />
            {/* Set pieces are leather too: translucent, a little soft, never in the middle. */}
            <g opacity="0.62" style={{ mixBlendMode: 'multiply', filter: 'url(#perde-set-piece)' }}>
              <Backdrop culture={culture} />
            </g>
          </g>
        </>
      )}

      {!booth && culture.stage.showpiece && showpiece?.shown && (
        <Showpiece
          art={culture.stage.showpiece}
          liftedAt={showpiece.liftedAt}
          time={time}
          nowMs={nowMs}
        />
      )}

      <g clipPath={booth ? undefined : 'url(#perde-screen-clip)'}>
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
            const speaking = highlightSpeaking && p.speaking;
            const filter = booth
              ? speaking
                ? 'url(#perde-glow)'
                : undefined
              : speaking
                ? 'url(#perde-pressed)'
                : 'url(#perde-lifted)';
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
                scale={(booth ? 1.55 : 1.25) * (NOMINAL_H / rig.height)}
                filter={filter}
                blend={booth ? undefined : 'multiply'}
                rod={booth ? undefined : { color: SHADOW_INK, opacity: 0.78 }}
              />
            );
          })}
      </g>

      {booth ? (
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
      ) : (
        <>
          {/* Light on top of everything: the lamp's flare and the falloff at the edges. */}
          <g clipPath="url(#perde-screen-clip)" style={{ pointerEvents: 'none' }}>
            <rect
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              fill="url(#perde-lamp-flare)"
              opacity={flicker}
            />
            <rect
              x={SCREEN.x}
              y={SCREEN.y}
              width={SCREEN.w}
              height={SCREEN.h}
              fill="url(#perde-vignette)"
              style={{ mixBlendMode: 'multiply' }}
            />
          </g>
          <ScreenFrame />
        </>
      )}
    </svg>
  );
}

/** The wooden frame around the cloth and the red valance hanging from its top. */
function ScreenFrame() {
  const { x, y, w, h } = SCREEN;
  const scallop = 112;
  const n = Math.round(w / scallop);
  const sw = w / n;
  let d = `M${x + w} ${y - 6} V${y + 30}`;
  for (let i = 0; i < n; i++) {
    const cx = x + w - sw * i;
    d += ` Q${cx - sw / 2} ${y + 62} ${cx - sw} ${y + 30}`;
  }
  d += ` V${y - 6} Z`;
  return (
    <g>
      <path
        d={`M0 0 H${STAGE_W} V${STAGE_H} H0 Z M${x} ${y} V${y + h} H${x + w} V${y} Z`}
        fill="url(#perde-wood)"
        fillRule="evenodd"
      />
      <rect
        x={x - 8}
        y={y - 8}
        width={w + 16}
        height={h + 16}
        fill="none"
        stroke="#6b4a22"
        strokeWidth="6"
      />
      <rect
        x={x + 1}
        y={y + 1}
        width={w - 2}
        height={h - 2}
        fill="none"
        stroke="#b8924a"
        strokeWidth="2"
        opacity="0.55"
      />
      <path d={d} fill="#6e1f1f" stroke="#2b0c0c" strokeWidth="3" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#c9a24b" strokeWidth="2" opacity="0.8" />
    </g>
  );
}

/** The ornament hung on the screen before the play, on its own rod, swaying a little. */
function Showpiece({
  art,
  liftedAt,
  time,
  nowMs,
}: {
  art: { image: string; width: number; height: number };
  liftedAt: number | null;
  time: number;
  nowMs: number;
}) {
  const h = SCREEN.h * 0.6;
  const w = (art.width / art.height) * h;
  const cx = SCREEN.x + SCREEN.w / 2;
  const bottom = GROUND_Y + 8;
  const t = liftedAt === null ? 0 : Math.min(1, Math.max(0, (nowMs - liftedAt) / LIFT_MS));
  if (t >= 1) return null;
  const lift = t * t * (bottom + h * 0.2);
  const sway = Math.sin(time * 1.1) * 1.2 + (t > 0 ? Math.sin(t * 18) * 2 * (1 - t) : 0);
  const rodW = 9;
  return (
    <g clipPath="url(#perde-screen-clip)">
      <g
        transform={`translate(${cx} ${bottom - lift}) rotate(${sway.toFixed(2)})`}
        style={{ mixBlendMode: 'multiply', filter: 'url(#perde-pressed)' }}
      >
        <image href={art.image} x={-w / 2} y={-h} width={w} height={h} preserveAspectRatio="none" />
        <g opacity="0.78">
          <line
            x1={0}
            y1={-h * 0.08}
            x2={-16}
            y2={STAGE_H}
            stroke={SHADOW_INK}
            strokeWidth={rodW}
            strokeLinecap="round"
          />
          <circle cx={0} cy={-h * 0.08} r={rodW * 0.9} fill={SHADOW_INK} />
        </g>
      </g>
    </g>
  );
}
