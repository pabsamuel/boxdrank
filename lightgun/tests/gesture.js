// Does the recoil trigger fire when you flick, and stay quiet when you aim?
//
// Both halves matter equally. A trigger that misses flicks is annoying; a
// trigger that goes off while you are lining up a shot makes the gun unusable,
// and on iOS — where this is the only thing that makes the phone feel like a
// gun rather than a touchscreen — it is the whole feature.
//
//   node tests/gesture.js

import { RecoilTrigger, AimHistory } from '../phone/js/gesture.js';

let failures = 0;
const out = [];
function check(name, ok, detail = '') {
  if (!ok) failures++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/* --------------------------------------------------- a fake motion stream */

// Node has no DeviceMotionEvent; the detector only ever reads two fields.
let clock = 0;
const motion = (spinDegPerSec, accel) => ({
  timeStamp: (clock += 1000 / 60),          // samples arrive at 60 Hz
  rotationRate: { alpha: 0, beta: spinDegPerSec, gamma: 0 },
  acceleration: { x: 0, y: accel, z: 0 },
});

/** Feed a sequence of samples at 60 Hz and count how many shots came out. */
function run(trigger, samples) {
  clock = 0;
  const fired = [];
  trigger.addEventListener('recoil', (e) => fired.push(e.detail));
  for (const [spin, accel] of samples) trigger._onMotion(motion(spin, accel));
  return fired;
}

const steady = (n, spin = 8, accel = 0.3) => Array.from({ length: n }, () => [spin, accel]);
// A flick: sharp rise, short peak, settle. Roughly what a wrist snap produces.
const flick = () => [
  [120, 3], [420, 9], [640, 14], [520, 11], [260, 6],
  [120, 3], [50, 1], [20, 0.5], ...steady(20),
];

/* ------------------------------------------------- 1. quiet aiming is quiet */

{
  const t = new RecoilTrigger();
  // Three seconds of holding still, with the small wobble a real hand has.
  const hand = Array.from({ length: 180 }, (_, i) => [8 + (i % 7) * 3, 0.2 + (i % 5) * 0.1]);
  const fired = run(t, hand);
  check('holding the gun still never fires', fired.length === 0, `${fired.length} shots`);
}

{
  const t = new RecoilTrigger();
  // Sweeping across the screen to acquire a target: continuous, not sharp.
  const sweep = Array.from({ length: 120 }, () => [150, 2.5]);
  const fired = run(t, sweep);
  check('sweeping to a new target never fires', fired.length === 0, `${fired.length} shots`);
}

/* ----------------------------------------------------- 2. a flick fires once */

{
  const t = new RecoilTrigger();
  const fired = run(t, [...steady(10), ...flick()]);
  check('one flick fires exactly one shot', fired.length === 1, `${fired.length} shots`);
}

{
  const t = new RecoilTrigger();
  const fired = run(t, [...steady(10), ...flick(), ...steady(30), ...flick(), ...steady(30), ...flick()]);
  check('three flicks fire three shots', fired.length === 3, `${fired.length} shots`);
}

/* ------------------------------------------- 3. one flick cannot double-fire */

{
  const t = new RecoilTrigger();
  // A flick that rings out rather than settling cleanly — the wrist bouncing.
  const ringing = [
    [120, 3], [640, 14], [400, 9], [520, 12], [380, 8], [430, 10],
    [200, 4], [90, 2], ...steady(30),
  ];
  const fired = run(t, [...steady(10), ...ringing]);
  check('a bouncing flick still only fires once', fired.length === 1, `${fired.length} shots`);
}

/* ------------------------------------------------- 4. the aim look-back */

{
  const h = new AimHistory(600);
  // The gun tracks steadily onto a target, then the flick swings it away.
  let t = 0;
  for (let i = 0; i < 40; i++) h.push(0.5, 0.5, (t += 16));   // parked on target
  const flickStart = t;
  for (let i = 0; i < 10; i++) h.push(0.5, 0.5 - i * 0.03, (t += 16)); // muzzle rises

  const now = t;
  const naive = h.items[h.items.length - 1];
  const past = h.at(now, 160);
  out.push(`      at the flick: aim had moved to y=${naive.y.toFixed(3)}; look-back gives y=${past.y.toFixed(3)}`);
  check('look-back recovers the aim from before the flick',
    Math.abs(past.y - 0.5) < 0.02, `y=${past.y.toFixed(3)}`);
  check('the naive "current aim" really would have missed',
    Math.abs(naive.y - 0.5) > 0.2, `y=${naive.y.toFixed(3)}`);
  check('look-back never returns nothing', h.at(now, 5000) !== null);
}

{
  const h = new AimHistory(600);
  check('an empty history returns nothing rather than throwing', h.at(1000, 160) === null);
  h.push(0.1, 0.2, 100);
  check('a single sample is returned whatever the look-back', h.at(120, 160).x === 0.1);
}

{
  // The window must not grow without bound during a long session.
  const h = new AimHistory(600);
  for (let i = 0; i < 5000; i++) h.push(0.5, 0.5, i * 16);
  check('history stays bounded over a long session', h.items.length < 50,
    `${h.items.length} samples`);
}

/* --------------------------------------------- 5. sensitivity is adjustable */

{
  const gentle = new RecoilTrigger({ spinThreshold: 150, jerkThreshold: 2 });
  const soft = [[60, 1], [180, 3], [220, 4], [120, 2], [40, 1], ...steady(20)];
  check('a lower threshold catches a gentler flick',
    run(gentle, [...steady(10), ...soft]).length === 1);

  const strict = new RecoilTrigger({ spinThreshold: 900, jerkThreshold: 25 });
  check('a higher threshold ignores the same flick',
    run(strict, [...steady(10), ...flick()]).length === 0);
}

/* ------------------------------------------------ 6. missing sensor fields */

{
  const t = new RecoilTrigger();
  let threw = false;
  try {
    t._onMotion({});                                   // no fields at all
    t._onMotion({ rotationRate: null, acceleration: null });
    t._onMotion({ accelerationIncludingGravity: { x: 0, y: 9.81, z: 0 } });
  } catch { threw = true; }
  check('a device that reports partial motion data does not crash', !threw);
}

console.log(out.join('\n'));
console.log(`\n${failures === 0 ? 'ALL GESTURE TESTS PASSED' : failures + ' GESTURE TEST(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
