# RISKS

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | **Copyright / platform ToS** — hosting or downloading other people's videos. | Existential: takedowns, store rejection. | D5: user-supplied videos only, stored locally, never redistributed by us. No downloader code, ever (`CLAUDE.md` rule 5). Share routines as pose timelines, not video. |
| R2 | **Privacy perception** — a camera app pointed at people's bodies, often minors, often in bedrooms. | Trust collapse, app-store scrutiny, legal exposure. | On-device inference only; no frames leave the device; no landmarks in analytics; explicit pre-permission screen; recorded takes local until the user exports. Written as hard rules in `CLAUDE.md` rule 4. |
| R3 | **Pose model accuracy on fast motion** — landmarks jitter or drop out exactly during the interesting part of a dance. | The core feature feels broken. | Confidence gating (skip scoring below threshold), temporal smoothing, key-pose scoring in Learn mode rather than every-frame scoring, and honest "can't see you" UI instead of fake red. |
| R4 | **Frame rate on mid-range phones** — inference + video + canvas + recording at once. | Laggy feedback, hot phone, quitting. | `docs/architecture/PERFORMANCE_BUDGET.md`: measured from Phase 1, lite model, inference decoupled from render, reduced mode fallback. |
| R5 | **Scoring feels unfair** — user thinks they nailed it, app shows red. | Users blame the app and leave. | Angle-based scoring (D4), per-limb feedback (D7), generous thresholds by default, a calibration/T-pose step, and a "why is this red?" debug view during development. |
| R6 | **Sync drift** between ghost, audio and feedback. | Feedback looks wrong even when scoring is right. | D6: single playback clock; latency compensation constant measured, not guessed. |
| R7 | **Mirroring confusion** — user copies the wrong side. | Silent, frustrating failure. | D8: one convention, one helper, a visible toggle, and a test fixture that would fail if the convention flips. |
| R8 | **Scope creep into a social network** (feeds, profiles, comments). | Never ships. | v1 is a single-player practice tool. Anything social goes to the roadmap's "later" section, behind a flag. |
| R9 | **Safety** — people flinging themselves around near furniture, or overtraining. | Injury, liability. | Space-check card in onboarding ("2m clear space"), warm-up prompt, no aggressive streak/pressure mechanics in v1. |
| R10 | **Minors' data.** | Regulatory (COPPA/GDPR-K). | No accounts, no personal data collection in v1; if accounts arrive later, age-gate first and get the owner a privacy review (`OWNER_ACTIONS.md`). |
