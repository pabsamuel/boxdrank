// End-to-end rehearsal with a simulated gun.
//
// A headless Chromium runs the real display client. A Node process plays the
// phone: it runs the *same* shared maths, walks the real calibration protocol,
// and streams aim packets at 60 Hz from a virtual player standing 2.6 m from a
// virtual 55" TV. Everything the display reports — calibration error, hit
// accuracy, packet rate, latency — is measured over the real WebSocket path.
//
//   node tests/e2e.js          (expects `npm start` to be running)

import { WebSocket } from 'ws';
import { chromium } from 'playwright';
import {
  add, sub, scale, norm, cross, dot, screenMetricsFromDiagonal,
  calibrate6dof, aimToScreen, OneEuro, clamp01,
} from '../shared/math.js';

const BASE = process.env.LG_BASE || 'http://127.0.0.1:8080';
const ROOM = 'E2ET';
const out = [];
let failures = 0;
const log = (s) => { out.push(s); console.log(s); };
function check(name, ok, detail = '') {
  if (!ok) failures++;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* --------------------------------------------------------- virtual physics */

const DIAG = 55;
const ASPECT = [16, 9];
const { widthM, heightM } = screenMetricsFromDiagonal(DIAG, ASPECT[0], ASPECT[1]);
const uAxis = [1, 0, 0];
const vAxis = [0, -1, 0];
const centre = [0, 1.15, -2.6];
const origin = sub(sub(centre, scale(uAxis, widthM / 2)), scale(vAxis, heightM / 2));
const screenPoint = (x, y) => add(add(origin, scale(uAxis, x * widthM)), scale(vAxis, y * heightM));

let eye = [0, 1.2, 0];
let seed = 99;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

/** The aiming ray a real hand would produce when pointing at (x, y). */
function aimRay(x, y, noiseDeg = 0.25) {
  const o = add(eye, [gauss() * 0.004, gauss() * 0.004, gauss() * 0.004]); // hand tremor
  let d = norm(sub(screenPoint(x, y), o));
  const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(ref, d));
  const e2 = norm(cross(d, e1));
  const a = (noiseDeg * Math.PI) / 180;
  d = norm(add(d, add(scale(e1, gauss() * a), scale(e2, gauss() * a))));
  return { o, d };
}

/* ------------------------------------------------------------ phone client */

class VirtualPhone {
  constructor() {
    this.ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`);
    this.handlers = new Map();
    this.model = null;
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.seq = 0;
    this.ready = new Promise((res) => (this._ready = res));
    // Mirror the real controller's twice-a-second status beacon.
    this.statusTimer = setInterval(() => this.send({
      t: 'status', mode: '6dof', tracking: 'tracking', poseHz: 60,
      aimHz: this.aimCount || 0, calibrated: Boolean(this.model),
      rms: this.model ? this.model.rmsErrorScreen : null,
    }) || (this.aimCount = 0), 500);
    this.ws.on('open', () => {
      this.send({ t: 'hello', role: 'phone', room: ROOM, name: 'virtual' });
    });
    this.ws.on('message', (buf) => {
      const m = JSON.parse(buf);
      if (m.t === 'welcome') { this.id = m.id; this._ready(); }
      if (m.to != null && this.id != null && m.to !== this.id) return;
      if (m.t === 'ping') this.send({ t: 'pong', a: m.a, b: now() });
      for (const h of this.handlers.get(m.t) || []) h(m);
    });
  }
  on(t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, []);
    this.handlers.get(t).push(fn);
    return this;
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  waitFor(t, timeout = 15000) {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`timeout waiting for ${t}`)), timeout);
      this.on(t, (m) => { clearTimeout(timer); res(m); });
    });
  }
  aimAt(x, y, noiseDeg = 0.25) {
    const r = aimRay(x, y, noiseDeg);
    const hit = this.model ? aimToScreen(this.model, r.o, r.d) : null;
    if (!hit) return null;
    const t = now() / 1000;
    const fx = clamp01(this.fx.filter(hit.x, t));
    const fy = clamp01(this.fy.filter(hit.y, t));
    return { x: fx, y: fy, truth: { x, y } };
  }
  sendAim(a) {
    const ts = now();
    this.aimCount = (this.aimCount || 0) + 1;
    this.send({ t: 'aim', x: a.x, y: a.y, ts, pts: ts - 4, seq: this.seq++, tr: 'tracking', off: 0 });
  }
  fire(a) {
    const ts = now();
    this.send({ t: 'fire', x: a.x, y: a.y, ts, pts: ts - 4, seq: this.seq++ });
  }
}

const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------- run */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

await page.goto(`${BASE}/?room=${ROOM}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__lightgun && window.__lightgun.net.connected, null, { timeout: 10000 });
check('display client boots and connects', true);
await page.waitForSelector('#qr[src]');
await sleep(600);
await page.screenshot({ path: 'docs/shot-lobby.png' });

const phone = new VirtualPhone();
await phone.ready;

/* --------------------------------------------------------- 1. calibration */

const CAL = await page.evaluate(() => window.__lightgun.CALIB_POSITIONS);
const CALIB_RECT = await page.evaluate(() => window.__lightgun.CALIB_RECT);
const rays = [];
const calStart = now();

phone.on('calibStart', async (m) => {
  const order = m.points === 3
    ? ['TOP LEFT', 'TOP RIGHT', 'BOTTOM LEFT']
    : ['TOP LEFT', 'TOP RIGHT', 'BOTTOM RIGHT', 'BOTTOM LEFT'];
  for (let i = 0; i < order.length; i++) {
    phone.send({ t: 'calibStep', index: i, label: order[i], total: order.length });
    await sleep(500);                 // the player finds the marker and aims
    const [x, y] = CAL[order[i]];
    // 220 ms of averaged samples, exactly like the real controller.
    const samples = Array.from({ length: 13 }, () => aimRay(x, y, 0.25));
    rays.push({
      o: scale(samples.reduce((a, s) => add(a, s.o), [0, 0, 0]), 1 / samples.length),
      d: norm(samples.reduce((a, s) => add(a, s.d), [0, 0, 0])),
    });
    phone.send({ t: 'calibCaptured', index: i, samples: samples.length });
    await sleep(120);
  }
  phone.model = calibrate6dof(rays, widthM, heightM, { rect: CALIB_RECT });
  phone.send({
    t: 'calibDone',
    rmsErrorM: phone.model.rmsErrorM,
    rmsErrorScreen: phone.model.rmsErrorScreen,
    scaleErrorW: phone.model.scaleErrorW,
    scaleErrorH: phone.model.scaleErrorH,
    distanceM: phone.model.solve.ranges.reduce((a, b) => a + b, 0) / rays.length,
    mode: '6dof',
  });
});

phone.send({ t: 'gunReady', mode: '6dof' });
await phone.waitFor('calibStart');
await page.waitForFunction(() => window.__lightgun.state.mode === 'calibrate', null, { timeout: 5000 });
await sleep(400);
await page.screenshot({ path: 'docs/shot-calibrate.png' });

await page.waitForFunction(
  () => [...window.__lightgun.state.players.values()].some((p) => p.calibrated),
  null, { timeout: 20000 });
const calSeconds = (now() - calStart) / 1000;
log(`      calibration wall-clock: ${calSeconds.toFixed(1)} s (4 points, 500 ms of aiming each)`);
check('calibration completes under 15 s', calSeconds < 15, `${calSeconds.toFixed(1)} s`);
check('calibration error is small',
  phone.model.rmsErrorScreen < 0.02,
  `${(phone.model.rmsErrorScreen * 100).toFixed(2)}% of screen width`);
log(`      solved range ${(phone.model.solve.ranges.reduce((a, b) => a + b, 0) / 4).toFixed(2)} m (true ~2.6 m), scale error ${(phone.model.scaleErrorW * 100).toFixed(2)}%`);

/* ----------------------------------------------------- 2. aim + test mode */

await page.waitForFunction(() => window.__lightgun.state.mode === 'test', null, { timeout: 12000 });
check('display reaches test mode after the countdown', true);

// Stream aim at 60 Hz while sweeping to each marker and firing.
const markers = await page.evaluate(() => window.__lightgun.MARKERS);
let streamed = 0;
const streamStart = now();
for (const marker of markers) {
  for (let i = 0; i < 24; i++) {                  // ~400 ms settling per marker
    const a = phone.aimAt(marker.x, marker.y);
    if (a) { phone.sendAim(a); streamed++; }
    await sleep(16);
  }
  const shot = phone.aimAt(marker.x, marker.y);
  if (shot) phone.fire(shot);
  await sleep(60);
}
const streamSeconds = (now() - streamStart) / 1000;
await sleep(400);
await page.screenshot({ path: 'docs/shot-test.png' });

const testResults = await page.evaluate(() => {
  const s = window.__lightgun.state;
  const p = [...s.players.values()][0];
  const st = (a) => {
    if (!a || !a.length) return null;
    const x = [...a].sort((m, n) => m - n);
    return { mean: x.reduce((m, n) => m + n, 0) / x.length, p95: x[Math.floor(x.length * 0.95)], n: x.length };
  };
  return {
    hits: [...s.testHits.entries()].map(([id, h]) => ({ id, errPct: h.errPct })),
    net: st(p.latency.net),
    pose: st(p.latency.pose),
    render: st(p.latency.render),
    aimHz: p.aimHz,
    packets: p.packets,
    fps: s.fps,
  };
});

const errs = testResults.hits.map((h) => h.errPct);
const meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
log(`      markers hit ${testResults.hits.length}/${markers.length}, mean error ${meanErr.toFixed(2)}%, worst ${Math.max(...errs).toFixed(2)}% of screen width`);
check('every test marker registers a shot', testResults.hits.length === markers.length);
check('shots land within 3% of screen width of the marker', Math.max(...errs) < 3,
  `worst ${Math.max(...errs).toFixed(2)}%`);

log(`      aim packet rate ${(streamed / streamSeconds).toFixed(0)} Hz sent, display saw ${testResults.aimHz} Hz`);
log(`      latency  transport ${testResults.net.mean.toFixed(2)} ms (p95 ${testResults.net.p95.toFixed(2)})  pose->display ${testResults.pose.mean.toFixed(2)} ms  ->pixels +${testResults.render ? testResults.render.mean.toFixed(2) : '?'} ms`);
log(`      display fps ${testResults.fps.toFixed(0)}`);
check('loopback transport latency is well under one frame',
  testResults.net.p95 < 16, `p95 ${testResults.net.p95.toFixed(2)} ms`);
check('display keeps up with the aim stream', testResults.fps > 45, `${testResults.fps.toFixed(0)} fps`);

/* ----------------------------------------------------------- 3. the game */

await page.keyboard.press('g');
await page.waitForFunction(() => window.__lightgun.state.mode === 'game', null, { timeout: 12000 });

let shotsFired = 0;
const deadline = now() + 8000;
while (now() < deadline) {
  const targets = await page.evaluate(() =>
    window.__lightgun.game.targets.filter((t) => t.type !== 'noshoot').map((t) => ({ x: t.x, y: t.y })));
  if (targets.length) {
    const t = targets[0];
    for (let i = 0; i < 6; i++) {
      const a = phone.aimAt(t.x, t.y, 0.15);
      if (a) phone.sendAim(a);
      await sleep(16);
    }
    const a = phone.aimAt(t.x, t.y, 0.15);
    if (a) { phone.fire(a); shotsFired++; }
  }
  await sleep(90);
}
const gameState = await page.evaluate(() => ({
  score: window.__lightgun.game.score,
  hits: window.__lightgun.game.hits,
  shots: window.__lightgun.game.shots,
}));
log(`      game: ${gameState.hits}/${gameState.shots} hits, score ${gameState.score} (virtual gun fired ${shotsFired})`);
await page.screenshot({ path: 'docs/shot-game.png' });
check('shooting a target scores', gameState.score > 0 && gameState.hits > 0,
  `${gameState.hits} hits`);
check('hit rate against live targets is high',
  gameState.shots > 0 && gameState.hits / gameState.shots > 0.6,
  `${Math.round((gameState.hits / gameState.shots) * 100)}%`);

/* ------------------------------------- 4. the player walks around mid-round */

eye = [0.6, 1.1, 0.45];
await sleep(100);
let movedErrs = [];
for (const marker of markers) {
  let a = null;
  // Settle on the marker first: a single sample would only measure filter lag.
  for (let i = 0; i < 20; i++) { a = phone.aimAt(marker.x, marker.y, 0.2); await sleep(16); }
  if (a) movedErrs.push(Math.hypot(a.x - marker.x, (a.y - marker.y) * 9 / 16) * 100);
}
const movedMean = movedErrs.reduce((a, b) => a + b, 0) / movedErrs.length;
log(`      after stepping 0.9 m: mean aim error ${movedMean.toFixed(2)}% of screen width (no recalibration)`);
check('aim survives the player moving, with no recentring', movedMean < 6,
  `${movedMean.toFixed(2)}%`);

/* --------------------------------------------------------------- wrap up */

check('no uncaught errors in the display client', pageErrors.length === 0,
  pageErrors.slice(0, 3).join(' | '));

await browser.close();
phone.ws.close();
console.log(`\n${failures === 0 ? 'ALL E2E CHECKS PASSED' : failures + ' E2E CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
