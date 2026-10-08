// Display UI measurement, at the size and distance it is actually read from.
//
// Two defects this file exists to prevent, both found by measuring rather than
// by looking:
//
//   1. The HUD sat at y=0. Televisions crop their edges by an amount nobody
//      can predict — 5% is the usual planning figure, 54px on 1080p — so the
//      score and the clock were the first things to be cut off.
//   2. The results buttons were 5.9% of screen height, while the gun's own
//      measured p95 aim error is 4.9% of screen *width*: on 16:9 that is 8.7%
//      of height. The buttons were smaller than the error that would be aimed
//      at them. Fitts's law applies to the pointer you actually have.
//
//   node tests/ui.js          (expects `npm start` to be running)

import { chromium } from 'playwright';

const BASE = process.env.LG_BASE || 'http://127.0.0.1:8080';
const W = 1920;
const H = 1080;

// From tests/run.js: 6DoF p95 aim error after the player moves 0.9 m without
// recalibrating — the worst case a player will actually meet.
const AIM_P95_PCT_OF_WIDTH = 4.9;
const AIM_P95_PX = (AIM_P95_PCT_OF_WIDTH / 100) * W;

// Broadcast title-safe: assume the set eats 5% of each edge.
const TITLE_SAFE_PX = Math.round(0.05 * H);

// Published 10-foot guidance puts the floor for text a player must read at
// around 22px on a 1080p canvas.
const TV_TEXT_FLOOR_PX = 22;

let failures = 0;
const log = (s) => console.log(s);
function check(name, ok, detail = '') {
  if (!ok) failures++;
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const pctW = (v) => `${(v * 100 / W).toFixed(1)}% of width`;
const pctH = (v) => `${(v * 100 / H).toFixed(1)}% of height`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(`${BASE}/display/`);
await page.waitForFunction(() => !!window.__lightgun);

/* ------------------------------------------------------------------- HUD */

await page.evaluate(() => {
  const { state, game, MODE } = window.__lightgun;
  state.mode = MODE.GAME;
  game.start(performance.now());
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
});
await page.waitForTimeout(350);

const hud = await page.evaluate(() => {
  const box = (id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const px = (id, prop) => parseFloat(getComputedStyle(document.getElementById(id))[prop]);
  const labelOf = (id) => document.getElementById(id).parentElement.querySelector('span');
  return {
    score: box('hudScore'),
    time: box('hudTime'),
    best: box('hudBest'),
    scorePx: px('hudScore', 'fontSize'),
    timePx: px('hudTime', 'fontSize'),
    scoreLabelPx: parseFloat(getComputedStyle(labelOf('hudScore')).fontSize),
    comboHidden: document.getElementById('hudComboItem').classList.contains('hidden'),
    comboLabelled: !!document.querySelector('#hudComboItem span'),
    timeText: document.getElementById('hudTime').textContent,
    scoreText: document.getElementById('hudScore').textContent,
  };
});

log(`      HUD: score glyph top ${hud.score.y.toFixed(0)}px (${pctH(hud.score.y)}), ${hud.scorePx}px type; clock reads "${hud.timeText}"`);
check('the HUD sits inside the title-safe area',
  hud.score.y >= TITLE_SAFE_PX && hud.time.y >= TITLE_SAFE_PX,
  `score at ${hud.score.y.toFixed(0)}px, clock at ${hud.time.y.toFixed(0)}px, safe edge ${TITLE_SAFE_PX}px`);
check('HUD numbers are readable from a sofa', hud.scorePx >= 32 && hud.timePx >= 32,
  `score ${hud.scorePx}px, clock ${hud.timePx}px`);
check('HUD labels clear the 10-foot text floor', hud.scoreLabelPx >= 15,
  `${hud.scoreLabelPx}px (floor for body copy is ${TV_TEXT_FLOOR_PX}px; these are all-caps labels beside a large number)`);
check('the clock shows the full round before the first frame', hud.timeText === '60', hud.timeText);
check('a combo of x1 is not shown at all', hud.comboHidden);
check('the combo is labelled, not a bare number', hud.comboLabelled);
check('the best score is quieter than the live score',
  parseFloat(hud.scorePx) > parseFloat(
    await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('hudBest')).fontSize)),
  ));

const live = await page.evaluate(async () => {
  const { game } = window.__lightgun;
  game.combo = 4;
  game.score = 12300;
  game.endsAt = game._now + 7000;
  await new Promise((r) => setTimeout(r, 400));
  const combo = document.getElementById('hudComboItem');
  return {
    comboShown: !combo.classList.contains('hidden'),
    comboText: document.getElementById('hudCombo').textContent,
    urgent: document.getElementById('hudTimeItem').classList.contains('urgent'),
    score: document.getElementById('hudScore').textContent,
  };
});
log(`      HUD live: combo ${live.comboText} shown=${live.comboShown}, clock urgent=${live.urgent}, score ${live.score}`);
check('a combo above x1 appears', live.comboShown && live.comboText === 'x4', live.comboText);
check('the clock changes state in the last ten seconds', live.urgent);
check('the score tracks the game', live.score === '12,300', live.score);

const settled = await page.evaluate(async () => {
  const { game } = window.__lightgun;
  game.combo = 1;
  await new Promise((r) => setTimeout(r, 300));
  return document.getElementById('hudComboItem').classList.contains('hidden');
});
check('a broken combo disappears again', settled);

/* --------------------------------------------------------------- results */

await page.evaluate(async () => {
  const { game } = window.__lightgun;
  Object.assign(game, {
    hits: 41, shots: 58, mistakes: 2, bestCombo: 5, score: 24800, best: 19000,
  });
  game.finish();
  await new Promise((r) => setTimeout(r, 300));
});

const res = await page.evaluate(() => {
  const box = (id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  return {
    visible: !document.getElementById('results').classList.contains('hidden'),
    hudHidden: document.getElementById('hud').classList.contains('hidden'),
    title: document.getElementById('resultsTitle').textContent,
    bestFlag: !document.getElementById('bestFlag').classList.contains('hidden'),
    bestFlagText: document.getElementById('bestFlag').textContent,
    finalScore: document.getElementById('finalScore').textContent,
    stats: [...document.querySelectorAll('#breakdown .stat')].map((e) => e.textContent),
    statPx: document.querySelector('#breakdown .stat b')
      ? parseFloat(getComputedStyle(document.querySelector('#breakdown .stat b')).fontSize) : 0,
    again: box('againBtn'),
    recal: box('recalBtn'),
  };
});

check('the results screen replaces the HUD', res.visible && res.hudHidden);
check('beating the best score is called out exactly once',
  res.bestFlag && /new best/i.test(res.bestFlagText) && !/new (high|best)/i.test(res.title),
  `title ${JSON.stringify(res.title)}, flag ${JSON.stringify(res.bestFlagText)}`);
check('the score it beat is stated exactly once',
  /19,000/.test(res.bestFlagText) && !res.stats.some((t) => /19,000/.test(t)),
  `${res.bestFlagText} | ${res.stats.join(' | ')}`);
check('big numbers are grouped for a 10-foot read', res.finalScore === '24,800', res.finalScore);
log(`      results stats: ${res.stats.join(' | ')}`);
check('the breakdown reports accuracy', res.stats.some((s) => /Accuracy\s*71%/.test(s)),
  res.stats.join(' | '));
check('civilians are only listed when some were hit', res.stats.some((s) => /Civilians/.test(s)));
check('breakdown numbers clear the 10-foot floor', res.statPx >= TV_TEXT_FLOOR_PX, `${res.statPx}px`);

for (const [name, b] of [['play again', res.again], ['recalibrate', res.recal]]) {
  log(`      "${name}" target: ${b.w.toFixed(0)}x${b.h.toFixed(0)}px — ${pctW(b.w)}, ${pctH(b.h)}; p95 aim error is ${AIM_P95_PX.toFixed(0)}px`);
  // 1.5x is the margin where a p95-error shot still lands inside the target
  // when aimed at its centre, in the tighter axis.
  check(`the "${name}" target is larger than the gun's aim error`,
    b.w >= AIM_P95_PX * 1.5 && b.h >= AIM_P95_PX * 1.5,
    `${(b.w / AIM_P95_PX).toFixed(2)}x error wide, ${(b.h / AIM_P95_PX).toFixed(2)}x error tall`);
  check(`the "${name}" target is inside the title-safe area`,
    b.y >= TITLE_SAFE_PX && b.y + b.h <= H - TITLE_SAFE_PX && b.x >= 0.05 * W && b.x + b.w <= 0.95 * W,
    `x ${b.x.toFixed(0)}..${(b.x + b.w).toFixed(0)}, y ${b.y.toFixed(0)}..${(b.y + b.h).toFixed(0)}`);
}
check('the two targets do not overlap',
  res.again.x + res.again.w <= res.recal.x || res.recal.x + res.recal.w <= res.again.x);

// The gap between them must also exceed the aim error, or a shot meant for one
// lands on the other.
const gap = Math.abs(res.recal.x - (res.again.x + res.again.w));
check('the targets are far enough apart to tell them apart', gap >= AIM_P95_PX,
  `${gap.toFixed(0)}px gap vs ${AIM_P95_PX.toFixed(0)}px error`);

/* ----------------------------------------------- aiming feedback on targets */

const hot = await page.evaluate(async () => {
  const { state } = window.__lightgun;
  const centreOf = (id) => {
    const b = document.getElementById(id).getBoundingClientRect();
    return { x: (b.x + b.width / 2) / innerWidth, y: (b.y + b.height / 2) / innerHeight };
  };
  const put = (p) => state.players.set('uitest', {
    id: 'uitest', slot: 0, colour: '#35d0ff', calibrated: true, tracking: 'tracking',
    lastAimAt: performance.now(), aim: { ...p, off: false },
    latency: { net: [], pose: [], render: [] }, jitter: [], packets: 0, aimHz: 0, poseHz: 0, status: {},
  });
  const read = () => ({
    again: document.getElementById('againBtn').classList.contains('hot'),
    recal: document.getElementById('recalBtn').classList.contains('hot'),
  });

  put(centreOf('againBtn'));
  await new Promise((r) => setTimeout(r, 150));
  const onAgain = read();

  put(centreOf('recalBtn'));
  await new Promise((r) => setTimeout(r, 150));
  const onRecal = read();

  put({ x: 0.5, y: 0.08 });
  await new Promise((r) => setTimeout(r, 150));
  const onNothing = read();

  state.players.delete('uitest');
  return { onAgain, onRecal, onNothing };
});

check('aiming at a target lights it', hot.onAgain.again && !hot.onAgain.recal, JSON.stringify(hot.onAgain));
check('only the target under the crosshair lights', hot.onRecal.recal && !hot.onRecal.again, JSON.stringify(hot.onRecal));
check('aiming at nothing lights nothing', !hot.onNothing.again && !hot.onNothing.recal, JSON.stringify(hot.onNothing));

// The results panel is opaque. A crosshair drawn on the world canvas beneath it
// is invisible, which makes "shoot here" an instruction with no pointer.
const visible = await page.evaluate(async () => {
  const { state } = window.__lightgun;
  const b = document.getElementById('againBtn').getBoundingClientRect();
  const cx = (b.x + b.width / 2) / innerWidth;
  const cy = (b.y + b.height / 2) / innerHeight;
  state.players.set('uitest', {
    id: 'uitest', slot: 0, colour: '#35d0ff', calibrated: true, tracking: 'tracking',
    lastAimAt: performance.now(), aim: { x: cx, y: cy, off: false },
    latency: { net: [], pose: [], render: [] }, jitter: [], packets: 0, aimHz: 0, poseHz: 0, status: {},
  });
  await new Promise((r) => setTimeout(r, 200));

  const layer = document.getElementById('pointer');
  const results = document.getElementById('results');
  const px = layer.getContext('2d').getImageData(
    Math.round(cx * layer.width) - 30, Math.round(cy * layer.height) - 30, 60, 60,
  ).data;
  let lit = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 24) lit++;

  // Whatever the browser paints last at the crosshair must be the pointer layer.
  const topAt = document.elementFromPoint(cx * innerWidth, cy * innerHeight);
  state.players.delete('uitest');
  return {
    lit,
    aboveResults: Number(getComputedStyle(layer).zIndex) > (Number(getComputedStyle(results).zIndex) || 0),
    topElement: topAt ? topAt.id || topAt.className : null,
    // The click must still land inside the button, not on the pointer canvas.
    clickReachesButton: !!(topAt && topAt.closest('#againBtn')),
  };
});
check('the crosshair is drawn on top of the results panel, not under it',
  visible.lit > 0 && visible.aboveResults,
  `${visible.lit} lit pixels, pointer layer above results: ${visible.aboveResults}`);
check('the pointer layer never swallows a click', visible.clickReachesButton,
  `topmost element at the crosshair is ${visible.topElement}`);

/* ------------------------------------------------------- contrast on a TV */
// 4.5:1 is the web floor for a monitor at arm's length. A TV across a room
// needs more, so every muted colour here is held to 7:1.

// Measured against --bg, so nothing may be lit: a hot target paints its own
// background and these colours are then read against that instead.
await page.waitForFunction(() => !document.querySelector('.target.hot'), null, { timeout: 2000 });

const contrast = await page.evaluate(() => {
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((n) => lin(Number(n) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const bg = 'rgb(7, 9, 14)';
  const of = (sel) => ratio(getComputedStyle(document.querySelector(sel)).color, bg);
  return {
    hudLabel: of('.hud-item.primary span'),
    targetSub: of('.target-sub'),
    hint: of('.results-hint'),
    stat: of('#breakdown .stat span'),
  };
});
for (const [name, r] of Object.entries(contrast)) {
  check(`${name} contrast is high enough for a television`, r >= 7, `${r.toFixed(1)}:1`);
}

check('no uncaught errors in the display client', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

if (failures) {
  console.error(`\n${failures} UI CHECK(S) FAILED`);
  process.exit(1);
}
console.log('\nALL UI CHECKS PASSED');
