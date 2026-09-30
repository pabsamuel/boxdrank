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

## 2026-09-30 — owner, second look at the live build

- Verdict on the visuals: "no design at all", nothing like a real Karagöz tasvir (reference:
  ornate translucent painted leather, ink outlines, patterned costumes, an Ottoman street in ink
  and watercolor on parchment).
- Scope: the product must be global (every puppet tradition), let families draw their own
  figure and play it with a basic rig (arms, legs), and carry the ready-made Karagöz plays with as
  much help as possible.
- Changes made because of this: parchment + inked street backdrop, patterned kaftans with
  outlines and curled shoes, raster rigs with painted artwork slots, generated tasvir artwork
  (see `docs/ART.md`), the draw-your-own flow, the TV voicing unclaimed lines, next-line preview,
  coaching card. Roadmap boxes above.

## 2026-09-30 — owner, phone join

- Typed a wrong room code on the phone and could not get back: the phone sat on "waiting for
  the TV" with no button, the menu would not open without stage state, and the code stayed in
  the URL so even a reload skipped the form.
- Changes made because of this: the form asks the relay whether the code exists before moving
  on and says so inline; the pick-up screen and the waiting screen carry "change the code"; the
  menu opens without stage state and always ends with "leave the room"; the room code lives in
  the URL, so the phone's back button also works. e2e covers the wrong code, the stale QR link and
  leaving from the menu.
