// Core aiming math. Shared verbatim between the phone controller (browser)
// and the node test-suite, so the solver we ship is the solver we measure.
//
// Coordinate conventions
// ----------------------
// Poses come from WebXR `local` reference space: right-handed, +Y up, metres.
// A device's forward (camera) axis is -Z in its own frame, so the aiming ray
// direction is rotate(orientation, [0, 0, -1]).
//
// Screen coordinates are the usual normalised display coordinates:
// (0,0) top-left, (1,1) bottom-right.

/* ------------------------------------------------------------------ vectors */

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.sqrt(dot(a, a));
export function norm(a) {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
}

/** Rotate vector v by quaternion q = [x, y, z, w] (WebXR / glTF ordering). */
export function rotateByQuat(q, v) {
  const [x, y, z, w] = q;
  // t = 2 * (q_vec x v); v' = v + w*t + q_vec x t
  const t = scale(cross([x, y, z], v), 2);
  return add(add(v, scale(t, w)), cross([x, y, z], t));
}

/** Device forward axis (-Z) in world space. */
export const forwardOf = (q) => norm(rotateByQuat(q, [0, 0, -1]));

/* ---------------------------------------------------------- linear solving */

/** Solve A x = b by Gaussian elimination with partial pivoting. A is n x n. */
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    }
    if (Math.abs(M[piv][c]) < 1e-14) return null; // singular
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/** Least squares for an over-determined system, via normal equations. */
export function solveLeastSquares(J, r) {
  const m = J.length;
  const n = J[0].length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    for (let a = 0; a < n; a++) {
      b[a] += J[i][a] * r[i];
      for (let c = 0; c < n; c++) A[a][c] += J[i][a] * J[i][c];
    }
  }
  return { A, b };
}

/* ------------------------------------------------------- physical geometry */

/** Physical width/height in metres from a diagonal in inches + pixel aspect. */
export function screenMetricsFromDiagonal(diagInches, aspectW, aspectH) {
  const diagM = diagInches * 0.0254;
  const k = diagM / Math.hypot(aspectW, aspectH);
  return { widthM: aspectW * k, heightM: aspectH * k };
}

/* ------------------------------------------------- 6DoF screen calibration */
//
// Given N aiming rays captured while the player pointed at known corners of a
// rectangle of known physical size, recover where that rectangle sits in world
// space. Unknowns are one range per ray (how far along the ray the corner is),
// which is the minimal parameterisation and keeps the problem tiny and stable.
//
// Corner order is always TL, TR, BR, BL.
//
// 4 rays -> 4 unknowns, 7 residuals (4 edge lengths + 3 parallelogram closure).
// 3 rays (TL, TR, BL) -> 3 unknowns, 3 residuals (2 edges + perpendicularity).
//
// Metric scale is supplied by the player's stated screen size, which is what
// makes the solution unique even when the phone does not translate between
// calibration shots.

function cornersFromRanges(rays, t) {
  return rays.map((ray, i) => add(ray.o, scale(ray.d, t[i])));
}

function residuals4(rays, t, W, H) {
  const [q1, q2, q3, q4] = cornersFromRanges(rays, t);
  const closure = add(sub(q1, q2), sub(q3, q4)); // q1 - q2 + q3 - q4 = 0
  return [
    len(sub(q2, q1)) - W,
    len(sub(q3, q4)) - W,
    len(sub(q4, q1)) - H,
    len(sub(q3, q2)) - H,
    closure[0],
    closure[1],
    closure[2],
  ];
}

function residuals3(rays, t, W, H) {
  const [q1, q2, q4] = cornersFromRanges(rays, t);
  const u = sub(q2, q1);
  const v = sub(q4, q1);
  return [
    len(u) - W,
    len(v) - H,
    // Perpendicularity, normalised so it is dimensionally a length like the
    // other two residuals and the solver weights it sensibly.
    dot(u, v) / Math.max(1e-6, Math.sqrt(W * H)),
  ];
}

/** Initial range guess from the angle subtended by two rays across a span. */
function rangeGuess(rayA, rayB, spanM) {
  const c = Math.min(1, Math.max(-1, dot(rayA.d, rayB.d)));
  const ang = Math.acos(c);
  if (ang < 1e-4) return 3.0;
  return Math.max(0.3, spanM / (2 * Math.tan(ang / 2)));
}

/**
 * Levenberg-Marquardt fit of the screen rectangle to the calibration rays.
 * @param {{o:number[],d:number[]}[]} rays  3 (TL,TR,BL) or 4 (TL,TR,BR,BL) rays
 * @param {number} W physical screen width, metres
 * @param {number} H physical screen height, metres
 */
export function solveScreenRanges(rays, W, H, { iterations = 60 } = {}) {
  const three = rays.length === 3;
  const resid = three
    ? (t) => residuals3(rays, t, W, H)
    : (t) => residuals4(rays, t, W, H);

  const diag = Math.hypot(W, H);
  const seed = three
    ? rangeGuess(rays[0], rays[2], H)
    : rangeGuess(rays[0], rays[2], diag);
  let t = new Array(rays.length).fill(Math.min(12, Math.max(0.4, seed)));

  let lambda = 1e-3;
  let cost = resid(t).reduce((s, v) => s + v * v, 0);

  for (let iter = 0; iter < iterations; iter++) {
    const r = resid(t);
    const n = t.length;
    const J = r.map(() => new Array(n).fill(0));
    for (let c = 0; c < n; c++) {
      const eps = 1e-6 * Math.max(1, Math.abs(t[c]));
      const tp = t.slice(); tp[c] += eps;
      const tm = t.slice(); tm[c] -= eps;
      const rp = resid(tp);
      const rm = resid(tm);
      for (let i = 0; i < r.length; i++) J[i][c] = (rp[i] - rm[i]) / (2 * eps);
    }
    const { A, b } = solveLeastSquares(J, r);
    let applied = false;
    for (let attempt = 0; attempt < 8 && !applied; attempt++) {
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v)));
      const step = solveLinear(Ad, b.map((v) => -v));
      if (!step) {
        lambda *= 10;
        continue;
      }
      const tn = t.map((v, i) => v + step[i]);
      if (tn.some((v) => !(v > 0.05) || v > 60)) {
        lambda *= 10;
        continue;
      }
      const cn = resid(tn).reduce((s, v) => s + v * v, 0);
      if (cn < cost) {
        t = tn;
        cost = cn;
        lambda = Math.max(1e-9, lambda * 0.3);
        applied = true;
      } else {
        lambda *= 10;
      }
    }
    if (!applied || cost < 1e-14) break;
  }
  return { ranges: t, cost, rms: Math.sqrt(cost / Math.max(1, t.length)) };
}

/**
 * Build the screen model (plane + orthonormal axes) from solved corners.
 * The rectangle is re-squared in a least-squares sense so that later
 * ray-plane intersections map onto clean normalised coordinates.
 */
export function buildScreenModel(corners, W, H) {
  let [q1, q2, q3, q4] = corners;
  if (corners.length === 3) {
    // TL, TR, BL -> infer BR by parallelogram closure.
    const [a, b, c] = corners;
    q1 = a; q2 = b; q4 = c; q3 = add(b, sub(c, a));
  }

  // Averaged edge directions are far more stable than any single edge.
  const uRaw = add(sub(q2, q1), sub(q3, q4));
  let vRaw = add(sub(q4, q1), sub(q3, q2));
  const uAxis = norm(uRaw);
  vRaw = sub(vRaw, scale(uAxis, dot(vRaw, uAxis))); // orthogonalise
  const vAxis = norm(vRaw);
  const normal = norm(cross(uAxis, vAxis));

  const centre = scale(add(add(q1, q2), add(q3, q4)), 0.25);
  const widthM = (len(sub(q2, q1)) + len(sub(q3, q4))) / 2;
  const heightM = (len(sub(q4, q1)) + len(sub(q3, q2))) / 2;
  const origin = sub(sub(centre, scale(uAxis, widthM / 2)), scale(vAxis, heightM / 2));

  const model = { origin, uAxis, vAxis, normal, widthM, heightM, nominalW: W, nominalH: H };

  // Residual: how far each measured corner sits from the idealised rectangle.
  const ideal = [
    origin,
    add(origin, scale(uAxis, widthM)),
    add(add(origin, scale(uAxis, widthM)), scale(vAxis, heightM)),
    add(origin, scale(vAxis, heightM)),
  ];
  const errs = [q1, q2, q3, q4].map((q, i) => len(sub(q, ideal[i])));
  model.cornerErrorsM = errs;
  model.rmsErrorM = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / 4);
  // Same error expressed as a fraction of the screen -> directly comparable to
  // how far off a shot will land, which is what actually matters to a player.
  model.rmsErrorScreen = model.rmsErrorM / Math.max(1e-6, widthM);
  model.scaleErrorW = widthM / W - 1;
  model.scaleErrorH = heightM / H - 1;
  return model;
}

/**
 * Calibration markers sit a few percent inside the screen edge, because a
 * marker drawn at the very corner is half off the panel and awkward to aim at.
 * So what we actually solve for is that inset rectangle; `rect` says where it
 * lives in normalised screen coordinates and we map back out at the end.
 */
export const DEFAULT_CALIB_RECT = { x0: 0.05, y0: 0.08, x1: 0.95, y1: 0.92 };

/** Full 6DoF calibration: rays in, screen model out. */
export function calibrate6dof(rays, screenW, screenH, opts = {}) {
  const rect = opts.rect || null;   // null = the markers really are the corners
  const W = rect ? (rect.x1 - rect.x0) * screenW : screenW;
  const H = rect ? (rect.y1 - rect.y0) * screenH : screenH;
  const sol = solveScreenRanges(rays, W, H, opts);
  const corners = cornersFromRanges(rays, sol.ranges);
  const model = buildScreenModel(corners, W, H);
  model.solve = sol;
  model.corners = corners;
  model.rect = rect;
  model.screenW = screenW;
  model.screenH = screenH;
  model.mode = '6dof';
  return model;
}

/** Inset-rectangle coordinates -> full-screen normalised coordinates. */
function unmapRect(rect, u, v) {
  return {
    x: rect.x0 + u * (rect.x1 - rect.x0),
    y: rect.y0 + v * (rect.y1 - rect.y0),
  };
}

/** Intersect an aiming ray with the calibrated screen plane. */
export function aimToScreen(model, o, d) {
  const denom = dot(d, model.normal);
  if (Math.abs(denom) < 1e-6) return null; // parallel to the screen
  const t = dot(sub(model.origin, o), model.normal) / denom;
  if (t <= 0) return null; // screen is behind the muzzle
  const X = add(o, scale(d, t));
  const rel = sub(X, model.origin);
  const u = dot(rel, model.uAxis) / model.widthM;
  const v = dot(rel, model.vAxis) / model.heightM;
  const p = model.rect ? unmapRect(model.rect, u, v) : { x: u, y: v };
  return { x: p.x, y: p.y, distanceM: t };
}

/* --------------------------------------- rotation-only (no-position) mode */
//
// Fallback for devices without WebXR, and a useful control condition when
// measuring how much the 6DoF path actually buys us.
//
// From a fixed viewpoint, a plane seen through a rotating camera maps to the
// image by a homography. Gnomonic-project each direction onto a tangent plane
// about the mean aiming axis, then fit the homography that sends the four
// calibration projections to the unit square.

function tangentBasis(axis) {
  const ref = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(ref, axis));
  const e2 = norm(cross(axis, e1));
  return { e1, e2 };
}

function gnomonic(axis, basis, d) {
  const z = dot(d, axis);
  if (z < 1e-3) return null; // more than ~90 deg off-axis
  return [dot(d, basis.e1) / z, dot(d, basis.e2) / z];
}

/** Direct linear transform for the homography mapping src[i] -> dst[i]. */
export function homographyFrom4(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }
  const h = solveLinear(A, b);
  if (!h) return null;
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

export function applyHomography(Hm, p) {
  const [x, y] = p;
  const w = Hm[2][0] * x + Hm[2][1] * y + Hm[2][2];
  if (Math.abs(w) < 1e-9) return null;
  return [
    (Hm[0][0] * x + Hm[0][1] * y + Hm[0][2]) / w,
    (Hm[1][0] * x + Hm[1][1] * y + Hm[1][2]) / w,
  ];
}

/** Rotation-only calibration from 3 or 4 aiming directions (TL,TR,BR,BL). */
export function calibrateRotation(dirs, rect = null) {
  let d = dirs.slice();
  if (d.length === 3) {
    // Approximate BR before projection; refined implicitly by the homography.
    d = [d[0], d[1], norm(add(sub(d[1], d[0]), d[2])), d[2]];
  }
  const axis = norm(d.reduce((a, v) => add(a, v), [0, 0, 0]));
  const basis = tangentBasis(axis);
  const src = d.map((v) => gnomonic(axis, basis, v));
  if (src.some((p) => !p)) return null;
  const Hm = homographyFrom4(src, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  if (!Hm) return null;
  return { mode: 'rotation', axis, basis, H: Hm, rect };
}

export function rotationAimToScreen(model, d) {
  const p = gnomonic(model.axis, model.basis, d);
  if (!p) return null;
  const q = applyHomography(model.H, p);
  if (!q) return null;
  return model.rect ? unmapRect(model.rect, q[0], q[1]) : { x: q[0], y: q[1] };
}

/* ------------------------------------------------------------- smoothing */

/**
 * One-Euro filter: low lag when the gun moves fast, low jitter when it rests.
 * Tuned so that a still hand is quiet without adding perceptible swim.
 */
export class OneEuro {
  // Defaults are in normalised-screen units per second: a resting hand moves at
  // ~0.02/s and a brisk sweep at ~1.5/s, so beta=5 lifts the cutoff from 1.5 Hz
  // (quiet) to ~9 Hz (≈18 ms of lag) exactly when the player is swinging.
  constructor({ minCutoff = 1.5, beta = 5.0, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }
  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(value, tSeconds) {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.t = tSeconds;
      return value;
    }
    const dt = Math.max(1e-3, Math.min(0.25, tSeconds - this.t));
    this.t = tSeconds;
    const dxRaw = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
