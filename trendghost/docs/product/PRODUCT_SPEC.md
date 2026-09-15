# Product spec — TrendGhost v1

## One-liner

A camera app that overlays a ghost of the original video on your live feed and turns your body green when you match it.

## Who it's for

Someone who saw a dance/pose trend, wants to post their own version, and is currently failing by watching the video on one phone and flailing in front of another. Beginner, practising alone, phone propped against something.

## The core loop

1. **Add a routine** — pick a video from the camera roll. The app processes it into a pose timeline (progress bar, a few seconds for a short clip).
2. **Set up** — the framing coach tells you to step back / raise the phone / turn on a light until you're fully in frame. Green tick, then a 3-2-1 countdown.
3. **Learn** — the ghost moves slowly, one move at a time, with a short text instruction ("left arm straight up", "step right, hips low"). It waits until you hit the pose before moving on.
4. **Practice** — full speed, ghost at ~35% opacity, your limbs are coloured live. Accuracy % in the corner.
5. **Record** — ghost fades to ~10%, it records your take with the music. Afterwards: your accuracy timeline, with the 2–3 moments you drifted marked, each replayable side-by-side with the ghost.
6. **Repeat or export.**

## Screens

| Screen | Contents |
| --- | --- |
| Library | Your routines as cards (thumbnail, length, best accuracy). "+ Add routine" button. Empty state explains the flow in three lines. |
| Ingest | File picker → processing progress → a scrub-through preview of the detected skeleton so the user can confirm "yes, it tracked the dancer". Reject with a clear reason if the video is unusable. |
| Framing coach | Live camera, body silhouette guide, one instruction at a time, distance/height/lighting checks, mirror toggle, camera flip. |
| Practice/Record | Camera + ghost + coloured skeleton + progress bar + accuracy + speed control (0.25/0.5/0.75/1×) + mode switch + big record button. |
| Learn | Same, plus the move list down the side with the current step highlighted, and a "waiting for you…" state. |
| Take review | Your recording, accuracy-over-time graph, tap a dip to see that moment vs the ghost. Save / export / delete. |
| Photo mode | Camera + target pose outline + per-joint colour + auto-shutter ring that fills while you hold the pose. Burst of 3 frames on fire. |
| Settings | Mirror mode, sensitivity (chill / normal / strict), voice cues on/off, reduced mode, clear all data. |

## Feedback design (the part that matters)

- **Colour per limb segment**, not per whole body: forearms, upper arms, thighs, shins, torso, head direction. Red `< 0.4`, amber `0.4–0.75`, green `> 0.75` on the per-limb score (thresholds configurable, one file — see `docs/architecture/POSE_MATCHING.md`).
- **At most one text cue at a time**, chosen as the worst-scoring limb, phrased as a fix and not a complaint: "left arm higher", not "left arm wrong".
- **Never all-red.** If tracking confidence collapses (you left the frame, it's too dark), the skeleton goes grey and the app says "I can't see you" — a known state, not a score of zero.
- **Optional voice cues** in Learn mode, short and on the beat ("arm up… now step").
- **Accuracy %** = time-weighted mean of the overall frame score across scored frames. Shown live and after a take. One number, always computed the same way.

## Non-goals for v1

- No feed, profiles, following, comments, or leaderboards.
- No multi-person / duet scoring.
- No built-in trending-video browser (see `RISKS.md` R1).
- No editing/filters/effects on recorded takes beyond trimming.
- No accounts, no cloud sync.

## Success criteria

- A beginner can go from opening the app to a recorded take of a new dance in **under 10 minutes** without help.
- Feedback is perceived as fair: in informal testing, users disagree with the colour on fewer than 1 in 10 key poses.
- Sustained ≥24fps feedback on the target devices in `ASSUMPTIONS.md` A8.
- Zero camera frames leave the device (verifiable: no network calls on the practice path).
