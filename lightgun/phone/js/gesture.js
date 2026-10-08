// Recoil trigger: flick the phone like a pistol kicking, and it fires.
//
// The point is that the phone should feel like a gun rather than a touchscreen.
// A tap is precise but it feels like tapping glass; a recoil flick feels like
// firing, and on iOS — where there is no AR tracking to lean on — feel is most
// of what the controller has to offer.
//
// The detection problem: the flick itself moves the aim. By the time the spike
// is recognisable the muzzle has already left the target, so firing on the
// spike would land the shot high every time. The controller therefore keeps a
// short history of aim positions and uses the one from *before* the flick
// started. Same principle as the shot packet carrying its own coordinates.

/** Rotation-rate magnitude, deg/s, from a DeviceMotion event. */
function spinOf(ev) {
  const r = ev.rotationRate;
  if (!r) return 0;
  return Math.hypot(r.alpha || 0, r.beta || 0, r.gamma || 0);
}

/** Linear acceleration magnitude, m/s², gravity excluded where available. */
function jerkOf(ev) {
  const a = ev.acceleration || ev.accelerationIncludingGravity;
  if (!a) return 0;
  const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  // accelerationIncludingGravity sits at ~9.8 at rest; subtract so both
  // sources land on roughly the same scale.
  return ev.acceleration ? m : Math.abs(m - 9.81);
}

export class RecoilTrigger extends EventTarget {
  constructor({
    spinThreshold = 320,     // deg/s — a deliberate flick, not normal aiming
    jerkThreshold = 6,       // m/s²
    quietSpin = 90,          // must be calmer than this to re-arm
    cooldownMs = 320,        // no machine-gunning from one wobble
    lookbackMs = 160,        // how far back to take the aim from
  } = {}) {
    super();
    Object.assign(this, { spinThreshold, jerkThreshold, quietSpin, cooldownMs, lookbackMs });
    this.enabled = false;
    this.armed = true;
    // Not 0: that reads as "fired at time zero" and makes the cooldown
    // swallow every shot in the first moments of a session.
    this.lastFireAt = -Infinity;
    this.peakSpin = 0;
    this.spin = 0;
    this.jerk = 0;
    this.fires = 0;
    this._handler = null;
  }

  static needsPermission() {
    return typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function';
  }

  /** Must be called from a user gesture on iOS, or the prompt never appears. */
  static async requestPermission() {
    if (!RecoilTrigger.needsPermission()) return true;
    try {
      return (await DeviceMotionEvent.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  start() {
    if (this._handler) return;
    this._handler = (ev) => this._onMotion(ev);
    window.addEventListener('devicemotion', this._handler, true);
    this.enabled = true;
  }

  stop() {
    if (!this._handler) return;
    window.removeEventListener('devicemotion', this._handler, true);
    this._handler = null;
    this.enabled = false;
  }

  _onMotion(ev) {
    // The event's own timestamp where there is one: it is the time the sample
    // was taken, not the time we got round to handling it, and it keeps the
    // cooldown measuring the same clock the samples arrive on.
    const now = typeof ev.timeStamp === 'number' && ev.timeStamp > 0
      ? ev.timeStamp
      : performance.now();
    const spin = spinOf(ev);
    const jerk = jerkOf(ev);
    // Light smoothing: raw motion samples are spiky enough to false-trigger.
    this.spin = this.spin * 0.5 + spin * 0.5;
    this.jerk = this.jerk * 0.5 + jerk * 0.5;
    this.peakSpin = Math.max(this.peakSpin * 0.9, this.spin);

    if (!this.armed) {
      // Re-arm only once the hand has settled, so one flick is one shot.
      if (this.spin < this.quietSpin) this.armed = true;
      return;
    }
    if (now - this.lastFireAt < this.cooldownMs) return;
    if (this.spin < this.spinThreshold || this.jerk < this.jerkThreshold) return;

    this.armed = false;
    this.lastFireAt = now;
    this.fires++;
    this.dispatchEvent(new CustomEvent('recoil', {
      detail: { at: now, lookbackMs: this.lookbackMs, spin: this.spin, jerk: this.jerk },
    }));
  }
}

/**
 * Short history of aim positions, so a shot can be resolved to where the gun
 * was pointing before the player's own flick moved it.
 */
export class AimHistory {
  constructor(ms = 600) {
    this.windowMs = ms;
    this.items = [];
  }

  push(x, y, t) {
    this.items.push({ x, y, t });
    const cutoff = t - this.windowMs;
    while (this.items.length && this.items[0].t < cutoff) this.items.shift();
  }

  /** The aim as it was `ms` before `now`, or the closest sample we still have. */
  at(now, ms) {
    const target = now - ms;
    let best = null;
    for (const item of this.items) {
      if (item.t <= target) best = item;
      else break;
    }
    return best || this.items[0] || null;
  }
}
