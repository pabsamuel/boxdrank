# Architecture

```
 phone (controller)          Cloudflare                      TV (stage)
 ──────────────────          ──────────                      ──────────
 DeviceOrientation ─┐                                    ┌─ stage-machine (pure reducer)
 DeviceMotion ──────┼─ pose ──►  Worker  ──►  Room DO ──►┤   seats · play · karaoke progress
 Web Speech API ────┘  speech    /api/*      (WebSocket   │   speech matching (matcher.ts)
 touch strip ──────── control              hibernation)  └─ StageScene (SVG puppets, 60 fps)
        ▲                                        │
        └──────────── state (broadcast) ─────────┘
```

One Worker serves everything: `/api/*` is code, everything else is the Vite build as static assets
(`run_worker_first` keeps `/api` out of the asset handler). One Durable Object per room relays
messages; it interprets nothing. The TV owns the game.

## Packages

| package          | what                                                                                                         | tests                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `@perde/shared`  | wire protocol (zod), play/puppet/culture schemas, Turkish-aware fuzzy matcher, pure room routing, UI strings | unit                                    |
| `@perde/content` | culture packs (data only) + editorial lint                                                                   | unit + `pnpm validate:content`          |
| `@perde/relay`   | Worker routes, `Room` Durable Object, entitlements                                                           | unit (entitlements), e2e (real workerd) |
| `@perde/web`     | landing, stage, controller; `stage-machine.ts` reducer; motion/speech adapters                               | unit (reducer, motion), e2e             |

## The protocol (`packages/shared/src/protocol.ts`)

- Every socket starts with `hello { role, seat?, name? }`. The relay answers `welcome`.
- Controller → relay: `pose`, `gesture`, `speech { transcript, final, lineIndex }`, `control { action … }`.
  The relay stamps `seat` and forwards to the stage only.
- Stage → relay: `state { StageState }`, fanned out to every controller.
- Relay → anyone: `joined`, `left`, `stage { online }`, `error { code }`, `pong`.
- Seats are player slots `p1..p4`. Which puppet sits in a slot depends on the culture pack and the
  player's choice. A play's characters are cast onto seats when the play starts (`castPlay`).
  Characters nobody holds are drawn by the stage and can be voiced by anyone.

## The stage machine (`apps/web/src/lib/stage-machine.ts`)

A reducer `(model, event) → model`. Events: `joined`, `left`, `plan`, `msg` (anything from a
controller), `local` (keyboard). The model holds the `StageState` that gets broadcast, plus poses,
gestures, casting and the flattened script. Speech matching happens here: a transcript for the
current line is compared with `matchLine`; on pass the line advances and `spokenLines` grows.
`visiblePuppets()` decides what to draw.

## Rendering (`components/StageScene.tsx`, `PuppetSvg.tsx`)

Puppets are trees of parts hanging from a `rod` point: the whole figure leans and swings there,
like a Karagöz on its stick. A part is either an SVG path (vector rigs, with an ink outline from
the culture's `stage.outline` and painted-leather `<pattern>` fills) or a `polygon` region of the
puppet's `image` (raster rigs: painted artwork, or a family's drawing). A raster parent's region
has its children's regions cut out with an even-odd clip, so a raised arm leaves no ghost. A
vector puppet may carry `art` (image + polygon parts); the scene preloads it and switches to it
once the file exists, so packs work before the artwork lands. Each part may rotate around its
own pivot driven by one pose axis: `arm`, `lean`, `talk`, `bob`, `stride` (legs, from the
puppet's walking phase) (plus `arm-inverse`/`stride-inverse` for the opposite limb).
The scene follows every puppet's target pose tightly each frame, faces it the way it walks (a
`turn` gesture flips it on the spot), and plays short gesture animations (wave, jump, spin, bow,
nod, shake, turn). The culture's `stage` block decides look:
translucent + blurred on a lit muslin for shadow theatre, opaque in a striped booth for Punch.

## Motion and speech (`lib/motion.ts`, `lib/speech.ts`)

- `MotionModel` turns sensor samples into a pose the way a rod behaves. Sideways and upward hand
  travel come from the accelerometer, integrated with zero-velocity resets (still hand → velocity 0) and walls at the stage edges, so it never drifts far; the arm's turn (heading) adds to it.
  Lean, pitch and heading are read from the DeviceOrientation rotation matrix, not the raw Euler
  angles, because an upright phone sits in the gimbal lock. A sharp wrist twist is a `turn`, a
  deep tip forward is a `bow`. Everything is tunable live (`MotionTuning`, persisted per device).
  iOS needs `requestPermission()` from a tap and reports acceleration with the opposite sign.
- The phone sends poses at 50 Hz when they change; the TV follows with a 45 ms time constant and
  adds the swing of a dragged rod (feet trailing) from the puppet's own velocity.
- `createSpeechSession` wraps `webkitSpeechRecognition` with restart-on-end and a transcript
  buffer that resets when the line changes. Firefox has no API → "I said it" button.

## Draw your own (`pages/Draw.tsx`, `lib/cutout.ts`, `shared/rig.ts`)

The phone photographs a drawing. `cutout.ts` estimates the paper colour from the border, marks
pixels that differ, keeps the largest blob, fills its holes, feathers the edge and crops: a
transparent PNG, entirely on-device. `rig.ts` guesses seven joints from the mask (head, neck,
shoulder, hand, hips, feet) for the family to confirm or re-tap, then builds a basic rig: head
above the neck, a capsule arm from shoulder to hand with the width measured on the mask, two
legs that stride, everything else the body, rod at the neck. The puppet (image inside, ≈200 kB)
is saved on the phone and sent to the TV over the relay as a `puppet` message; the TV keeps it
for the session, offers it in the seat's puppet list, and lets it play any part in a play
without swapping it for the pack's figure.

## Assisted play

Lines of characters nobody holds are read by the TV with the Web Speech Synthesis voice of
the play's language, then advanced (`auto-advance`, not counted as spoken). The next line is
shown under the current one on the TV and on the phone whose turn is next. A coaching card
appears on the TV when the first rod is picked up.

## Relay (`apps/relay/src/index.ts`)

- `POST /api/rooms` picks a 4-letter code, asks the DO to `/create`; 409 means a live room has it.
- `GET /api/rooms/:code/ws` upgrades and hands the socket to the DO with `acceptWebSocket`
  (hibernation: idle rooms cost nothing). Identity lives in the socket attachment, so the DO
  rebuilds the peer list from `getWebSockets()` on every event.
- `ping`/`pong` is answered by the runtime via `setWebSocketAutoResponse`.
- An alarm deletes storage three hours after the last socket closes.

## Entitlements (`apps/relay/src/entitlements.ts`)

`ENTITLEMENTS_MODE=open` (dev, self-host) unlocks everything. `lemonsqueezy` requires a licence
key: the host phone types it, the stage calls `/api/license/activate`, the Worker checks it with
Lemon Squeezy's licence API (no secret needed) and the TV keeps the key in localStorage.
`docs/PRICING.md` has the model.

## Deploy

`wrangler deploy` from `apps/relay` publishes the Worker with the DO migration and the assets.
`.github/workflows/perde-deploy.yml` does it on every push to `main` when the two Cloudflare
secrets exist. `docs/DEPLOY.md`.

## Decisions

Short ADRs in `docs/decisions/`. Add one whenever you choose between real alternatives.
