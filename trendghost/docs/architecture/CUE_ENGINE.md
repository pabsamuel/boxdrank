# Cue engine — telling the user what to do *next*

Colour tells you how you're doing **now**, which is always slightly too late. The cue engine tells you what's coming **next**, slightly early — "arms up in 2… now", "cut it", "hold". This is the difference between a mirror and a teacher, and it's what makes a fast trend learnable.

## The core idea: lookahead

Every cue fires **before** the move it describes. Humans need roughly 300–500ms between hearing an instruction and starting to move, so:

```
cueFireTime = moveStartTime - leadTime
leadTime    = 450ms  (default; scales with playback rate: leadTime / rate)
```

At 0.5× speed the lead time in *reference* time doubles, so the cue still lands half a second of real time before the move. Getting this wrong in either direction is the most common way a coaching app feels useless: too early and the user moves at the wrong moment, too late and they're always chasing.

A cue is scheduled against the `PlaybackClock` (`GHOST_OVERLAY.md`), not against wall time, so scrubbing and speed changes reschedule everything automatically.

## Cue types

| Type | Fires | Example | Where it shows |
| --- | --- | --- | --- |
| `prepare` | 1.5–2s before a move | "arms up next" | Next-move ribbon, quiet |
| `go` | at `moveStart - leadTime` | "arms up — now" | Big centre text + voice + haptic |
| `hold` | when a key pose must be sustained | "hold it… 2… 1" | Ring timer |
| `hit` | on a sharp accent / beat | **"cut it"**, "snap", "freeze" | Flash + strong haptic |
| `correct` | during a move, worst limb only | "left arm higher" | Small text near that limb |
| `transition` | between sections | "into the chorus" | Ribbon |
| `praise` | after a move scored ≥0.85 | "clean" | Brief, subtle, never constant |

Only **one** cue is on screen at a time. A priority queue drops the lower one when two collide: `hit` > `go` > `hold` > `correct` > `transition` > `prepare` > `praise`.

## Where cues come from

Cues are generated **once**, at ingest, and stored with the routine — not computed live. Live scoring only chooses *correction* cues.

1. **Segment the timeline into moves** (from `ROADMAP` Phase 6): per-frame landmark velocity → smoothed → local minima are key poses → the span between two key poses is a move.
2. **Classify each move** by comparing its start and end key pose:
   - Which limb segments changed most (`POSE_MATCHING.md` §2a gives the vectors).
   - Direction of change: up/down/out/in/across, from the sign of the change in subject space.
   - Whole-body changes: `crouch` decreasing → "drop low"; `stanceWidth` increasing → "step wide"; torso rotating → "turn".
   - Velocity shape: a sharp deceleration into a held pose → this is a **`hit`** ("cut it"), a long low-velocity stretch → a `hold`, a smooth arc → an ordinary `go`.
3. **Phrase it** from a table keyed on `(segment, direction, magnitude)`, in `src/coach/phrases.ts`. One file, so the wording of the entire app is editable in one place, by a non-programmer, without touching logic.

```
upperArmL + up + large        → "left arm up"
upperArmL + up + small        → "left arm a bit higher"
both arms + out               → "arms wide"
crouch + down + fast          → "drop"
sharp stop after fast motion  → "cut it"
stanceWidth + up + large      → "step out"
torso + rotate                → "turn to your left"
```

Rules for phrasing: **three words or fewer**, imperative, a fix not a complaint, and the side is always *the user's* side in whichever mirror mode they're in (`DECISIONS.md` D8). "Left arm up", never "your left arm is in the wrong position".

## Beat alignment — built (`src/coach/beats.ts`)

Trends are choreographed to beats; cues that land on the beat feel professional, and cues that land between beats feel broken. `go` and `hit` cues snap to the nearest detected beat within ±120ms.

How it works, at ingest, once per routine:

1. The video's audio is decoded and mixed to mono (`src/ingest/audio.ts` — a thin Web Audio wrapper; all the DSP is platform-free and unit tested).
2. Onset strength = half-wave-rectified rise in log short-term energy, at ~23ms frames. Percussive hits show up as sharp positive jumps.
3. Tempo = strongest autocorrelation lag in the 70–180 BPM range, **refined sub-frame with a parabolic fit**. This matters more than it sounds: at 23ms frames an integer period is up to half a frame wrong *per beat*, and the error accumulates — by the tenth beat the grid can be 100ms+ out, putting every later cue off. The fit recovers the fractional period.
4. Phase = the offset whose beat positions collect the most onset energy, searched at quarter-frame resolution.
5. Confidence = how far the winning tempo stands above the average lag. **Below 0.35 we return no grid at all**: snapping cues to a wrong grid is worse than not snapping.

The grid is stored on the routine and also used to pace the count-in, so "5, 6, 7, 8" ticks at the song's own tempo.

Never blocks ingest: a silent clip, an unsupported codec, a browser that will not decode video audio, or a low-confidence result all just mean cues keep their raw motion timing.

Covered by unit tests over synthetic click tracks: clean 120 and 90 BPM, a noisy 128 BPM recording, beat positions staying on-grid across a whole clip (the drift test), and noise/silence correctly yielding no grid.

## Output channels

- **Visual** — a next-move ribbon at the top (`prepare`), big centre text for `go`/`hit`, a countdown ring for `hold`. Large, high contrast, readable at 3 metres: the user is across the room, not holding the phone.
- **Voice** — Web Speech API, spoken at cue time. Cut off any previous utterance, never queue (a backlog of stale instructions is worse than silence). Off by default in Record mode, since the take records the mic.
- **Haptic** — `navigator.vibrate` on `go` and `hit`. The most underrated channel: a buzz on the beat is felt even when the user is mid-turn and can't see the screen.
- **Count-in** — before the routine starts and after every pause: "5, 6, 7, 8" if a beat grid exists, else "3, 2, 1".

## Per mode

| Mode | Cue behaviour |
| --- | --- |
| Learn | All types. The ghost waits after each `go` until the user hits the pose. Verbose; `correct` cues repeat with increasing specificity if they keep failing. |
| Practice | `prepare` / `go` / `hit` / `hold` and at most one `correct` per move. No waiting. |
| Record | `hit` and `go` only, voice off, haptics on, visuals minimal — the user is performing, not studying. |
| Photo | A single `hold` with the auto-shutter ring, plus `correct` for the worst limb. |

## What cues must never do

- **Never stack.** One at a time, always.
- **Never nag.** The same `correct` cue fires at most once every 2.5s.
- **Never lie.** If tracking confidence collapses, cues stop and the app says "I can't see you" (`POSE_MATCHING.md` §3) — a wrong instruction is worse than no instruction.
- **Never shame.** No "wrong", "failed", "bad". The worst thing a cue says is "again".

## Tuning knobs (all in `src/config/cues.config.ts`)

`leadTime`, `prepareLead`, `minCueGap`, `correctionCooldown`, `holdDuration`, `beatSnapWindow`, `praiseThreshold`, channel toggles. Same rule as scoring: no cue timing constant anywhere else in the codebase.

## How we'll know it works

A beginner, practising a 15-second trend they've never seen, should be able to get through it at 0.5× **without watching the reference separately first** — because the cues told them what was coming. If they have to watch the video three times first, the cue engine has failed and the timing or the phrasing is wrong.
