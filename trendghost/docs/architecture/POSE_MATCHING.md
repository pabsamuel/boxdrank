# Pose matching — how red becomes green

This is the spec for `pose-core`. Everything the user sees on screen traces back to a number defined here (`CLAUDE.md` rule 7).

## 0. Vocabulary and coordinate spaces

| Space | Definition |
| --- | --- |
| `raw` | Landmarks as the model emits them: x,y normalised 0–1 to the image, z relative depth, plus `visibility`. |
| `mirrored` | `raw` with `x → 1 - x`. What a selfie preview shows. |
| `subject` | Normalised, mirror-resolved, scale-free. **All scoring happens here.** |

The model's `left_*` landmarks are the *subject's* left. One helper, `toSubjectSpace(landmarks, { mirrored })`, is the only place a flip happens (`CLAUDE.md` rule 8).

Landmarks: MediaPipe's 33-point set. We use 25 of them (face reduced to nose + ears; hands to wrists; feet to ankles + foot index).

## 1. Normalisation (kills body size, distance and position)

Given a frame of landmarks:

1. `hipCenter = (leftHip + rightHip) / 2`; `shoulderCenter = (leftShoulder + rightShoulder) / 2`.
2. Translate so `hipCenter` is the origin.
3. `torsoLength = |shoulderCenter - hipCenter|`. Divide all coordinates by it. If `torsoLength` is below a floor (person too small/far), mark the frame `lowConfidence` and don't score it.
4. Rotate in the image plane so the hip→shoulder vector points straight up. This removes camera roll and a leaning phone; it deliberately keeps a real body lean, because the *limbs* are then measured relative to a torso that also leaned — which is what "same pose" means.

Result: a pose where a 150cm person 2m away and a 190cm person 4m away produce near-identical numbers.

## 2. Features (what we actually compare)

### 2a. Limb segment directions — the primary signal

For each segment, take the unit vector from its proximal to its distal joint, in `subject` space:

| Segment | From → To | Weight |
| --- | --- | --- |
| upperArmL / upperArmR | shoulder → elbow | 1.0 |
| forearmL / forearmR | elbow → wrist | 1.0 |
| thighL / thighR | hip → knee | 0.9 |
| shinL / shinR | knee → ankle | 0.8 |
| torso | hipCenter → shoulderCenter | 1.2 |
| head | shoulderCenter → nose | 0.5 |
| footL / footR | ankle → footIndex | 0.3 |

Weights are the default profile; they live in `scoring.config.ts` with the thresholds, nowhere else.

### 2b. Relative-offset features — what angles miss

Angles alone can't tell a wide stance from a narrow one, or arms-crossed from arms-apart. Add, in `subject` space (already torso-normalised):

- `stanceWidth` = horizontal distance between ankles.
- `handSeparation` = distance between wrists.
- `handHeightL/R` = wrist y relative to shoulderCenter.
- `crouch` = hipCenter y relative to ankle midpoint.

Each is scored by distance with its own tolerance, and contributes to the overall score at a combined weight of ~0.25 — enough to catch "right shape, wrong width", not enough to dominate.

### 2c. Deliberately ignored

Absolute position in frame, absolute size, image-plane roll, and (for v1) `z` depth beyond a light contribution — monocular depth is too noisy to punish people with. Facing direction is inferred from shoulder-width foreshortening and handled as a framing hint ("turn to face the camera"), not a score penalty.

## 3. Per-segment score

For segment `s`, with reference direction `r` and user direction `u` (both unit vectors):

```
cos      = clamp(dot(u, r), -1, 1)
angleDeg = acos(cos) * 180 / PI
score_s  = clamp(1 - (angleDeg - tolFree) / (tolZero - tolFree), 0, 1)
```

Defaults: `tolFree = 12°` (anything within 12° is a perfect 1.0), `tolZero = 60°` (60° or worse is 0.0). Sensitivity presets scale both: chill ×1.4, normal ×1.0, strict ×0.7.

Confidence: if either endpoint's `visibility < 0.5`, the segment is `unknown` — rendered grey, excluded from the overall score, never rendered red. Fake red is worse than no feedback (`RISKS.md` R3).

## 4. Colour mapping

| `score_s` | Colour | Meaning |
| --- | --- | --- |
| `≥ 0.75` | green | matched |
| `0.40 – 0.75` | amber | close, adjust |
| `< 0.40` | red | wrong |
| `unknown` | grey | can't see this limb |

Colours are applied to the *segment* drawn on the user's skeleton, so the user sees exactly which forearm is wrong. Thresholds come from `scoring.config.ts`.

## 5. Overall frame score

```
mean       = Σ(w_s · score_s) / Σ(w_s)        over scored segments
worst      = min(score_s)                     over scored segments
angleScore = 0.7 · mean + 0.3 · worst
overall    = 0.75 · angleScore + 0.25 · mean(offsetFeatureScores)
```

**Why the `worst` term** (added in Phase 4, after the fixtures caught it): a plain
weighted mean is far too forgiving. One completely wrong forearm out of twelve
segments still scored **0.89** — the app would cheerfully report "89%" while an arm
pointed the wrong way, which is exactly the "scoring feels unfair" failure in
`RISKS.md` R5, in the generous direction. Blending in the worst visible segment
brings that case to ~0.7, which matches what a person watching would say. The
weight lives in `scoring.config.ts` as `WORST_SEGMENT_CONTRIBUTION`.

Frames with fewer than 60% of the weight available are `unscored` (the app says "I can't see you" rather than inventing a number).

## 6. Time: matching user frames to reference frames

The playback clock (D6) gives `t`. The reference timeline is resampled at ingest to a fixed 30fps grid, so lookup is `index = round(t * 30)`.

Two refinements:

- **Latency compensation.** Camera frames arrive late (capture + inference ≈ 40–90ms). Each user frame carries its own capture timestamp; score it against the reference frame at *its* capture time, not at "now".

  **Measured, not guessed** (`src/pose-core/latency.ts`): every frame records how long after capture its result became usable, and scoring uses a rolling **median** of the last 30 — median rather than mean so one GC pause or thermal hiccup doesn't drag it for seconds. The configured default is used only until five real samples exist, and the current value is on the debug HUD.

  A caught mistake worth recording: `detect()` is synchronous, so the measured gap *already includes* inference time. An earlier version added `inferenceMs` on top, double-counting it and shifting every score about a frame early — feedback that leads the ghost feels as wrong as feedback that lags it.

  Known limitation: we timestamp at the moment we hand the frame to the model, not at true sensor capture. `requestVideoFrameCallback` would give the real capture time and is the obvious improvement if timing still feels off on a phone.
- **Tolerance window.** Humans are early or late by a beat. Score the user frame against reference frames in `t ± 120ms` and take the best match, keeping the offset as a `timing` readout ("you're ~90ms behind"). This separates *wrong pose* from *right pose, wrong time*, which are different coaching problems.

## 7. Smoothing

Raw per-frame scores flicker and the colours strobe, which is unpleasant and unreadable.

- Landmarks: One-Euro filter (or EMA α≈0.5) before scoring.
- Scores: EMA with α≈0.35 per segment.
- Colour changes require the new band to hold for 2 consecutive frames (hysteresis) before the colour flips.

Smoothing is applied to *display*; the raw per-frame score is what gets stored for the take-review graph.

## 8. Calibration (optional, improves everything)

Before the first run, ask for a 2-second T-pose. Use it to: confirm all 25 landmarks are visible, measure the person's limb-length ratios (used to sanity-check normalisation), and measure the end-to-end latency constant from §6 by flashing a screen cue and detecting the motion response.

## 9. Test fixtures (Phase 4 must pass these)

Record short clips once, commit the *landmark JSON* (not video):

1. **Identity** — reference scored against itself → overall ≥ 0.98 every frame.
2. **Mirror** — mirrored copy in mirror mode → ≥ 0.95; in anatomical mode → clearly lower on asymmetric poses.
3. **Scale** — same pose recorded at 2m and 4m → ≥ 0.9 against each other.
4. **Translation** — same pose on the left and right of frame → ≥ 0.95.
5. **One wrong arm** — identical except left forearm 90° off → that segment < 0.4, every other segment > 0.8, overall between 0.6 and 0.85. (This is the regression test for the whole product promise.)
6. **Occlusion** — a limb out of frame → that segment `unknown`, not red.
7. **Timing** — reference delayed 200ms → poses match, `timing` reports ≈200ms.
