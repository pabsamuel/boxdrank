# Copy-paste prompts for the next sessions

You do not need to explain the project again. Each prompt below is self-contained — paste one, paste
your notes underneath where it asks, send. They are in the order you should use them.

---

## 1. After you test with a real phone (use this one first)

> Read `lightgun/PROGRESS.md` and `lightgun/TESTING.md`. I ran the hardware test. Here is what
> happened:
>
> ```
> [paste: calibration time, the diagnostics lines you could read, per-marker errors,
>  what felt wrong, anything that broke, what the room/TV/distance were]
> ```
>
> Diagnose what these numbers mean before changing anything. Then fix the highest-impact problem,
> update PROGRESS.md with the real measurements, and tell me what to test next. Do not add features.

---

## 2. If aiming is inaccurate but stable

> Aiming on real hardware is consistently off by roughly [X]% of screen width, [uniformly / worse at
> the edges / worse on one side]. Read `lightgun/shared/math.js` and `lightgun/ARCHITECTURE.md`.
> Work out whether this is a calibration-geometry problem, a solver problem, or a phone-axis problem,
> prove which with a test in `lightgun/tests/run.js`, then fix it. Report the before and after numbers.

---

## 3. If the crosshair drifts or tracking keeps degrading

> On real hardware the crosshair [drifts over time / tracking drops to `limited`] after about [N]
> minutes, in [describe the room and lighting]. Read `lightgun/phone/js/pose.js`. Investigate what
> ARCore is doing, add whatever diagnostics would tell us more, and propose the smallest fix —
> including recovery behaviour when tracking is lost mid-round. Prefer fixing tracking over adding a
> recentre button.

---

## 4. If it feels laggy

> The gun feels laggy on real hardware even though the diagnostics report [paste the latency line].
> Find where the time actually goes: measure each stage separately rather than guessing, including the
> smoothing filter's contribution. Then reduce the largest term. Do not add smoothing.

---

## 5. Once single-player passes

> Single-player aiming passes the criteria in `lightgun/PROGRESS.md` on real hardware. Add a second
> phone: two independently calibrated guns, two crosshairs, per-player scoring, and a simple co-op and
> duel mode in the existing game. The protocol is already player-indexed — check what actually breaks
> with two connections before writing new code. Update PROGRESS.md and TESTING.md.

---

## 6. When you want it to stop being a local hack

> The self-signed certificate warning is the worst part of the setup. Work out the smallest change
> that removes it — a hosted display build, a tunnel, or something else — keeping the phone's aiming
> loop on the LAN so latency does not regress. Show me the options with their latency and setup costs
> before implementing.

---

## 7. Only after the gun is genuinely good

> The light-gun mechanic passes on real hardware. Propose — do not build — how to turn this into the
> second game, reusing the aiming layer untouched. One page, concrete.

---

## Rules worth repeating in any prompt

- *"Measure it before you change it."*
- *"Fix the cause, not the symptom."*
- *"Do not add features while a core problem is open."*
- *"Update PROGRESS.md with real numbers."*

These four are why the bugs in PROGRESS.md were found instead of shipped.
