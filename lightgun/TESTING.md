# TESTING

Two kinds of test: the automated ones that run here, and the hardware test that decides whether the
product is real. Do the hardware one next.

---

## Automated

```bash
npm test          # aiming maths vs synthetic ground truth
npm start         # in one terminal
npm run test:e2e  # in another — needs Playwright (`npm i -D playwright` if missing)
```

`npm test` builds a virtual room with a TV of known size and a virtual player who aims with realistic
hand error, then measures where shots land versus where they truly land. It covers distances from
1.5–4 m, screens from 32" to 100", off-axis and tilted screens, misstated screen sizes, 3- vs 4-point
calibration, smoothing lag and jitter, and degenerate rays.

`npm run test:e2e` runs the actual display client in headless Chromium and drives it with a simulated
6DoF phone speaking the real protocol over a real WebSocket: full calibration, 60 Hz aim streaming,
shots at all nine test markers, a game round, and a "player walks 0.9 m" stage. It writes screenshots
to `docs/`.

Current results are in [PROGRESS.md](PROGRESS.md#measurements).

---

## The hardware test (do this next)

**You need:** an Android phone with Google Play Services for AR installed, Chrome, a laptop plugged
into a TV, both on the same Wi-Fi. Set the TV to **Game Mode** first — panel latency is likely the
largest term in the whole budget.

### Session 1 — does it point? (20 minutes)

1. `npm start`, open the display, press **F** for fullscreen, set the screen-size dropdown to your
   actual measured diagonal.
2. Scan, accept the certificate warning, **START GUN**, allow camera.
3. Calibrate. **Time it with a stopwatch from QR scan to GO.**
4. You land in test mode. Stand 2.5 m back and shoot each of the nine markers in turn.

**Then press `X`.** That writes a session report — downloaded as a text file *and* copied to your
clipboard — with everything below already in it. Paste it straight into prompt #1 of
[docs/NEXT-PROMPTS.md](docs/NEXT-PROMPTS.md); you do not need to transcribe anything by hand.

The report captures:

| What | Why it matters |
|---|---|
| Calibration residual, attempts, solved range | a bad calibration explains most "it doesn't work" reports |
| Per-marker error **and the bias vector** | scattered error is noise; a consistent bias is a bug we can fix |
| Jitter at rest, pose rate, tracking-loss count | separates ARCore problems from geometry problems |
| Transport / pose→display / →pixels latency | separates network from rendering from panel |
| A timeline of tracking drops, rejected calibrations and re-zeroes | tells us *when* it went wrong |

**Pass:** every marker registers a hit, worst-case error is small enough that a 5%-of-width target is
comfortable, tracking stays `tracking` (not `limited`), pose rate stays near 60 Hz.

### Session 2 — does it stay pointing? (15 minutes)

5. Shoot all nine markers again. Then play for five minutes — walk about, crouch, turn away from the
   TV and back, put the phone down and pick it up. Shoot all nine again.
6. Read the `drift` line: it compares your first and latest shot at each marker. **Any systematic
   growth is the result that matters.** Gyro-only systems fail here; this one should not.
   If it has drifted, press **Z** and point at the centre once — the report records how much
   correction that needed, which is the drift measurement in a single number. Press **X** again.
7. Press **R** to switch to rotation-only and repeat the walk. The contrast is the whole point of the
   architecture — measure it rather than trusting the simulation's 49%.

### Session 3 — does it feel like a light gun? (15 minutes)

8. Press **G** and play a full 60-second round. Then press **H** to hide the crosshair and play again —
   can you shoot instinctively?
9. Press **S** to toggle smoothing off and on mid-round. If off feels better, our filter is too strong;
   if on feels sluggish, retune `OneEuro` in `shared/math.js`.
10. Judge the trigger: does the shot land where you were looking when you pulled?

### Then vary one thing at a time

| Variable | Try |
|---|---|
| Distance | 1.5 m, 2.5 m, 4 m |
| Screen | monitor → TV → large TV → projector |
| Angle | straight on, 30° off to the side |
| Lighting | normal room, dim room, lights off with only the TV lit |
| Orientation | phone held portrait and landscape |
| Wrong size | deliberately state 43" for a 55" TV, then walk — confirms the simulation's 19% |

**Dim rooms are the one I would bet on failing.** ARCore needs trackable features; a bright rectangle
in a dark room may not be enough. If tracking degrades to `limited`, the first thing to try is
calibrating with more of the room in frame, not a different architecture.

---

## Recording failures

Press **X** and keep the report. Then add two things the report cannot know:

1. What you were physically doing when it broke.
2. Whether recalibrating fixed it, and whether it came back.

That second question separates a calibration problem from a tracking problem, and they have completely
different fixes. Everything else is already in the file.

---

## Known-good reference numbers

If your hardware numbers are far off these, something is wrong beyond normal variation:

- Calibration residual: **< 1% of screen width**. Above 2% means a corner was aimed at sloppily —
  recalibrate before concluding anything else.
- Solved range: within ~10% of your tape measure. Much further out means the stated screen size is
  wrong.
- Pose rate: **55–60 Hz**. Lower means ARCore is struggling, usually a lighting or feature problem.
- Transport latency on Wi-Fi: **single-digit milliseconds**. Tens of ms means a congested network or a
  phone that has fallen back to a 2.4 GHz band.
