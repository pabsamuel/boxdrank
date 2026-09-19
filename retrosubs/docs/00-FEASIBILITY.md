# RetroSubs — Phase 0: Platform Feasibility Analysis

**Question:** can a phone show live, retro-JRPG-styled subtitles for *any* conversation —
in-person, or on WhatsApp / FaceTime / Discord / Telegram / Messenger / Meet / Zoom?

**Short answer:** The *universal* version — "silently tap the audio of whatever call app is
running and float a dialogue box over it" — is **not possible on unmodified Android or iOS**.
Both platforms deliberately block third-party apps from capturing VoIP audio.

But a very close experience *is* possible, and on Android it is possible today:

> **Room audio → on-device streaming STT → floating retro dialogue box over any app.**

That covers in-person conversations natively, and covers *every* calling app on the planet
via **speakerphone** or a **second device** — with no per-app integration, ever.

---

## 1. The hard blockers (verified against current platform docs)

### Android

| API | What it actually gives you | Blocker |
|---|---|---|
| `AudioRecord` (`MIC` / `VOICE_RECOGNITION`) | Live PCM from the microphone | While another app holds the mic for a **VoIP call**, an ordinary app gets **silence**. Android 10+ uses a priority scheme: voice-call capture wins; concurrent capture is reserved for privileged/pre-installed apps and (conditionally) accessibility services. `VOICE_COMMUNICATION`/`CAMCORDER` capture is **privacy-sensitive by default**, which blocks concurrent capture outright. |
| `MediaProjection` + `AudioPlaybackCaptureConfiguration` | Copy of another app's *playback* audio | Only `USAGE_MEDIA`, `USAGE_GAME`, `USAGE_UNKNOWN` can be captured. VoIP apps play call audio as `USAGE_VOICE_COMMUNICATION` → **never capturable**. Apps may also opt out with `android:allowAudioPlaybackCapture="false"`. Great for YouTube/Twitch/video, useless for calls. |
| `VOICE_DOWNLINK` / `VOICE_UPLINK` / `TYPE_TELEPHONY` | Actual carrier-call audio | Requires `CAPTURE_AUDIO_OUTPUT` — **signature\|privileged** permission. Not grantable to a Play-Store app. This is why call recorders died after Android 10. |
| `AccessibilityService` | UI tree, gestures, on-screen text | Does **not** hand you an audio stream. It raises audio-sharing priority in some cases, but it cannot defeat a privacy-sensitive VoIP capture, and Play policy restricts accessibility use to genuine accessibility features. |
| `SYSTEM_ALERT_WINDOW` (`TYPE_APPLICATION_OVERLAY`) | ✅ **Real floating window over other apps** | User must grant "Display over other apps" in Settings. Hidden over system permission dialogs, and any app may call `setHideOverlayWindows(true)` (banking apps do). Otherwise it works over WhatsApp/Discord/Meet/etc. |
| Foreground service | ✅ Keeps capture + overlay alive | Android 14+: must declare `foregroundServiceType` (`microphone`, `mediaProjection`) and matching `FOREGROUND_SERVICE_*` permission. Android 15+: MediaProjection needs **fresh user consent per session**; token cannot be cached; FGS must be started *after* consent. |
| `SpeechRecognizer` | ✅ Streaming partial results, free, on-device on modern devices | Not designed for hours of continuous listening; sessions end on silence → we re-arm in a loop. `createOnDeviceSpeechRecognizer` (API 33+) forces offline. |

### iOS

| API | What it actually gives you | Blocker |
|---|---|---|
| Floating overlay over other apps | — | **Does not exist.** No public API, at any entitlement level. |
| `ReplayKit` broadcast upload extension | System-wide screen + `audioApp` + `audioMic` sample buffers | Requires the user to start a broadcast from Control Center; the extension is memory-limited (~50 MB) and audio units are forbidden inside it; FaceTime/DRM content is protected. Even when it works, **you still cannot draw over the foreground app** — so you'd need a second screen anyway. |
| `CallKit` | Call lifecycle events (start/end/mute) | **No audio access.** It tells you a call exists, nothing more. |
| `AVAudioSession` mic capture during a call | — | Another app's active call owns the audio session; mixing/recording a VoIP call is not permitted. |
| `SFSpeechRecognizer` | ✅ Streaming partials, on-device (`requiresOnDeviceRecognition`) | Works great — *for audio your own app is allowed to have* (its own mic session). |
| Picture-in-Picture | ✅ Floats a small window over other apps | Only plays **video** (`AVPictureInPictureController` over `AVSampleBufferDisplayLayer`); to show text you must render frames into a video layer, needs audio/video background mode, and Apple rejects PiP used as a general overlay. Technically a hack, not a product. |
| Live Activities / Dynamic Island | ✅ Persistent glanceable surface | Update budget is throttled (ActivityKit rate-limits frequent pushes/updates); not suitable for typewriter-speed text. Fine for "last line" summaries. |
| Accessibility APIs | — | No third-party audio tap, no overlay. |

---

## 2. Capability matrix

`✅ yes · ⚠️ conditional · ❌ no`

| Platform / scenario | Capture **remote** speaker | Capture **user** | Floating overlay | Major limitation | MVP workaround |
|---|---|---|---|---|---|
| **Android — in-person conversation** | ✅ (mic hears everyone) | ✅ | ✅ | Ambient noise, no diarization from a single mic | **This is the flagship demo.** Mic + overlay, zero hacks |
| **Android — call on speakerphone, same phone** | ⚠️ | ⚠️ | ✅ | Call app holds mic as privacy-sensitive → our `AudioRecord` is silenced on most OEMs/versions | Ship it, detect silence, tell the user honestly; use second-device mode instead |
| **Android — call on another device (laptop Zoom/Meet/Discord, 2nd phone), our phone listening** | ✅ (via speaker) | ✅ | ✅ | Needs speaker output, room acoustics | **Universal mode. Works with every app, forever, no integration** |
| **Android — media playback (YouTube/Twitch/video msg)** | ✅ `MediaProjection` | ✅ mic | ✅ | Only `USAGE_MEDIA/GAME/UNKNOWN`; app can opt out | Implemented as second audio source |
| **Android — WhatsApp/Discord/Telegram/Meet in-app audio** | ❌ | ❌ | ✅ | `USAGE_VOICE_COMMUNICATION` is uncapturable | Speakerphone / second device |
| **Android — carrier phone call** | ❌ | ❌ | ✅ | `CAPTURE_AUDIO_OUTPUT` is privileged | Speakerphone / second device |
| **iOS — in-person conversation (app foreground)** | ✅ | ✅ | ⚠️ only inside our own app | No system overlay | Full-screen "table mode" dialogue box |
| **iOS — any VoIP call** | ❌ | ❌ | ❌ | Sandbox + no overlay | **Companion mode**: iPhone takes the call, Mac/iPad/2nd phone renders subtitles |
| **iOS — ReplayKit broadcast** | ⚠️ app audio only | ✅ | ❌ | Extension limits, protected content, still no overlay | Not worth it for MVP |
| **Desktop (future) — Discord/Zoom/Meet/Teams** | ✅ loopback/virtual device | ✅ | ✅ always-on-top window | Needs a desktop client | Phase 7 |

**Conclusion:** build **Android-first, native Kotlin**. Android is the only platform that gives
a real floating overlay plus unrestricted mic capture in a background service. iOS gets an
in-app mode plus a companion-display mode later.

---

## 3. Why native Kotlin (not React Native / Flutter)

Every load-bearing capability of this product is a native Android system integration:
`SYSTEM_ALERT_WINDOW` window management, a typed foreground service, `AudioRecord`/`MediaProjection`,
`SpeechRecognizer`, ML Kit on-device translation, and a `Canvas`-drawn pixel UI that must render
at 60 fps inside a window that is *not* an Activity. In RN/Flutter all of that lives in a native
module anyway — the cross-platform layer would add a bridge, a build system and a class of bugs
while buying nothing, because the iOS half of the product is a *different architecture*, not the
same UI recompiled. Kotlin + Views (no Compose in the overlay: a plain custom `View` is lighter
and has zero window-token surprises outside an Activity).

---

## 4. Expected latency budget (Android, on-device `SpeechRecognizer`)

| Stage | Typical |
|---|---|
| Mic → recognizer buffer | 20–80 ms |
| Recognizer partial hypothesis | 150–400 ms after phoneme |
| Bus → overlay render | < 16 ms |
| Typewriter reveal (configurable, 25 ms/char, catches up when behind) | 0–150 ms perceived |
| **Total perceived (transcription)** | **≈ 300–800 ms** — inside the <1 s MVP target |
| + ML Kit translation (async, never blocks the original) | +150–500 ms after a phrase settles |

## 5. Cost

**$0 recurring for the MVP.** On-device `SpeechRecognizer` and on-device ML Kit translation are
free and offline. Only if we later swap in a cloud provider (Deepgram/AssemblyAI/Whisper API,
roughly $0.15–0.60 per audio hour) does cost appear — which is exactly why the provider is an
interface. Build cost: a phone, a GitHub Actions runner (free), no backend, no accounts.

## 6. Biggest technical risks

1. **Speakerphone same-device capture is probably silenced.** Mitigated by making second-device
   mode a first-class, documented product mode rather than a fallback. Handled in code by
   `AudioRecordingCallback.isClientSilenced()` → we *tell* the user instead of showing a frozen box.
2. **`SpeechRecognizer` session churn.** It stops on silence and some OEMs rate-limit restarts
   (`ERROR_RECOGNIZER_BUSY`). Mitigated by a restart loop with backoff and a provider interface
   so we can drop in Whisper/cloud streaming without touching the UI.
3. **On-device recognizer availability varies by OEM/locale.** We probe and fall back to the
   network recognizer.
4. **OEM overlay/battery killers** (Xiaomi, Oppo, Samsung) silently kill foreground services.
   Mitigated with a persistent notification + documented per-OEM allowlist steps.
5. **Diarization from one mic is unsolved for MVP.** We ship a manual/heuristic speaker labeler
   behind a `SpeakerDetector` interface rather than pretending.
6. **Accuracy in noisy rooms.** Nothing fixes this in the MVP; it argues for a cloud provider later.
7. **Play Store policy** if we ever touch accessibility/recording for calls. We deliberately don't.

## Sources

- [Sharing audio input (Android)](https://developer.android.com/media/platform/sharing-audio-input)
- [Capture video and audio playback (Android)](https://developer.android.com/media/platform/av-capture)
- [Media projection](https://developer.android.com/media/grow/media-projection)
- [Foreground service types are required (Android 14)](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- [Changes to foreground service types (Android 15)](https://developer.android.com/about/versions/15/changes/foreground-service-types)
- [Capturing Audio in Android Q](https://android-developers.googleblog.com/2019/07/capturing-audio-in-android-q.html)
- [ReplayKit security — Apple](https://support.apple.com/guide/security/replaykit-security-seca5fc039dd/web)
- [SpeechRecognizer](https://developer.android.com/reference/android/speech/SpeechRecognizer)
