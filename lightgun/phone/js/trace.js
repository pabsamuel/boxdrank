// Flight recorder for the gun.
//
// The bottleneck on this project is that real ARCore behaviour only exists in
// someone's living room. So the phone keeps a rolling buffer of raw poses and
// can ship it back: one real session then becomes data we can re-solve, re-tune
// and re-measure offline, as many times as we like, with no phone in the room.
//
// Kept deliberately cheap — a flat array of numbers, no objects per sample —
// because this runs inside the 60 Hz pose loop.

const TRACKING_CODE = { tracking: 0, limited: 1, lost: 2, none: 3 };
const CODE_TRACKING = ['tracking', 'limited', 'lost', 'none'];

const FIELDS = 8;              // t, ox, oy, oz, dx, dy, dz, trackingCode
const DEFAULT_SECONDS = 150;

export class Trace {
  constructor({ seconds = DEFAULT_SECONDS, hz = 60 } = {}) {
    this.capacity = Math.ceil(seconds * hz);
    this.buf = new Float32Array(this.capacity * FIELDS);
    this.count = 0;            // total samples ever written
    this.marks = [];
    this.meta = {};
    this.enabled = true;
    this.startedAt = Date.now();
    this.t0 = null;
  }

  setMeta(meta) { Object.assign(this.meta, meta); }

  /** Called from the pose loop. Must stay allocation-free. */
  add(o, d, tracking, ts) {
    if (!this.enabled) return;
    if (this.t0 === null) this.t0 = ts;
    const i = (this.count % this.capacity) * FIELDS;
    const b = this.buf;
    b[i] = ts - this.t0;
    b[i + 1] = o[0]; b[i + 2] = o[1]; b[i + 3] = o[2];
    b[i + 4] = d[0]; b[i + 5] = d[1]; b[i + 6] = d[2];
    b[i + 7] = TRACKING_CODE[tracking] ?? 3;
    this.count++;
  }

  /** Timestamped annotation: a shot, a calibration press, a re-zero. */
  mark(kind, data = {}) {
    if (!this.enabled) return;
    this.marks.push({ t: this.t0 === null ? 0 : performance.now() - this.t0, kind, ...data });
    if (this.marks.length > 2000) this.marks.shift();
  }

  /** Oldest-first samples, as plain rounded numbers ready for JSON. */
  samples() {
    const n = Math.min(this.count, this.capacity);
    const start = this.count > this.capacity ? this.count % this.capacity : 0;
    const out = new Array(n);
    const b = this.buf;
    for (let k = 0; k < n; k++) {
      const i = ((start + k) % this.capacity) * FIELDS;
      out[k] = [
        Math.round(b[i]),                     // ms, integer is plenty
        r(b[i + 1]), r(b[i + 2]), r(b[i + 3]),
        r(b[i + 4]), r(b[i + 5]), r(b[i + 6]),
        b[i + 7],
      ];
    }
    return out;
  }

  toJSON() {
    return {
      version: 1,
      startedAt: this.startedAt,
      durationMs: this.t0 === null ? 0 : Math.round(performance.now() - this.t0),
      fields: ['tMs', 'ox', 'oy', 'oz', 'dx', 'dy', 'dz', 'tracking'],
      trackingCodes: CODE_TRACKING,
      meta: this.meta,
      marks: this.marks,
      samples: this.samples(),
    };
  }
}

// Five decimals is ~1 cm at 100 m and well below ARCore's own noise floor, and
// it roughly halves the transfer size versus full float precision.
const r = (v) => Math.round(v * 1e5) / 1e5;

export { CODE_TRACKING };
