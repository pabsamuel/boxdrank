# PROGRESS

Last updated: 2026-09-16 · Branch: `claude/light-gun-arcade-prototype-ta4fqo`

---

## DONE

**Aiming pipeline (the technical risk)**
- WebXR `immersive-ar` pose source with ARCore 6DoF, DOM-overlay gun UI, `emulatedPosition` degradation
  surfaced as `LIMITED` tracking.
- Rotation-only fallback (`deviceorientation` → gnomonic projection → homography) for phones without
  ARCore, doubling as the A/B control condition.
- 4-point and 3-point calibration solvers (Levenberg–Marquardt over per-ray ranges), corner
  re-squaring, and a calibration-error metric reported in both millimetres and % of screen width.
- Ray-plane aiming, inset-rectangle mapping, coordinate clamping with an off-screen flag preserved.
- One-Euro smoothing, tuned against measured lag rather than by feel.

**Plumbing**
- Node server: static files, QR endpoint, self-signed HTTPS for WebXR, dumb WebSocket room relay.
- Clock-sync ping/pong per peer; transport, pose→display and →pixels latency measured separately.
- QR pairing, room codes, reconnect with backoff, addressed-message filtering.

**Display**
- Lobby with QR, screen-size picker, calibration-point picker, live player cards.
- Calibration choreography (POINT AT … → PULL THE TRIGGER → READY → 3·2·1 → GO).
- **Light-gun test mode**: neutral field, 9 numbered markers, per-marker error readout, drift tracking,
  full diagnostics overlay (FPS, pose Hz, aim Hz, latencies, jitter RMS, calibration age and error).
- **Scrap Run**: 60-second original shooting gallery — normal / bonus / no-shoot / explosive chaining
  targets, combo multiplier, HUD, results screen with shootable PLAY AGAIN and RECALIBRATE buttons.
- Crosshair on/off, smoothing on/off, rotation-only A/B, all live from the keyboard.
- Two-player crosshairs render and score independently (protocol is player-indexed throughout).

**Phone**
- Full-screen trigger area, `pointerdown` firing (not `click` — that wait is perceptible).
- Haptic patterns per event; volume keys and space also fire.
- Recalibrate, reload, debug overlay, exit AR.

**Survivability in a real living room** (added after the first checkpoint, all aimed at making the
hardware test succeed — and at making it diagnosable when it doesn't)
- **Tracking-loss handling**: the phone reports every tracking-state transition. A lost pose holds the
  last crosshair and dims it to grey rather than letting it snap somewhere false; the display says
  what happened and what to do about it, and counts the losses.
- **Calibration quality gate**: a calibration worse than 2.5% of screen width, or one taken while
  tracking was degraded, is rejected and redone once automatically. Ten seconds beats a player
  concluding the idea doesn't work.
- **Re-zero (Z)**: point at the centre once to correct accumulated drift to first order — two seconds
  instead of a full recalibration. The correction applied is recorded, because "how much did it need
  after ten minutes" *is* the drift measurement.
- **Session report (X)**: writes everything a diagnosis needs — calibration quality, per-marker error,
  **bias vector**, latency breakdown, tracking-loss timeline, re-zero history — to a file *and* the
  clipboard. Testing becomes "press X, paste" instead of transcribing numbers off a TV.
- **Bias vector**: the mean *signed* error across test markers. Scattered error is noise; a consistent
  bias is a bug with a fix. This distinction is the difference between one debugging round and five.

**Turning one living-room session into data** (the bottleneck on this project is that real ARCore
behaviour only exists in a room we cannot see)
- **Pose trace recorder**: the phone keeps a rolling ~150 s buffer of raw poses in a flat typed array
  (allocation-free, it runs inside the 60 Hz loop), annotated with shots and calibration presses, and
  ships it to the display in chunks on request (**V**).
- **`tools/analyze-trace.js`**: offline analysis of a real trace — pose-stream health and stalls,
  **real sensor noise** measured in windows where the hand was still, **real drift in °/min** measured
  by clustering repeat visits to the same spot, an offline re-solve of the calibration, and a **sweep
  of smoothing settings** that reports the lowest-lag filter meeting a noise-derived jitter budget.
- **`tools/synth-trace.js`**: generates traces with known noise and drift — used by the tests to prove
  the analyser recovers the truth, and usable as a CLI to see the tool's output before a real session.

**iPhone / gyro mode** (added because the only phone available is an iPhone, and iOS cannot run WebXR)
- Calibration is mode-aware: gyro mode fits only the rotation homography, and is graded by how well
  that homography reproduces its own calibration points. Previously the 6DoF solver ran on four rays
  sharing one origin, producing a meaningless model and a quality gate that rejected every attempt.
- **Recoil trigger**: flick the phone like a pistol and it fires, with the shot resolved to the aim
  from 160 ms before the flick began — the flick has already swung the muzzle by the time it is
  detectable, so firing on the spike would land every shot high.
- Gyro mode no longer raises a "tracking weak" alarm every frame for a mode that is weak by design.

**Getting it to run at all** (every failed attempt so far died in setup, not in the game)
- **`npm run doctor`**: one command that checks the wrong-branch case, missing dependencies,
  certificate creation, port clashes, which network address the phone should dial, and the Windows
  Firewall rule — then says which one is the problem. `npm start` runs it first and refuses to start
  on a real fault instead of failing confusingly downstream.
- **Hosted mode**: setting `PORT` switches the server to serve one port behind a platform's TLS.
  That removes the self-signed certificate warning, the firewall rule and the LAN address guessing
  in one go, and the display then points the QR at its own origin. `Dockerfile`, `railway.json`,
  `render.yaml` and `/healthz` included; verified by reproducing the container's exact file layout
  and running it, since no Docker daemon is available here to build the image.

**Surviving a public URL** (hosted mode means the relay meets traffic that is not a light gun)
- Relay limits: 256 KB frame cap, a 240 msg/s token bucket per socket, 8 sockets per room, 500 rooms,
  and a socket that never joins a room is dropped after 10 s. None of them touch real play — a 60 Hz
  aim stream passes untouched — they only stop one socket taking the server down for everyone else.
- Room codes went from 4 characters to 6, generated from `crypto.getRandomValues`. On a public URL a
  600k-combination code is guessable enough for a stranger to turn up as a second gun on someone's
  screen; 480 million is not, and the QR carries it so nobody types it anyway.

**A display you can read from the sofa**
- Reviewed how this category solves pairing (AirConsole, Jackbox, Kahoot) and what published TV
  guidance says about legibility, then rebuilt the lobby against it: the room code is now the hero
  at 150px with the join URL at 44px beneath it and the QR beside them as the accelerator, rather
  than a QR dominating a 26px code.
- Every player-facing size cleared the ~22px floor for a 1080p TV; the muted colour went from 6.5:1
  to 8.9:1 contrast, measured rather than eyeballed. Verified at 720p, 1080p, 4K and laptop sizes
  with no overflow.
- Settings moved to a quiet footer and the keyboard legend behind **?** — both are used once, up
  close, by whoever is at the laptop, and were competing with the code for attention.
- **The phone can set the TV size**, since the person holding it is the one standing in front of the
  television. The display stays the source of truth and rejects impossible values.

**A HUD and a results screen sized for the gun that aims at them**
- The same 10-foot rules, applied to the two screens the lobby review had not covered, found two
  defects that were invisible by eye:
  - **The HUD sat at `y=0`.** A television crops its edges by an unpredictable amount — 5%, or 54px on
    1080p, is the usual planning figure — so the score and the clock were first to be cut off. The HUD
    now sits inside that inset, like the lobby already did.
  - **The results buttons were smaller than the aiming error.** They were 5.9% of screen height, while
    the measured p95 aim error after a player moves is 4.9% of screen *width* — 8.7% of height on 16:9.
    Fitts's law applies to the pointer you actually have, and a target narrower than the p95 error of
    the thing pointing at it cannot be hit, however obvious it looks. They are now 15% of height
    (~1.7x that error in the tight axis), separated by a gap that also exceeds it so a shot meant for
    *play again* cannot land on *recalibrate*.
- **Crosshairs moved to their own canvas above the DOM panels.** The results overlay is opaque, so the
  crosshair was being drawn underneath the very buttons that say "shoot here" — a pointer the player
  could not see. The same change fixed shot marks landing at half position on a HiDPI display, where
  the canvas works in device pixels and `window.innerWidth` reports CSS pixels.
- A target lights up while a crosshair is inside it: the only feedback that tells a player a shot
  *will* hit before they pull the trigger.
- HUD hierarchy rather than four equal numbers: the combo does not exist at x1, the clock changes
  colour only in the last ten seconds, the best score is dimmed to 60%, the score animates on change,
  and big numbers are grouped (`24,800`). Results stats are a labelled row, civilians appear only when
  some were hit, and beating the high score is announced once — with the score it beat — instead of in
  both a title and a flag.

**Tests**
- `npm test` — 20 synthetic-truth checks across distances, screen sizes, off-axis and tilted screens,
  wrong stated sizes, 3-vs-4 point, smoothing lag and jitter, degenerate rays. All passing.
- `node tests/trace.js` (part of `npm test`) — 16 checks that the trace analyser recovers noise, drift,
  stalls and calibration that we injected ourselves, at three noise levels. An analyser that reports
  confident nonsense is worse than none, since we will be trusting it with data from a room we cannot
  see. All passing.
- `node tests/gesture.js` (part of `npm test`) — 15 checks on the recoil trigger: that a flick fires
  once, that holding still or sweeping onto a target never fires, that a bouncing wrist does not
  double-fire, and that the aim look-back recovers the pre-flick position. Caught two real bugs: a
  cooldown initialised to 0 that swallowed every shot in the first 320 ms of a session, and a
  wall-clock cooldown that disagreed with the sample-driven re-arm.
- `node tests/relay.js` (part of `npm run test:e2e`) — 7 checks that the relay survives the internet
  without getting in the way: a 180-packet 60 Hz stream passes intact, a flood is disconnected, an
  oversized frame is refused, a room stops at capacity, malformed JSON does not take it down, a socket
  that never joins is dropped, and rooms never see each other's traffic.
- `npm run test:e2e` — 21 checks: headless Chromium runs the real display client while Node processes
  play virtual 6DoF phones through the real protocol, now including tracking loss, re-zero, the
  session report, a **pose-trace round trip through the real recorder and chunked transfer**, and
  **two simultaneous players**. All passing.
- `node tests/ui.js` (part of `npm run test:e2e`) — 34 checks that measure the display at 1920x1080
  rather than looking at it: every readable element inside a 5% title-safe inset, every shootable
  target and the gap between them larger than the gun's own measured p95 aim error, the crosshair
  layer stacked above the results panel, muted colours at 7:1 or better, and the combo, the urgency
  state and the "new best" flag appearing only when they are true. Both HUD defects above were found
  by writing it. All passing.

---

## CURRENT

Nothing in flight. **Everything testable without hardware is tested and green.**

---

## NEXT

1. **Fire it at a real TV with a real Android phone.** This is the only thing that matters now.
   Protocol in [TESTING.md](TESTING.md) — it is now a few key presses, a paste and one attached file.
   Everything below is downstream of that result.
2. Tune `OneEuro` on real ARCore noise. No longer guesswork: `tools/analyze-trace.js` reads a real
   trace and prints the lowest-lag setting that meets a jitter budget derived from that phone's own
   measured noise. The answer is one command away *once a trace exists*.
3. Decide whether 3-point calibration is good enough on real hardware (saves ~3 s).
4. Second phone on real hardware — the protocol and rendering are done and tested headless, so this
   should be a confirmation rather than a build.
5. Only then: hosted build with a real certificate, to delete the self-signed-warning step.

---

## BLOCKERS

**No Android phone in this environment.** Every number below is either synthetic-truth simulation or a
browser-to-browser loopback. They prove the *maths and the plumbing*, not ARCore's real-world tracking
quality, real Wi-Fi latency, or how it feels in the hand. Those three are exactly what the hardware
test is for.

Known unknowns the simulation cannot answer:
- ARCore pose noise and relocalisation behaviour in a dim living room pointed at a bright TV.
- Whether a TV-dominated camera view starves ARCore of trackable features (a bright rectangle in a
  dark room is a genuinely hostile scene). Mitigation if so: calibrate with the room in view, and keep
  some room in frame — worth measuring before designing around.
- Real display-panel latency, which is likely the largest term in the budget and not ours to fix.

---

## MEASUREMENTS

### Aiming accuracy — synthetic truth (`npm test`)

Errors are in **% of screen width**; on a 55" TV, 1% ≈ 12 mm. Simulated hand error is 0.35° per axis
on each calibration point and each shot, with 2 cm of body sway between calibration presses.

| Scenario | mean | p95 |
|---|---|---|
| 55" TV @ 2.6 m, 4-point | 2.07% | 3.88% |
| …then the player steps 0.9 m, **no recalibration** | 2.33% | 4.89% |
| …same step, **rotation-only (gyro-equivalent)** | **49.55%** | 58.39% worst |
| 32" monitor @ 1.5 m | 1.84% | 3.21% |
| 75" TV @ 3.5 m | 2.17% | 4.13% |
| 100" projector @ 4 m | 1.81% | 3.57% |
| Player 35° off-axis | 2.39% | 4.79% |
| TV tilted 12° | 2.22% | 4.53% |
| 3-point calibration | 1.94% | 4.55% |

Effect of misstating the screen size (real TV is 55"):

| Stated | standing still (p95) | after a 0.9 m step (p95) |
|---|---|---|
| 43" | 4.41% | **19.47%** |
| 55" | 4.96% | 5.59% |
| 65" | 4.07% | 9.93% |

Rotation-only is *exact* (< 0.01% error) from a fixed viewpoint. Its 49% figure is entirely the cost
of the player moving — which is why the camera path exists.

### Smoothing (`npm test`)

| Metric | Value |
|---|---|
| Resting jitter removed | 88% |
| Lag during a brisk sweep (1.5 screen widths/s) | **11.8 ms** (< 1 frame @ 60 Hz) |
| Lag during slow tracking (0.25 widths/s) | 31.3 ms |

### End-to-end, headless (`npm run test:e2e`)

Real display client in Chromium, virtual 6DoF phone at 2.6 m from a virtual 55" TV, real WebSocket.

| Metric | Value |
|---|---|
| Calibration wall-clock, 4 points | **2.5 s** (+ however long the player takes to aim; ~10 s realistic) |
| Calibration residual | 0.06% of screen width |
| Solved range vs truth | 2.68 m vs 2.60 m · scale error −0.01% |
| Shot accuracy, all 9 test markers | mean **0.45%**, worst 0.69% of screen width |
| Aim packet rate | 53 Hz sent, 60 fps rendered |
| Transport latency | **0.93 ms** mean, 2.63 ms p95 |
| Pose → display | 4.9 ms |
| Packet → pixels | +7.4 ms |
| Game hit rate against live targets | 42/42 |
| Aim error after a 0.9 m step, no recentring | **0.59%** |
| Bias vector for an unbiased simulated gun | 0.30% — correctly reported as scatter, not systematic |
| Two simultaneous players | independent crosshairs, colours and scores |

### Trace analyser accuracy (`node tests/trace.js`)

Does the instrument measure what it claims? Injected values versus recovered:

| Injected | Recovered | Ratio |
|---|---|---|
| 0.02°/axis sensor noise | 0.028° radial rms (expected 0.028°) | 0.98 |
| 0.05°/axis | 0.070° (expected 0.071°) | 1.00 |
| 0.15°/axis | 0.209° (expected 0.212°) | 0.99 |
| 8 mm/axis positional noise | 12.4 mm | ~1.1 |
| no drift | 0.03°/min | correctly reads as none |
| 0.5°/min yaw drift | 0.473°/min | 0.95 |
| calibration at 2.60 m | re-solved offline at 2.66 m | 1.02 |

Before the `acos` fix these numbers were a 3.3x overestimate at low noise — the instrument was
measuring itself. Worth stating plainly: **an analyser is only useful if its own error is checked
against known truth**, which is what this suite is for.

### Pass/fail criteria

| Criterion | Status |
|---|---|
| 1. Calibration < 15 s | **Pass** (2.5 s of protocol; ~10 s with a human aiming) |
| 2. Hit large targets across the whole TV from 2–3 m | **Pass in simulation** — awaiting hardware |
| 3. No continuous drift | **Pass by construction** (visual-inertial, not gyro-integrated) — awaiting hardware |
| 4. Low perceived latency | **Pass** for everything we control: < 1 frame end to end |
| 5. No repeated recentring | **Pass in simulation** — 0.59% error after moving, unaided |
| 6. Move the gun around naturally | **Pass in simulation** across distance, angle and screen size |
| 7. Immediate trigger | **Pass** — `pointerdown`, shot carries its own coordinates, haptic is local |

Criterion 5 now has a safety net as well as a design: if drift does appear on real hardware, **Z**
re-zeroes in two seconds and records how much it needed. Needing it often would be a *failure* of
criterion 5, and the report is what will tell us.

Nothing has failed yet. Criteria 2, 3 and 5 are only provisionally passed until a phone fires at a TV.

---

## Bugs found and fixed along the way

1. **Gaussian elimination returned NaN** (`row[i][i]` instead of `M[i][i]`). Every Gauss–Newton step
   was rejected, so the calibration solver silently never iterated — and still produced plausible-looking
   2% errors from its initial guess alone. Caught by asserting that noise-free input recovers the screen
   *exactly*, not just closely.
2. **Inset calibration markers treated as true corners** — inflated solved distance by ~11%. Invisible
   standing still, 36% aim error after a step. Caught by the end-to-end test's "player walks around"
   stage.
3. **One-Euro tuned by intuition** had 126 ms of steady-state lag. Caught by measuring lag rather than
   watching it.
4. Static assets 404'd because `/` rewrote instead of redirecting, breaking every relative path.
4b. **A shot arriving between frames crashed the whole frame.** Shots are stamped with
   `performance.now()` when they arrive over the socket, but the draw loop runs on the frame's own
   timestamp — which is when the frame *started*. A shot a millisecond in the future gave a negative
   age, then a negative radius, and `ctx.arc` throws on that, losing every later draw call in the
   frame. Intermittent by nature, and found only because the end-to-end test asserts on uncaught
   errors rather than on what the screen looks like.
5. **The trace analyser had a 0.09° noise floor** — `acos(dot(a,b))` on directions that are rounded to
   five decimals on the wire, where `acos(1 − ε) ≈ √(2ε)` turns a 5e-6 loss of unit length into ~0.09°.
   That sits exactly in the range of real ARCore jitter, so the tool would have made a quiet phone look
   noisy and sent us tuning the filter against an artifact. Fixed with the `atan2` form, which is exact
   down to zero; noise recovery went from a 3.3x overestimate to within 2% of truth.
5b. **The crosshair was drawn under the results panel.** Shots and crosshairs went to the world canvas,
   which sits below the DOM overlays — fine everywhere else, invisible behind an opaque results screen
   that is simultaneously asking to be shot at. In the same place: shot marks were stored in CSS
   pixels and drawn into a canvas scaled to device pixels, so on a 2x display every mark landed at
   half its true position. Both found by measuring the rendered page rather than by playing it.
6. The analyser's still-window detector counted slow ramps as stillness (fixed by rejecting windows
   with a trend through them), its drift metric compared positions when it should have clustered screen
   coordinates, and its smoothing sweep silently reported "zero jitter" on noisy phones where it had
   found no still windows at all — the one case where the measurement mattered most.
