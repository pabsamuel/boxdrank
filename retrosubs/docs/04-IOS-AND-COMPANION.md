# iOS & the companion-device architecture

## What iOS genuinely allows

| Want | Reality |
|---|---|
| Floating box over WhatsApp/FaceTime | **Impossible.** There is no third-party overlay API at any entitlement level. |
| Tap another app's call audio | **Impossible.** The sandbox + audio session rules forbid it; `CallKit` gives events, never audio. |
| Transcribe our own mic, live | ✅ `SFSpeechRecognizer` with `requiresOnDeviceRecognition`, streaming partials — the same quality as the Android path. |
| System-wide capture | ⚠️ `ReplayKit` broadcast upload extension (`audioApp` + `audioMic`), user-initiated from Control Center, ~50 MB memory cap, no audio units, protected content excluded — and still nowhere to draw. |
| Persistent glanceable surface | ⚠️ Live Activities / Dynamic Island, but ActivityKit throttles updates, so it suits "last finished line", not typewriter text. |
| Picture-in-Picture as an overlay | ⚠️ Technically you can push rendered text frames through `AVSampleBufferDisplayLayer`; Apple treats PiP-as-overlay as misuse and it is a review risk. |

**Therefore the iOS product is not "the Android app again".** It is two modes:

1. **Table mode** — the iPhone lies on the table during an in-person conversation, our app in the
   foreground, full-screen dialogue box. No overlay needed because we *are* the foreground app.
2. **Companion display mode** — the interesting one.

## Companion display mode

```
  Device A (in the call)                      Device B (the "screen")
┌──────────────────────────┐   local link   ┌──────────────────────────┐
│ FaceTime / Zoom / Meet   │  ── LAN/BLE ─▶ │ RetroSubs, full screen   │
│ RetroSubs listening to   │   DialogueLine │ retro dialogue box       │
│ the room over the mic    │      JSON      │ (phone, tablet, laptop)  │
└──────────────────────────┘                └──────────────────────────┘
```

Why it is more than a workaround:

- It **sidesteps every overlay restriction on both platforms**, because the renderer is the
  foreground app on its own device.
- It works with apps we can never integrate with, including carrier calls and hardware conference
  phones — the "capture" is just a microphone hearing a speaker.
- It is the natural shape for the desktop client (Discord/Zoom/Teams in a browser, subtitles in an
  always-on-top window).

### Protocol sketch (unbuilt, deliberately tiny)

`DialogueLine` is already the wire format. A publisher broadcasts newline-delimited JSON over a
LAN socket discovered with NSD/Bonjour; a renderer subscribes and feeds its own `DialogueBoxView`.
Both sides are dumb: no accounts, no relay server, no cloud — pairing is a 4-digit code shown on
the renderer.

**Order of work when this phase starts:** publisher on Android (it already produces the lines) →
renderer on Android (same view, different source) → renderer on iOS/desktop → iOS publisher last,
since `SFSpeechRecognizer` is the only new native piece.
