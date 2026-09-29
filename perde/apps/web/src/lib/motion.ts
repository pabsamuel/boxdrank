import { NEUTRAL_POSE, type Pose } from '@perde/shared';

/**
 * Phone motion → puppet pose.
 *
 * Hold the phone upright like a puppet rod. Tilting it sideways leans the
 * puppet, tipping it forward/back raises the arm, and a little bounce hops.
 * Left/right travel comes from turning the phone (compass yaw, recentred on
 * demand) or from dragging on the touch strip, whichever moved last.
 */

export interface Orientation {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
}

export interface MotionCalibration {
  alpha0: number;
  beta0: number;
}

export const DEFAULT_CALIBRATION: MotionCalibration = { alpha0: 0, beta0: 40 };

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Smallest signed difference between two headings in degrees. */
export function headingDelta(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export interface PoseInputs {
  orientation: Orientation;
  calibration: MotionCalibration;
  /** Vertical acceleration without gravity, m/s². */
  bounce: number;
  /** Touch strip position, or null when not touching. */
  touchX: number | null;
  talking: boolean;
  /** Previous pose, for smoothing. */
  prev: Pose;
}

const DEADZONE_DEG = 4;
const YAW_RANGE_DEG = 50;
const LEAN_RANGE_DEG = 40;
const ARM_RANGE_DEG = 45;

function shaped(deg: number, range: number): number {
  const sign = Math.sign(deg);
  const mag = Math.max(0, Math.abs(deg) - DEADZONE_DEG);
  return clamp(sign * (mag / (range - DEADZONE_DEG)));
}

/** Pure mapping so it can be unit-tested without a device. */
export function computePose(inp: PoseInputs): Pose {
  const { alpha, beta, gamma } = inp.orientation;
  const targetLean = gamma == null ? inp.prev.lean : shaped(gamma, LEAN_RANGE_DEG);
  const targetArm =
    beta == null ? inp.prev.arm : shaped(inp.calibration.beta0 - beta, ARM_RANGE_DEG);
  let targetX: number;
  if (inp.touchX != null) targetX = clamp(inp.touchX);
  else if (alpha != null)
    targetX = shaped(-headingDelta(alpha, inp.calibration.alpha0), YAW_RANGE_DEG);
  else targetX = inp.prev.x;
  const targetY = clamp(Math.max(0, inp.bounce - 1.5) / 6, 0, 1);
  const k = 0.35;
  const lerp = (a: number, b: number) => a + (b - a) * k;
  return {
    x: round(lerp(inp.prev.x, targetX)),
    y: round(Math.max(targetY, inp.prev.y * 0.8)),
    lean: round(lerp(inp.prev.lean, targetLean)),
    arm: round(lerp(inp.prev.arm, targetArm)),
    talking: inp.talking,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function poseChanged(a: Pose, b: Pose, eps = 0.004): boolean {
  return (
    a.talking !== b.talking ||
    Math.abs(a.x - b.x) > eps ||
    Math.abs(a.y - b.y) > eps ||
    Math.abs(a.lean - b.lean) > eps ||
    Math.abs(a.arm - b.arm) > eps
  );
}

export type MotionPermission = 'granted' | 'denied' | 'unsupported';

/** iOS 13+ needs an explicit, gesture-triggered permission; everyone else just works. */
export async function requestMotionPermission(): Promise<MotionPermission> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported';
  const anyEvent = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (typeof anyEvent.requestPermission === 'function') {
    try {
      const r = await anyEvent.requestPermission();
      const motion = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof motion.requestPermission === 'function')
        await motion.requestPermission().catch(() => undefined);
      return r === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'granted';
}

export interface MotionSource {
  start(): void;
  stop(): void;
  recenter(): void;
  readonly orientation: Orientation;
  readonly bounce: number;
  readonly calibration: MotionCalibration;
}

export function createMotionSource(): MotionSource {
  const orientation: Orientation = { alpha: null, beta: null, gamma: null };
  let bounce = 0;
  let calibration: MotionCalibration = { ...DEFAULT_CALIBRATION };
  const onOrientation = (e: DeviceOrientationEvent) => {
    orientation.alpha = e.alpha;
    orientation.beta = e.beta;
    orientation.gamma = e.gamma;
  };
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    if (!a) return;
    const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
    bounce = Math.max(mag, bounce * 0.7);
  };
  return {
    start() {
      window.addEventListener('deviceorientation', onOrientation);
      window.addEventListener('devicemotion', onMotion);
    },
    stop() {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
    },
    recenter() {
      calibration = {
        alpha0: orientation.alpha ?? 0,
        beta0: orientation.beta ?? DEFAULT_CALIBRATION.beta0,
      };
    },
    get orientation() {
      return orientation;
    },
    get bounce() {
      return bounce;
    },
    get calibration() {
      return calibration;
    },
  };
}

export { NEUTRAL_POSE };
