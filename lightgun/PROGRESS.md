# PROGRESS

Last updated: 2026-09-15 · Branch: `claude/light-gun-arcade-prototype-ta4fqo`

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

**Tests**
- `npm test` — 24 synthetic-truth checks across distances, screen sizes, off-axis and tilted screens,
  wrong stated sizes, 3-vs-4 point, smoothing lag and jitter, degenerate rays. All passing.
- `npm run test:e2e` — headless Chromium runs the real display client while a Node process plays a
  virtual 6DoF phone through the real protocol. All passing.

---

## CURRENT

Nothing in flight. The prototype is at a natural checkpoint: **everything testable without hardware is
tested and green.**

---

## NEXT

1. **Fire it at a real TV with a real Android phone.** This is the only thing that matters now.
   Protocol in [TESTING.md](TESTING.md). Everything below is downstream of that result.
2. Tune `OneEuro` on real ARCore noise — the simulated jitter is a guess at hand tremor, not a
   measurement of ARCore's actual pose noise.
3. Decide whether 3-point calibration is good enough on real hardware (saves ~3 s).
4. Second phone, live, once single-player passes.
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
