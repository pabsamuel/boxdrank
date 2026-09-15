// "Scrap Run" — a 60 second original shooting gallery.
// All art is drawn from polygons here; nothing is imported or traced.

const ROUND_MS = 60000;

export const TYPES = {
  normal:    { points: 100,  radius: 0.055, life: 2600, colour: '#35d0ff', label: '+100' },
  bonus:     { points: 500,  radius: 0.038, life: 1700, colour: '#ffd23d', label: '+500' },
  noshoot:   { points: -200, radius: 0.060, life: 3000, colour: '#ff4d3d', label: '-200' },
  explosive: { points: 200,  radius: 0.050, life: 2400, colour: '#ff9636', label: 'BOOM' },
};

const BLAST_RADIUS = 0.22;   // fraction of min(w, h)

export class Game {
  constructor() {
    this.reset();
    this.best = Number(localStorage.getItem('lightgun.best') || 0);
  }

  reset() {
    this.targets = [];
    this.effects = [];
    this.score = 0;
    this.combo = 1;
    this.streak = 0;
    this.hits = 0;
    this.misses = 0;
    this.mistakes = 0;
    this.shots = 0;
    this.startedAt = 0;
    this.endsAt = 0;
    this.running = false;
    this.nextSpawn = 0;
    this.perPlayer = new Map();
    this._id = 1;
  }

  start(now) {
    this.reset();
    this.running = true;
    this.startedAt = now;
    this.endsAt = now + ROUND_MS;
    this.nextSpawn = now + 250;
  }

  get remainingMs() {
    return Math.max(0, this.endsAt - this._now);
  }

  playerStats(id) {
    if (!this.perPlayer.has(id)) this.perPlayer.set(id, { score: 0, hits: 0, shots: 0 });
    return this.perPlayer.get(id);
  }

  /** Difficulty ramps by shrinking the gap between spawns as the round runs. */
  spawnIntervalMs(now) {
    const k = (now - this.startedAt) / ROUND_MS;
    return 620 - 300 * Math.min(1, k);
  }

  pickType(now) {
    const k = (now - this.startedAt) / ROUND_MS;
    const r = Math.random();
    if (r < 0.14 + 0.06 * k) return 'noshoot';
    if (r < 0.24 + 0.06 * k) return 'bonus';
    if (r < 0.34 + 0.08 * k) return 'explosive';
    return 'normal';
  }

  spawn(now) {
    const type = this.pickType(now);
    const spec = TYPES[type];
    const margin = spec.radius * 1.3;
    const t = {
      id: this._id++,
      type,
      spec,
      x: margin + Math.random() * (1 - 2 * margin),
      y: 0.12 + Math.random() * (0.82 - 0.12),
      born: now,
      dies: now + spec.life,
      vx: (Math.random() - 0.5) * 0.06,
      vy: (Math.random() - 0.5) * 0.04,
      phase: Math.random() * Math.PI * 2,
      dead: false,
    };
    this.targets.push(t);
  }

  update(now, dt) {
    this._now = now;
    if (!this.running) return;
    if (now >= this.endsAt) { this.finish(); return; }

    // Keep the gallery busy: a thin screen is boring and makes the round feel
    // like waiting rather than shooting.
    const live = this.targets.filter((t) => !t.dead).length;
    if (now >= this.nextSpawn || live < 3) {
      this.spawn(now);
      this.nextSpawn = now + this.spawnIntervalMs(now) * (0.6 + Math.random() * 0.8);
    }

    const s = dt / 1000;
    for (const t of this.targets) {
      t.x += t.vx * s;
      t.y += t.vy * s;
      if (t.x < 0.06 || t.x > 0.94) t.vx *= -1;
      if (t.y < 0.12 || t.y > 0.92) t.vy *= -1;
    }
    // Letting a no-shoot expire is correct play, so it costs nothing.
    this.targets = this.targets.filter((t) => !t.dead && now < t.dies);
  }

  finish() {
    this.running = false;
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('lightgun.best', String(this.best));
    }
  }

  /**
   * Resolve a shot. Coordinates are normalised; `aspect` converts them so hit
   * circles stay circular on any screen shape.
   */
  shoot(playerId, x, y, now, aspect) {
    this.shots++;
    const ps = this.playerStats(playerId);
    ps.shots++;
    if (!this.running) return { kind: 'idle' };

    const hit = this.findTarget(x, y, aspect);
    if (!hit) {
      this.misses++;
      this.combo = 1;
      this.streak = 0;
      return { kind: 'miss' };
    }

    if (hit.type === 'noshoot') {
      hit.dead = true;
      this.mistakes++;
      this.combo = 1;
      this.streak = 0;
      this.score = Math.max(0, this.score + TYPES.noshoot.points);
      ps.score += TYPES.noshoot.points;
      this.effects.push({ kind: 'text', text: 'CIVILIAN!', x, y, colour: '#ff4d3d', t: now, size: 34 });
      return { kind: 'penalty', points: TYPES.noshoot.points, target: hit };
    }

    this.hits++;
    ps.hits++;
    this.streak++;
    this.combo = Math.min(8, 1 + Math.floor(this.streak / 3));

    let gained = hit.spec.points * this.combo;
    hit.dead = true;
    const chained = [];

    if (hit.type === 'explosive') {
      this.effects.push({ kind: 'blast', x: hit.x, y: hit.y, t: now });
      for (const other of this.targets) {
        if (other.dead || other === hit) continue;
        const dx = (other.x - hit.x) * aspect;
        const dy = other.y - hit.y;
        if (Math.hypot(dx, dy) > BLAST_RADIUS) continue;
        // A blast clears no-shoots too, but they still cost you: collateral.
        other.dead = true;
        chained.push(other);
        gained += other.type === 'noshoot'
          ? TYPES.noshoot.points
          : other.spec.points * this.combo;
      }
    }

    this.score = Math.max(0, this.score + gained);
    ps.score += gained;
    this.effects.push({
      kind: 'text',
      text: `${gained > 0 ? '+' : ''}${gained}${this.combo > 1 ? ` x${this.combo}` : ''}`,
      x, y, colour: hit.spec.colour, t: now, size: 30 + this.combo * 2,
    });
    return { kind: 'hit', points: gained, target: hit, chained: chained.length };
  }

  findTarget(x, y, aspect) {
    let best = null;
    let bestD = Infinity;
    for (const t of this.targets) {
      if (t.dead) continue;
      const dx = (x - t.x) * aspect;
      const dy = y - t.y;
      const d = Math.hypot(dx, dy);
      if (d <= t.spec.radius && d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  /* --------------------------------------------------------------- drawing */

  draw(ctx, w, h, now) {
    const unit = Math.min(w, h);

    // Backdrop: a simple original scene — horizon band and scattered pylons.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1020');
    g.addColorStop(0.62, '#101a2c');
    g.addColorStop(1, '#070a12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 9; i++) {
      const px = ((i * 137) % 100) / 100 * w;
      const ph = h * (0.18 + ((i * 53) % 40) / 200);
      ctx.fillRect(px, h - ph, w * 0.035, ph);
    }
    ctx.strokeStyle = 'rgba(53,208,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.72);
    ctx.lineTo(w, h * 0.72);
    ctx.stroke();

    for (const t of this.targets) this.drawTarget(ctx, t, w, h, unit, now);

    this.effects = this.effects.filter((e) =>
      e.kind === 'blast'
        ? drawBlast(ctx, e, w, h, unit, now)
        : drawText(ctx, e, w, h, now));
  }

  drawTarget(ctx, t, w, h, unit, now) {
    const x = t.x * w;
    const y = t.y * h;
    const r = t.spec.radius * unit;
    const age = now - t.born;
    const inAnim = Math.min(1, age / 180);
    const outAnim = Math.min(1, Math.max(0, (t.dies - now) / 300));
    const s = inAnim * (0.85 + 0.15 * outAnim);
    const spin = now / 1000 + t.phase;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.shadowColor = t.spec.colour;
    ctx.shadowBlur = 24;

    if (t.type === 'normal') {
      polygon(ctx, 6, r, spin * 0.6, t.spec.colour, 'rgba(53,208,255,0.16)');
      ring(ctx, r * 0.45, t.spec.colour, 4);
    } else if (t.type === 'bonus') {
      star(ctx, 5, r, r * 0.45, -spin, t.spec.colour, 'rgba(255,210,61,0.22)');
    } else if (t.type === 'noshoot') {
      // Deliberately un-target-like: a flat shield with a bar through it.
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.85, -r * 0.35);
      ctx.lineTo(r * 0.6, r * 0.85);
      ctx.lineTo(-r * 0.6, r * 0.85);
      ctx.lineTo(-r * 0.85, -r * 0.35);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,77,61,0.20)';
      ctx.fill();
      ctx.strokeStyle = t.spec.colour;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.45, 0);
      ctx.lineTo(r * 0.45, 0);
      ctx.lineWidth = 7;
      ctx.stroke();
    } else if (t.type === 'explosive') {
      polygon(ctx, 3, r, spin * 1.4, t.spec.colour, 'rgba(255,150,54,0.22)');
      ring(ctx, r * 0.7 + Math.sin(now / 120) * 3, t.spec.colour, 3);
    }

    // Expiry clock: a shrinking arc, so the player can read urgency at a glance.
    const left = Math.max(0, (t.dies - now) / (t.dies - t.born));
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

function polygon(ctx, sides, r, rot, stroke, fill) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 5;
  ctx.stroke();
}

function star(ctx, points, outer, inner, rot, stroke, fill) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 4;
  ctx.stroke();
}

function ring(ctx, r, colour, width) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawText(ctx, e, w, h, now) {
  const age = now - e.t;
  const life = 900;
  if (age > life) return false;
  const k = age / life;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = e.colour;
  ctx.font = `900 ${e.size || 30}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(e.text, e.x * w, e.y * h - k * 70);
  ctx.restore();
  return true;
}

function drawBlast(ctx, e, w, h, unit, now) {
  const age = now - e.t;
  const life = 420;
  if (age > life) return false;
  const k = age / life;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#ff9636';
  ctx.lineWidth = 8 * (1 - k) + 2;
  ctx.beginPath();
  ctx.arc(e.x * w, e.y * h, BLAST_RADIUS * unit * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return true;
}
