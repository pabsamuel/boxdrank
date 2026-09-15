# Ghost overlay — rendering and sync

## Layer stack (bottom → top)

1. **Camera feed** — full-bleed, object-fit cover, mirrored if mirror mode is on.
2. **Ghost video** — the reference video, same aspect fit, `opacity` 0.10–0.60 (default 0.35), optionally desaturated and lightly blurred so it reads as a ghost instead of competing with the real image. Blend mode `screen` on dark rooms, `normal` otherwise (user-toggleable — it's a taste thing).
3. **Ghost skeleton** — reference landmarks drawn as a thick, soft white/cyan stick figure. This is what the user actually aims at; the video underneath is context.
4. **User skeleton** — the user's landmarks, drawn per-segment in red/amber/green/grey (`POSE_MATCHING.md` §4).
5. **HUD** — progress bar, accuracy %, current cue text, countdown, record button.

Layer 3 must be legible on its own: on low-end devices (reduced mode) the ghost video is dropped and only the skeleton remains, and the app still works.

## Fitting the ghost to the user's camera

The reference video and the camera rarely share aspect ratio or framing. Don't stretch. Instead, align in **subject space**:

1. Take the reference frame's `hipCenter` and `torsoLength`, and the user's current `hipCenter` and `torsoLength` (smoothed over ~1s so it doesn't jitter with every frame).
2. Compute the similarity transform (translate + uniform scale) that maps the reference torso onto the user's torso.
3. Apply it to the ghost skeleton *and* to the ghost video layer.

Effect: the ghost stands where the user stands, at the user's size. The user matches *shape*, never "walk two steps left to line up with a video". If the user's pose is unknown (not detected), the ghost falls back to a centred default placement.

## Sync (D6)

One clock. Source of truth is the `<video>` element's `currentTime` when it's playing, exposed through a `PlaybackClock` with `now()`, `seek(t)`, `setRate(r)`, `pause()`.

- Reference frame index = `round(clock.now() * 30)` (timeline is resampled to 30fps at ingest).
- Audio is the reference video's own track — same element, so it can't drift from the ghost.
- Scoring uses each camera frame's own capture timestamp plus the measured latency constant (`POSE_MATCHING.md` §6), never `clock.now()` at the moment inference finishes.
- Speed control sets `playbackRate` (0.25/0.5/0.75/1×). `preservesPitch = false` is fine for practice; note that some browsers throttle audio below 0.5×.

## Render loop

```
requestAnimationFrame:
  draw camera (video element or texture)
  draw ghost video at clock time
  draw ghost skeleton (transformed)
  draw latest scored user skeleton   <- last result, whatever its age
  draw HUD
```

Inference runs on its own cadence (target 20–30Hz) and publishes its latest result; the render loop **never waits for it** (`CLAUDE.md` rule 6). A ghost that stutters is worse than feedback that's one frame stale.

## Photo mode differences

- Ghost is a single frame, not a video: outline silhouette + skeleton, higher opacity (0.5).
- The auto-shutter ring fills while `overall ≥ threshold` (default 0.8) and empties when it drops; fires after 600ms sustained, then captures a 3-frame burst.
- Countdown beeps and a flash on capture, so the user knows it fired without looking at the screen.

## Accessibility and comfort

- Colour-blind safe palette option (red/amber/green → red/amber/blue with shape cues: dashed = wrong, solid = matched).
- Reduce-motion setting: no pulsing, no particle effects.
- All cue text also available as voice (Learn mode), because the user is looking at their body, not the screen.
