# RetroSubs — Architecture

## Product in one line
Real-life conversations, rendered as a late-90s Japanese RPG dialogue box, live.

## The pipeline

```
AudioSource            SpeechRecognitionProvider      Translator          DialogueRenderer
┌──────────────┐       ┌─────────────────────┐       ┌────────────┐      ┌───────────────┐
│ Mic          │──PCM─▶│ Android on-device   │─part─▶│ ML Kit     │─tr──▶│ DialogueBox   │
│ MediaProject │       │ (swappable:         │       │ on-device  │      │ typewriter    │
│ Fake script  │       │  Whisper / cloud)   │       │ (async)    │      │ pixel chrome  │
└──────────────┘       └─────────────────────┘       └────────────┘      └───────────────┘
                                  │                                              ▲
                                  └──── SubtitleBus (StateFlow<DialogueLine>) ────┘
                                                      ▲
                                          SpeakerDetector labels the line
```

Everything talks through **one immutable model** and **one bus**. No component knows about
any other's implementation.

### `DialogueLine` (the only contract the UI understands)

```kotlin
data class DialogueLine(
    val id: Long,              // same id = update the SAME box (no message spam)
    val speaker: Speaker,      // YOU / OTHER / SPEAKER_N, name + palette + avatar seed
    val text: String,          // original transcription, grows as speech arrives
    val translation: String?,  // arrives later, never blocks `text`
    val isFinal: Boolean,
)
```

Partial hypotheses reuse the same `id`, so the dialogue box *grows* instead of spawning
new lines. A new `id` is minted when the recognizer finalizes a phrase or the speaker changes.

## Module map (`app/src/main/java/app/retrosubs/`)

| Package | Responsibility | Swap point |
|---|---|---|
| `core/` | `DialogueLine`, `Speaker`, `SubtitleBus`, `TranscriptSession` | — |
| `audio/` | `AudioSource` interface; `MicAudioSource`, `PlaybackCaptureSource` (MediaProjection) | add sources |
| `speech/` | `SpeechRecognitionProvider` interface; `FakeScriptProvider` (Phase 1), `AndroidSpeechProvider` (Phase 2) | **Whisper / Deepgram / cloud streaming drop in here** |
| `translate/` | `Translator` interface; `NoopTranslator`, `MlKitTranslator` | cloud MT drops in here |
| `speaker/` | `SpeakerDetector` interface; `AlternatingSpeakerDetector`, `ManualSpeakerDetector` | real diarization later |
| `ui/` | `DialogueBoxView` (Canvas-drawn), `RetroTheme`, `Typewriter`, `TextBlip` | **new themes = new `RetroTheme`, no pipeline change** |
| `overlay/` | `OverlayService` (typed FGS + `TYPE_APPLICATION_OVERLAY`), drag/collapse/pause/close | — |
| `settings/` | `Prefs` — position, font size, opacity, speed, sound, mode, languages | — |
| `MainActivity` | Permissions, mode switches, live preview, demo script | — |

## Key design decisions

- **Single bus, single box.** `SubtitleBus` is a `MutableStateFlow<DialogueLine?>` in a plain
  object, shared by the Activity preview and the overlay window. Both render the same state, so
  the preview in-app and the floating overlay are pixel-identical by construction.
- **Translation never blocks transcription.** `MlKitTranslator` is fire-and-forget per revision;
  a stale result is dropped by comparing the line `id` + source text length.
- **The overlay is a plain `View`, not Compose.** It lives in a `WindowManager` window with no
  Activity/lifecycle owner; a custom `View` avoids `ViewTreeLifecycleOwner` plumbing entirely
  and draws the pixel chrome directly with `Canvas` (crisp, no bitmap assets, no licensing).
- **Original art only.** The retro look is generated at runtime: an original 5-color palette,
  drawn 3px pixel border with notched corners, scanline wash, chunky monospace text, a blinking
  triangular "continue" caret, and a procedurally drawn 16×16 avatar sigil derived from the
  speaker id. Nothing is copied from any existing game.
- **Recognizer restart loop.** `AndroidSpeechProvider` re-arms `SpeechRecognizer` on
  `onEndOfSpeech` / `onError` with backoff, so "continuous" listening is emulated safely.

## Audio reality (see `00-FEASIBILITY.md`)

| Mode | What it listens to | Works with |
|---|---|---|
| **Room mode** (default) | Phone mic | In-person conversation; *any* call played on speaker from a second device |
| **Speaker mode** | Phone mic during your own call on speakerphone | Best-effort — Android usually silences us; the app detects `isClientSilenced()` and says so |
| **Media mode** | `MediaProjection` playback capture | YouTube/Twitch/video notes — anything that is `USAGE_MEDIA` |

## iOS (documented, not built in MVP)
In-app "table mode" + **companion display mode** (iPhone transcribes, a second device renders the
box over a local network link). No overlay API exists; PiP-as-overlay is a rejection risk.
