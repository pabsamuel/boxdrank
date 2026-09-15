# Performance budget

Measured, not assumed. Every change to the camera → inference → render path reports these numbers (`CLAUDE.md` rule 6).

## Targets (mid-range phone, `ASSUMPTIONS.md` A8)

| Metric | Target | Hard floor |
| --- | --- | --- |
| Render fps (ghost + skeletons) | 60 | 30 |
| Inference rate | 25–30 Hz | 15 Hz |
| Capture → colour-on-screen latency | ≤ 120 ms | 200 ms |
| Ingest time for a 15s clip | ≤ 20 s | 60 s |
| Cold start to camera preview | ≤ 3 s | 6 s |
| Sustained 3-minute session | no thermal throttle warning | — |

## How to measure

An always-available dev HUD (`?debug=1`): render fps, inference Hz, per-stage ms (capture, inference, score, draw), dropped frames, and the measured latency constant. Numbers from a real phone, not the desktop browser — the desktop will happily lie to you at 120fps.

## Rules that keep it fast

1. Inference never blocks the render loop; the renderer always draws the most recent available result.
2. Run inference in a worker where the platform allows it; pass frames by transfer, not copy.
3. One model instance, loaded once, reused. Never re-create the landmarker per frame.
4. Downscale the inference input (e.g. 256px on the short side) — the model doesn't need your 1080p frame.
5. Draw the ghost video at its natural size; don't re-encode or filter per frame in JS.
6. No per-frame allocations in `pose-core` — reuse typed arrays. It runs 30× a second.
7. Recording is the heaviest mode: when `MediaRecorder` is active, drop inference to ~15Hz and keep render at 60.

## Reduced mode

Triggered manually or when inference Hz stays under 12 for 5 seconds: drop the ghost *video* layer (keep the skeleton), inference at 12Hz, smoothing raised to compensate. The app tells the user it switched, and why.
