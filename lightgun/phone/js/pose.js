// Where the gun is, and where it points.
//
// Primary path: a WebXR `immersive-ar` session. On Android Chrome that is
// ARCore underneath, so we get visual-inertial 6DoF — camera features pin the
// yaw that a gyro alone would let drift. We never draw anything into the WebGL
// layer; we only want the pose, and the DOM overlay carries the whole UI.
//
// Fallback path: DeviceOrientation. Rotation only, no position, and it drifts.
// It exists so the controller still does something on a device without ARCore,
// and as an honest A/B control when measuring what 6DoF is worth.

import { forwardOf, norm, add, scale } from '../../shared/math.js';

export const TRACKING = {
  NONE: 'none',
  TRACKING: 'tracking',
  LIMITED: 'limited',
  LOST: 'lost',
};

export class PoseSource extends EventTarget {
  constructor() {
    super();
    this.mode = null;          // '6dof' | 'rotation'
    this.tracking = TRACKING.NONE;
    this.frames = 0;
    this.hz = 0;
    this._hzWindow = [];
    this.session = null;
    this.latest = null;        // { o, d, q, ts, tracking }
  }

  static async capabilities() {
    const xr = navigator.xr;
    const secure = window.isSecureContext;
    let ar = false;
    if (xr && xr.isSessionSupported) {
      try { ar = await xr.isSessionSupported('immersive-ar'); } catch { ar = false; }
    }
    return {
      secure,
      webxr: Boolean(xr),
      immersiveAr: ar,
      deviceOrientation: 'DeviceOrientationEvent' in window,
      needsMotionPermission:
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function',
    };
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); return this; }

  _publish(o, d, q, tracking) {
    const ts = performance.now();
    this.frames++;
    this._hzWindow.push(ts);
    while (this._hzWindow.length > 1 && ts - this._hzWindow[0] > 1000) this._hzWindow.shift();
    this.hz = this._hzWindow.length;
    this.tracking = tracking;
    this.latest = { o, d, q, ts, tracking };
    this.emit('pose', this.latest);
  }

  /* ------------------------------------------------------------- WebXR AR */

  async start6dof(overlayRoot) {
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: overlayRoot ? { root: overlayRoot } : undefined,
    });
    this.session = session;
    this.mode = '6dof';

    // A minimal GL layer is mandatory even though we draw nothing: the camera
    // feed shows through because we never clear to an opaque colour.
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true, antialias: false });
    await gl.makeXRCompatible();
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

    const refSpace = await session.requestReferenceSpace('local');
    this.refSpace = refSpace;

    // The overlay is our UI; stop AR "select" gestures hijacking taps on it.
    session.addEventListener('beforexrselect', (e) => e.preventDefault());
    session.addEventListener('end', () => {
      this.session = null;
      this.tracking = TRACKING.NONE;
      this.emit('ended');
    });
    session.addEventListener('visibilitychange', () => this.emit('visibility', session.visibilityState));

    const onFrame = (time, frame) => {
      session.requestAnimationFrame(onFrame);
      const pose = frame.getViewerPose(refSpace);
      if (!pose) {
        this.tracking = TRACKING.LOST;
        this.emit('pose', null);
        return;
      }
      const p = pose.transform.position;
      const r = pose.transform.orientation;
      const q = [r.x, r.y, r.z, r.w];
      // emulatedPosition means ARCore has fallen back to rotation-only: the
      // position is a guess, so a ray-plane intersection would slide around.
      const state = pose.emulatedPosition ? TRACKING.LIMITED : TRACKING.TRACKING;
      this._publish([p.x, p.y, p.z], forwardOf(q), q, state);
    };
    session.requestAnimationFrame(onFrame);
    this.emit('started', { mode: '6dof' });
    return session;
  }

  /* --------------------------------------------------- DeviceOrientation */

  async startRotationOnly() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') throw new Error('motion permission denied');
    }
    this.mode = 'rotation';
    const handler = (ev) => {
      if (ev.alpha === null) return;
      const q = quatFromEuler(ev.alpha, ev.beta, ev.gamma, screenAngle());
      // Reported as TRACKING once data flows. This mode drifts by nature and
      // says so at startup; raising a "tracking weak" alarm on every frame of
      // a mode that is permanently weak is noise, not information.
      this._publish([0, 0, 0], forwardOf(q), q, TRACKING.TRACKING);
    };
    this._doHandler = handler;
    const evName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, handler, true);
    this.emit('started', { mode: 'rotation', event: evName });
  }

  async stop() {
    if (this.session) { try { await this.session.end(); } catch {} }
    if (this._doHandler) {
      window.removeEventListener('deviceorientationabsolute', this._doHandler, true);
      window.removeEventListener('deviceorientation', this._doHandler, true);
      this._doHandler = null;
    }
    this.tracking = TRACKING.NONE;
  }

  /**
   * Average the pose over a short window. Used for calibration presses: the
   * mean of ~15 frames removes most hand tremor without the player noticing
   * they held the trigger a fraction of a second longer.
   */
  sampleAveraged(durationMs = 220) {
    return new Promise((resolve) => {
      const origins = [];
      const dirs = [];
      let worst = TRACKING.TRACKING;
      const onPose = (p) => {
        if (!p) { worst = TRACKING.LOST; return; }
        origins.push(p.o);
        dirs.push(p.d);
        if (p.tracking !== TRACKING.TRACKING) worst = p.tracking;
      };
      const listener = (e) => onPose(e.detail);
      this.addEventListener('pose', listener);
      setTimeout(() => {
        this.removeEventListener('pose', listener);
        if (!dirs.length) { resolve(null); return; }
        const o = scale(origins.reduce((a, v) => add(a, v), [0, 0, 0]), 1 / origins.length);
        const d = norm(dirs.reduce((a, v) => add(a, v), [0, 0, 0]));
        resolve({ o, d, samples: dirs.length, tracking: worst });
      }, durationMs);
    });
  }
}

/* ------------------------------------------------------------- utilities */

function screenAngle() {
  const so = screen.orientation && typeof screen.orientation.angle === 'number'
    ? screen.orientation.angle : (window.orientation || 0);
  return (so * Math.PI) / 180;
}

/** W3C device orientation (alpha, beta, gamma in degrees) -> quaternion. */
export function quatFromEuler(alphaDeg, betaDeg, gammaDeg, screenRad = 0) {
  const deg = Math.PI / 180;
  const z = alphaDeg * deg, x = betaDeg * deg, y = gammaDeg * deg;
  const cZ = Math.cos(z / 2), sZ = Math.sin(z / 2);
  const cX = Math.cos(x / 2), sX = Math.sin(x / 2);
  const cY = Math.cos(y / 2), sY = Math.sin(y / 2);
  // Z-X'-Y'' intrinsic, per the device orientation spec.
  let q = [
    sX * cY * cZ - cX * sY * sZ,
    cX * sY * cZ + sX * cY * sZ,
    cX * cY * sZ + sX * sY * cZ,
    cX * cY * cZ - sX * sY * sZ,
  ];
  if (screenRad) {
    const c = Math.cos(-screenRad / 2), s = Math.sin(-screenRad / 2);
    q = quatMul(q, [0, 0, s, c]); // compensate for a rotated screen
  }
  return q;
}

export function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
