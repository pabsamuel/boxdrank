import { NEUTRAL_POSE, type Pose } from '@perde/shared';

/**
 * Phone motion → puppet pose, the way a Karagöz rod behaves.
 *
 * Hold the phone upright like the rod. Moving the hand left/right slides the
 * puppet (accelerometer, integrated with zero-velocity resets so it never
 * drifts far); turning the arm adds to that (heading). Rolling the phone
 * leans the figure, tipping it back raises the arm, a quick lift hops.
 *
 * Orientation is taken from the rotation matrix, not the raw Euler angles,
 * so an upright phone (beta ≈ 90°, the gimbal-lock pose) behaves.
 * Everything is tunable live from the phone's settings panel.
 */

export interface MotionTuning {
  /** Degrees of arm turn for a full half-stage. */
  yawRangeDeg: number;
  /** Centimetres of sideways hand travel for a full half-stage. 0 disables. */
  travelCm: number;
  /** Degrees of roll for a full lean. */
  leanRangeDeg: number;
  /** Degrees of tipping back for a fully raised arm. */
  armRangeDeg: number;
  /** Centimetres of upward hand travel for a full hop. */
  hopCm: number;
  /** Output smoothing 0 (none) … 0.9 (syrup). */
  smoothing: number;
  /** m/s² below which the hand counts as still (sensor noise floor). */
  deadband: number;
  /** Flip if the puppet walks the wrong way. */
  invertX: boolean;
  /** Flip if the puppet leans the wrong way. */
  invertLean: boolean;
  /** iOS reports acceleration with the opposite sign to Android. */
  accelSign: 1 | -1;
}

export const DEFAULT_TUNING: MotionTuning = {
  yawRangeDeg: 45,
  travelCm: 25,
  leanRangeDeg: 35,
  armRangeDeg: 40,
  hopCm: 10,
  smoothing: 0.15,
  deadband: 0.4,
  invertX: false,
  invertLean: false,
  accelSign: 1,
};

const TUNING_KEY = 'perde.motion.v1';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function loadTuning(): MotionTuning {
  const base: MotionTuning = { ...DEFAULT_TUNING, accelSign: isIOS() ? -1 : 1 };
  try {
    const raw = localStorage.getItem(TUNING_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<MotionTuning>;
    return { ...base, ...parsed };
  } catch {
    return base;
  }
}

export function saveTuning(t: MotionTuning): void {
  try {
    localStorage.setItem(TUNING_KEY, JSON.stringify(t));
  } catch {
    /* private mode */
  }
}

export function resetTuning(): MotionTuning {
  try {
    localStorage.removeItem(TUNING_KEY);
  } catch {
    /* ignore */
  }
  return loadTuning();
}

// ---------------------------------------------------------------------------
// Orientation maths
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Row-major 3×3 rotation matrix, device → Earth (x East, y North, z up), per the DeviceOrientation spec. */
export function rotationMatrix(alphaDeg: number, betaDeg: number, gammaDeg: number): number[] {
  const cA = Math.cos(alphaDeg * DEG);
  const sA = Math.sin(alphaDeg * DEG);
  const cB = Math.cos(betaDeg * DEG);
  const sB = Math.sin(betaDeg * DEG);
  const cG = Math.cos(gammaDeg * DEG);
  const sG = Math.sin(gammaDeg * DEG);
  return [
    cA * cG - sA * sB * sG,
    -cB * sA,
    cA * sG + cG * sA * sB,
    cG * sA + cA * sB * sG,
    cA * cB,
    sA * sG - cA * cG * sB,
    -cB * sG,
    sB,
    cB * cG,
  ];
}

/** Gravity direction in device coordinates (unit vector). */
export function gravityInDevice(R: number[]): [number, number, number] {
  return [-R[6]!, -R[7]!, -R[8]!];
}

/** Sideways tilt of an upright phone, degrees; positive = top leans right. */
export function leanDeg(R: number[]): number {
  const [gx, gy] = gravityInDevice(R);
  return Math.atan2(gx, -gy) / DEG;
}

/** Tip of an upright phone, degrees; 0 upright, positive = top tipped back toward the holder, 90 = flat. */
export function pitchDeg(R: number[]): number {
  const [, gy, gz] = gravityInDevice(R);
  return Math.atan2(-gz, -gy) / DEG;
}

/** Where the back of the phone points, degrees clockwise from North. */
export function headingDeg(R: number[]): number {
  return Math.atan2(-R[2]!, -R[5]!) / DEG;
}

/** Smallest signed difference between two headings in degrees. */
export function headingDelta(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Device-frame acceleration expressed along the holder's right (+) and up (+), m/s². */
export function accelInWorld(
  R: number[],
  ax: number,
  ay: number,
  az: number,
): { lateral: number; up: number } {
  const ex = R[0]! * ax + R[1]! * ay + R[2]! * az;
  const ey = R[3]! * ax + R[4]! * ay + R[5]! * az;
  const ez = R[6]! * ax + R[7]! * ay + R[8]! * az;
  // The holder's "right" is the device x axis projected on the ground.
  const rx = R[0]!;
  const ry = R[3]!;
  const len = Math.hypot(rx, ry) || 1;
  return { lateral: (ex * rx + ey * ry) / len, up: ez };
}

// ---------------------------------------------------------------------------
// Translation tracking: leaky integration with zero-velocity resets
// ---------------------------------------------------------------------------

export interface AxisOptions {
  /** m/s² below which the hand counts as still. */
  deadband: number;
  /** Seconds of stillness before velocity is zeroed. */
  stillAfter: number;
  /** Velocity leak time constant, seconds. */
  leak: number;
  /** Position bounds, metres. */
  min: number;
  max: number;
}

export class TrackedAxis {
  v = 0;
  p = 0;
  private still = 0;
  constructor(public opts: AxisOptions) {}

  step(a: number, dt: number): number {
    if (Math.abs(a) < this.opts.deadband) {
      a = 0;
      this.still += dt;
    } else {
      this.still = 0;
    }
    this.v += a * dt;
    if (this.still >= this.opts.stillAfter) this.v = 0;
    this.v *= Math.exp(-dt / this.opts.leak);
    const next = this.p + this.v * dt;
    // A wall stops the hand's momentum; otherwise coming back would lag.
    if (next <= this.opts.min || next >= this.opts.max) this.v = 0;
    this.p = clamp(next, this.opts.min, this.opts.max);
    return this.p;
  }

  reset(): void {
    this.v = 0;
    this.p = 0;
    this.still = 0;
  }
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

export interface MotionSample {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  /** Acceleration without gravity, device frame, m/s². */
  ax: number;
  ay: number;
  az: number;
  /** Angular velocity around the device's top axis, deg/s (a wrist twist). */
  twistRate?: number;
  /** Seconds since the previous sample. */
  dt: number;
}

/** Gestures a puppeteer makes with the hand alone; no buttons. */
export type MotionGesture = 'turn' | 'bow';

export interface MotionReadout {
  headingDeg: number;
  leanDeg: number;
  pitchDeg: number;
  lateralAccel: number;
  upAccel: number;
  lateralCm: number;
  upCm: number;
  hasOrientation: boolean;
}

export class MotionModel {
  tuning: MotionTuning;
  private R: number[] | null = null;
  private heading0 = 0;
  private pitch0 = 0;
  private lateral: TrackedAxis;
  private up: TrackedAxis;
  private out: Pose = NEUTRAL_POSE;
  private readout: MotionReadout = {
    headingDeg: 0,
    leanDeg: 0,
    pitchDeg: 0,
    lateralAccel: 0,
    upAccel: 0,
    lateralCm: 0,
    upCm: 0,
    hasOrientation: false,
  };
  /** Where a drag left the puppet, added to the sensor position. */
  touchOffset = 0;
  private pendingGestures: MotionGesture[] = [];
  private twistCooldown = 0;
  private bowArmed = true;

  constructor(tuning: MotionTuning = DEFAULT_TUNING) {
    this.tuning = tuning;
    this.lateral = new TrackedAxis({
      deadband: 0.35,
      stillAfter: 0.12,
      leak: 0.8,
      min: -1,
      max: 1,
    });
    this.up = new TrackedAxis({ deadband: 0.6, stillAfter: 0.1, leak: 0.35, min: -0.05, max: 1 });
    this.applyBounds();
  }

  setTuning(t: MotionTuning): void {
    this.tuning = t;
    this.applyBounds();
  }

  private applyBounds() {
    const travel = Math.max(0.01, this.tuning.travelCm / 100);
    this.lateral.opts.min = -travel;
    this.lateral.opts.max = travel;
    this.lateral.opts.deadband = this.tuning.deadband;
    this.up.opts.deadband = this.tuning.deadband * 1.5;
    const hop = Math.max(0.01, this.tuning.hopCm / 100);
    this.up.opts.min = -hop * 0.3;
    this.up.opts.max = hop;
  }

  /** Make "here" the middle of the stage and the rest pitch. */
  recenter(): void {
    if (this.R) {
      this.heading0 = headingDeg(this.R);
      this.pitch0 = pitchDeg(this.R);
    }
    this.lateral.reset();
    this.up.reset();
    this.touchOffset = 0;
  }

  update(s: MotionSample): void {
    const dt = clamp(s.dt, 0.001, 0.05);
    if (s.alpha != null && s.beta != null && s.gamma != null) {
      this.R = rotationMatrix(s.alpha, s.beta, s.gamma);
      this.readout.hasOrientation = true;
    }
    const R = this.R ?? rotationMatrix(0, 90, 0);
    const sign = this.tuning.accelSign;
    const acc = accelInWorld(R, s.ax * sign, s.ay * sign, s.az * sign);
    this.lateral.step(acc.lateral, dt);
    this.up.step(acc.up, dt);
    this.readout.headingDeg = headingDeg(R);
    this.readout.leanDeg = leanDeg(R);
    this.readout.pitchDeg = pitchDeg(R);
    this.readout.lateralAccel = acc.lateral;
    this.readout.upAccel = acc.up;
    this.readout.lateralCm = this.lateral.p * 100;
    this.readout.upCm = this.up.p * 100;
    this.detectGestures(s, dt);
  }

  /** A sharp wrist twist turns the puppet around; tipping it well forward is a bow. */
  private detectGestures(s: MotionSample, dt: number): void {
    this.twistCooldown = Math.max(0, this.twistCooldown - dt);
    if (
      s.twistRate != null &&
      Math.abs(s.twistRate) > TWIST_DEG_PER_S &&
      this.twistCooldown === 0
    ) {
      this.pendingGestures.push('turn');
      this.twistCooldown = 0.7;
    }
    const pitch = this.readout.pitchDeg - this.pitch0;
    if (pitch < -BOW_DEG && this.bowArmed) {
      this.pendingGestures.push('bow');
      this.bowArmed = false;
    } else if (pitch > -BOW_DEG / 2) {
      this.bowArmed = true;
    }
  }

  /** Gestures detected since the last call. */
  takeGestures(): MotionGesture[] {
    const g = this.pendingGestures;
    this.pendingGestures = [];
    return g;
  }

  /** Sensor-only horizontal position, before touch offsets. */
  sensorX(): number {
    const t = this.tuning;
    const yaw = this.R
      ? headingDelta(headingDeg(this.R), this.heading0) / Math.max(5, t.yawRangeDeg)
      : 0;
    const travel = t.travelCm > 0 ? this.lateral.p / (t.travelCm / 100) : 0;
    return (t.invertX ? -1 : 1) * (yaw + travel);
  }

  pose(touchX: number | null, talking: boolean): Pose {
    const t = this.tuning;
    let x: number;
    if (touchX != null) {
      x = clamp(touchX);
      this.touchOffset = x - this.sensorX();
    } else {
      x = clamp(this.sensorX() + this.touchOffset);
    }
    const lean = this.R
      ? clamp(shaped(leanDeg(this.R), t.leanRangeDeg) * (t.invertLean ? -1 : 1))
      : 0;
    const arm = this.R ? clamp(shaped(pitchDeg(this.R) - this.pitch0, t.armRangeDeg)) : 0;
    const y = t.hopCm > 0 ? clamp(this.up.p / (t.hopCm / 100), 0, 1) : 0;
    const k = 1 - clamp(t.smoothing, 0, 0.9);
    const mix = (prev: number, next: number) => prev + (next - prev) * k;
    this.out = {
      x: round(mix(this.out.x, x)),
      y: round(mix(this.out.y, y)),
      lean: round(mix(this.out.lean, lean)),
      arm: round(mix(this.out.arm, arm)),
      talking,
    };
    return this.out;
  }

  current(): MotionReadout {
    return { ...this.readout };
  }
}

const DEADZONE_DEG = 2;
const TWIST_DEG_PER_S = 340;
const BOW_DEG = 32;

function shaped(deg: number, range: number): number {
  const sign = Math.sign(deg);
  const mag = Math.max(0, Math.abs(deg) - DEADZONE_DEG);
  return clamp(sign * (mag / Math.max(1, range - DEADZONE_DEG)));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function poseChanged(a: Pose, b: Pose, eps = 0.003): boolean {
  return (
    a.talking !== b.talking ||
    Math.abs(a.x - b.x) > eps ||
    Math.abs(a.y - b.y) > eps ||
    Math.abs(a.lean - b.lean) > eps ||
    Math.abs(a.arm - b.arm) > eps
  );
}

// ---------------------------------------------------------------------------
// Browser glue
// ---------------------------------------------------------------------------

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
  model: MotionModel;
  start(): void;
  stop(): void;
  recenter(): void;
}

/** Feeds DeviceOrientation + DeviceMotion events into a MotionModel. */
export function createMotionSource(model: MotionModel): MotionSource {
  const orientation = {
    alpha: null as number | null,
    beta: null as number | null,
    gamma: null as number | null,
  };
  let last = 0;
  const onOrientation = (e: DeviceOrientationEvent) => {
    orientation.alpha = e.alpha;
    orientation.beta = e.beta;
    orientation.gamma = e.gamma;
  };
  const onMotion = (e: DeviceMotionEvent) => {
    const now = performance.now();
    const dt = last ? (now - last) / 1000 : (e.interval ?? 16) / 1000;
    last = now;
    const a = e.acceleration;
    model.update({
      alpha: orientation.alpha,
      beta: orientation.beta,
      gamma: orientation.gamma,
      ax: a?.x ?? 0,
      ay: a?.y ?? 0,
      az: a?.z ?? 0,
      twistRate: e.rotationRate?.gamma ?? undefined,
      dt,
    });
  };
  return {
    model,
    start() {
      window.addEventListener('deviceorientation', onOrientation);
      window.addEventListener('devicemotion', onMotion);
    },
    stop() {
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('devicemotion', onMotion);
    },
    recenter() {
      model.recenter();
    },
  };
}

export { NEUTRAL_POSE };
