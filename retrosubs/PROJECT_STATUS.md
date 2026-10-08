# RetroSubs — status

_Last updated: Phase 0–5 landing commit._

## Works today
- **Phase 0** — feasibility settled with sources: `docs/00-FEASIBILITY.md`.
- **Phase 1** — retro dialogue box, driven by a scripted conversation (`PLAY DEMO SCRIPT`).
  Typewriter, blinking caret, pixel chrome, speaker sigil, synthesised blip, adjustable
  size/opacity/speed.
- **Phase 2** — live microphone → Android on-device streaming recognition → the same box,
  with partial hypotheses updating one dialogue box instead of spawning messages.
- **Phase 3** — floating overlay above other apps, foreground service, drag / flip / collapse /
  pause / close.
- **Phase 4** — optional on-device translation (transcription / translation / learning modes),
  strictly asynchronous so it can never delay the original text.
- **Phase 5 (partial)** — `PlaybackCaptureSource` (MediaProjection) implemented and pluggable;
  not yet wired to a UI toggle (see prompt **P4**).

- **Vibe mode** — a second engine that does no recognition at all: it detects speech energy and
  types nonsense (Japanese kana or latin) in time with the speaker. Works with no recognizer, no
  network and no supported language.

- **Browser version** (`retrosubs/web`, live at https://pabsamuel.github.io/boxdrank/) — the only
  thing that runs on iOS: full-screen box over the front camera, two-line pagination, per-character
  blip, automatic punctuation, named speaker, on-device diagnostics.
- **Export and the free/Pro split** — photo and clip of exactly what is on screen, watermarked on
  the free tier, unlocked by a local Pro flag. Deliberately not a security boundary yet; the
  upgrade path is written down in `docs/05-MONETIZATION.md`.

## Not built, on purpose
- iOS app (`docs/04-IOS-AND-COMPANION.md` says exactly what iOS permits).
- Companion/second-device mode, desktop client, extra themes.
- Accounts, backend, analytics, payments — none of it is needed for the demo.

## Verification
JVM unit tests cover the line-identity rules (`TranscriptSessionTest`) and the vibe-mode word
factory (`GibberishTest`). The
**RetroSubs Android** workflow runs the tests, builds the debug APK on every push/PR, and
publishes a rolling `retrosubs-latest` release from `main`.
_This container cannot reach `dl.google.com`, so the Android SDK and Google Maven are unavailable
locally: CI is the build and the verification._

## Next action
Install the APK, try it in a real conversation, then paste prompt **P1** from
`docs/03-PROMPTS.md` with what you saw.
