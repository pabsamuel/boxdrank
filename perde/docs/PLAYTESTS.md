# Playtests

One entry per session on real devices. The metrics script counts `## YYYY-MM-DD` headings.
Template:

```
## YYYY-MM-DD — where, who (ages), devices
- Network: (same Wi‑Fi / hotspot), TV browser: …
- Tilt → movement latency (eyeballed or phone video, ms): …
- Speech: lines attempted / passed in `kids` mode: … / …  (tr-TR on Android Chrome / iOS Safari)
- What made them laugh: …
- What confused them: …
- Bugs: …
- Changes made because of this: (commits / roadmap boxes)
```

## 2026-09-29 — owner, one phone + laptop, first live build

- Network: phone on its own connection to the deployed relay (workers.dev); TV = laptop browser.
- Devices: not recorded. Latency: not measured, reported as "not at the same time".
- Motion: the puppet moved, but "nothing like a real Karagöz puppeteer": moving the phone left and
  right the way a puppeteer moves the rod did not move the puppet in sync or with the same feel.
- Also: buttons on the phone are unusable while the hand is waving the phone.
- Diagnosis: sideways hand travel was never measured (only the compass heading), the upright
  phone sits in the Euler gimbal lock, three layers of smoothing added ~300 ms, and the figure
  pivoted at the feet instead of hanging from the rod.
- Changes made because of this: new motion model (translation tracking with zero-velocity
  resets, rotation-matrix lean/pitch/heading), rod-point pivot with trailing feet, 45 ms follow,
  buttonless controller with drag and double-tap, live tuning panel. Roadmap M2 boxes ticked.
- Next: record phone models, tilt→move latency (phone video at 60 fps counting frames) and
  speech pass counts on the next session; copy tuned values from the panel into `DEFAULT_TUNING`.
