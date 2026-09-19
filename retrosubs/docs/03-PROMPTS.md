# Copy-paste prompts to continue RetroSubs

You do not need to project-manage this. Each block below is a complete, self-contained prompt.
Paste **one** into a fresh Claude Code session on branch `claude/retro-subtitle-app-mvp-vhbdu4`,
let it finish, install the APK from the CI run, and try it. Then move to the next one.

**Rules that apply to every prompt** (they are repeated inside each block so you can paste just one):
work in `retrosubs/`, keep the module boundaries in `docs/01-ARCHITECTURE.md`, never break the
existing phases, run `gradle :app:testDebugUnitTest :app:assembleDebug` (or let CI do it) and fix
every error before finishing, and update `docs/02-ROADMAP.md` + `PROJECT_STATUS.md`.

---

## P1 — Field test and polish (do this first, after your first real phone test)

> Read `retrosubs/README.md` and `retrosubs/docs/01-ARCHITECTURE.md` first.
> I installed the APK and tried it. Here is what happened: **<describe exactly what you saw —
> what the box looked like, how late the text was, what broke, what felt wrong>**.
> Fix those issues in `retrosubs/android`. Do not add new features. Keep the module boundaries.
> Verify with `gradle :app:testDebugUnitTest :app:assembleDebug` and push to the branch so CI
> builds a new APK.

## P2 — Speech quality pass

> In `retrosubs/`, improve transcription quality and continuity without changing the UI or the
> `SpeechRecognitionProvider` interface. Specifically: smooth the restart gap in
> `AndroidSpeechProvider` (measure it, then hide it — e.g. keep the last hypothesis on screen
> instead of clearing), add exponential backoff telemetry to logcat, add a silence/VAD guard so
> restarts do not thrash, and add JVM unit tests for the restart state machine by extracting it
> into a testable class. Verify with `gradle :app:testDebugUnitTest :app:assembleDebug`.

## P3 — Swap in a cloud streaming STT provider (proves the abstraction)

> In `retrosubs/`, add a second `SpeechRecognitionProvider` implementation that streams 16 kHz PCM
> to a cloud STT WebSocket (pick one and say why; keep the API key in
> `local.properties` / `BuildConfig`, never committed). Add a provider picker in Settings, and a
> latency HUD (ms from first audio to first partial) shown in the app but not in the overlay.
> Do not change `DialogueLine`, `SubtitleBus`, or any UI class. Verify the Android on-device
> provider still works when no key is configured. Build and test before finishing.

## P4 — Phase 5 wiring: MediaProjection source in the UI

> `retrosubs/android/.../audio/PlaybackCaptureSource.kt` exists but nothing starts it. Wire it up:
> add a "MEDIA MODE" toggle in `MainActivity` that requests `createScreenCaptureIntent()`, starts
> `OverlayService` with the projection result, starts the foreground service with type
> `mediaProjection` **before** calling `getMediaProjection()`, and passes a `PlaybackCaptureSource`
> into `AndroidSpeechProvider` as `externalAudio`. Honour the Android 14/15 rules in
> `docs/00-FEASIBILITY.md` (fresh consent per session, no cached token). Handle `onStop()` from the
> projection callback. Test it against a YouTube video; document clearly in the UI that VoIP call
> audio can never be captured this way. Build and test before finishing.

## P5 — Companion display mode (the second-device architecture)

> Implement the protocol in `retrosubs/docs/04-IOS-AND-COMPANION.md`, Android-only for now:
> a publisher that broadcasts `DialogueLine` as newline-delimited JSON over the LAN with NSD
> discovery and a 4-digit pairing code, and a renderer mode in the same app that subscribes and
> feeds the existing `DialogueBoxView` full-screen. No accounts, no cloud, no relay. Add unit
> tests for the wire format. Build and test before finishing.

## P6 — Second theme, proving the theme seam

> Add a "Cyberpunk terminal" theme as a second `RetroTheme` plus, if needed, a small strategy for
> chrome drawing — without touching the pipeline, the providers or `DialogueLine`. Add a theme
> picker to Settings and the overlay. If adding the theme requires changing anything outside
> `ui/`, stop and tell me why: that would mean the seam is wrong and should be fixed first.

## P7 — iOS table mode

> Start `retrosubs/ios/`: a SwiftUI app with `SFSpeechRecognizer` (on-device where available)
> feeding a Swift port of `DialogueBoxView` drawn with Canvas/CoreGraphics, plus the companion
> *renderer* role from `docs/04-IOS-AND-COMPANION.md`. Do **not** attempt overlays, ReplayKit or
> PiP-as-overlay — `docs/00-FEASIBILITY.md` explains why. Keep the same `DialogueLine` wire format.

---

## How to ask for a fix when something is broken

Vague ("it doesn't work") costs a round trip. Use this shape:

> In `retrosubs/`: **what I did** → **what I expected** → **what actually happened** (+ logcat if
> you have it: `adb logcat | grep -E "RetroSubs|SubtitleEngine|AndroidSpeech"`). Fix the root
> cause, not the symptom; build and test before finishing.
