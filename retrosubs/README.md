# RetroSubs

**Real-life conversations, but your phone turns them into a Japanese RPG.**

Live speech → streaming transcription → a nostalgic dialogue box that types itself out, floating
over whatever app you are in.

```
┌─────────────────────────────┐
│ ▞▚ YUKI                     │
│                             │
│  Are you coming tomorrow?   │
│                           ▼ │
└─────────────────────────────┘
```

Android-first, native Kotlin, no backend, no accounts, $0 running cost. On-device speech
recognition and on-device translation.

---

## Install it on a phone (no Android Studio)

1. Push to `main` (or open the PR run) → the **RetroSubs Android** GitHub Actions workflow builds
   `app-debug.apk`.
2. On `main` it is published as the rolling release **`retrosubs-latest`** — open that release on
   the phone's browser and tap the APK. On a PR, download it from the run's *Artifacts*.
3. Install (allow "unknown sources" for your browser), open **RetroSubs**.

## Use it

| Step | What happens |
|---|---|
| **PLAY DEMO SCRIPT** | A scripted conversation types itself into the in-app box — no permissions needed. This is Phase 1: it proves the look. |
| **START SUBTITLE MODE** | Grants microphone + "Display over other apps", then starts a foreground service with a floating dialogue box. |
| Switch to WhatsApp / Discord / Meet / anything | The box stays on top. Drag it with `⠿`, flip top/bottom with `⇅`, collapse with `▁`, pause with `❚❚`, close with `✕`. |
| Speak | Text appears progressively, ~300–800 ms behind the voice. |

### Getting both sides of a *call*

Android does not let any third-party app capture VoIP audio — that is a platform rule, not a
missing feature (details and sources in [`docs/00-FEASIBILITY.md`](docs/00-FEASIBILITY.md)). So:

- **In-person conversation** → just works, the mic hears everyone.
- **Call on a second device** (laptop Zoom/Meet/Discord, tablet FaceTime, another phone on
  speaker) → works with *every* app, forever, with no integration. This is the recommended mode.
- **Same-phone speakerphone** → best effort; the app detects when Android silences our mic and
  says so instead of freezing.

## Settings

Font size, opacity, typewriter speed, text blip sound, overlay anchor + drag position,
display mode (transcription / translation / learning), source and target language,
YOU/OTHER alternation.

## Repo layout

```
retrosubs/
├── README.md
├── docs/
│   ├── 00-FEASIBILITY.md     platform limits, capability matrix, risks, cost
│   ├── 01-ARCHITECTURE.md    module map and the swap points
│   ├── 02-ROADMAP.md         phases and status
│   ├── 03-PROMPTS.md         copy-paste prompts to continue the project
│   └── 04-IOS-AND-COMPANION.md
└── android/
    └── app/src/main/java/app/retrosubs/
        ├── core/        DialogueLine, SubtitleBus, TranscriptSession, SubtitleEngine
        ├── audio/       ExternalAudioSource, PlaybackCaptureSource (MediaProjection)
        ├── speech/      SpeechRecognitionProvider, FakeScriptProvider, AndroidSpeechProvider
        ├── translate/   Translator, MlKitTranslator
        ├── speaker/     SpeakerDetector strategies
        ├── ui/          DialogueBoxView, RetroTheme, PixelFont, TextBlip
        ├── overlay/     OverlayService (floating window + foreground service)
        └── settings/    Prefs
```

## Original art only

The retro look is drawn at runtime — an original palette, chamfered pixel chrome, scanline wash,
procedurally generated speaker sigils and a synthesised text blip. No fonts, sprites, sounds,
characters or UI graphics are copied from any existing game.
