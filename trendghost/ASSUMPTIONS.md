# ASSUMPTIONS

Things we are proceeding on without confirmation. Each should be either confirmed and deleted, or promoted to a decision.

- **A1 — Single person in frame.** v1 scores one person. If two people are detected we pick the largest and say so in the UI. Duets/groups are out of scope.
- **A2 — Phone held/propped at roughly chest-to-waist height, 2–4m away, portrait.** The framing coach enforces roughly this. Extreme angles (floor-up, ceiling-down) are told "move your camera", not silently mis-scored.
- **A3 — Full body visible for dance mode.** Head-to-feet must be in frame. Photo mode allows half-body targets.
- **A4 — Reference videos are short.** 5–60 seconds, ≤1080p, ≤60fps. Longer/bigger is allowed but pre-processing may take a while and we show progress.
- **A5 — Reference contains one clearly visible performer** facing roughly the camera. Fast spins, crowds and heavy occlusion produce low-confidence frames, which we mark and skip rather than score.
- **A6 — Audio comes from the reference video's own track,** played locally for practice. We do not host or distribute audio.
- **A7 — Offline-first.** Everything after ingest works with no network. No account required for v1.
- **A8 — Target devices**: iPhone 12 / Pixel 6 class and newer. Older devices get a "reduced mode" (lower inference rate, skeleton-only ghost) rather than a refusal.
- **A9 — Users are not dancers.** Copy, pacing and default speeds assume a beginner practising alone in a bedroom.
