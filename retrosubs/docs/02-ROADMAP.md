# RetroSubs — Phases & Status

| Phase | Goal | Status |
|---|---|---|
| **0** | Feasibility spike — what Android/iOS actually permit | ✅ `00-FEASIBILITY.md` |
| **1** | Fake transcript → retro dialogue box (proves the UI) | ✅ in-app preview + demo script |
| **2** | Mic → real streaming STT → dialogue box (<1 s) | ✅ `AndroidSpeechProvider` |
| **3** | Overlay floating above other apps | ✅ `OverlayService`, drag/collapse/pause/close |
| **4** | Optional translation (transcription / translation / learning modes) | ✅ ML Kit on-device |
| **5** | Capture both sides (MediaProjection playback capture; speakerphone probe) | ✅ media source + silence detection |
| **6** | iOS / companion-device architecture | 📄 designed, not built |
| **7** | Desktop client (Discord/Zoom/Meet/Teams loopback), more themes | 📄 backlog |

## Definition of done for the MVP
Install the APK → grant mic + overlay → tap **START** → switch to WhatsApp/Discord/anything →
speak → a nostalgic dialogue box types what was said, within a second.

## Backlog (deliberately not built)
Accounts, cloud sync, analytics, payments, social, onboarding funnels, admin.
Extra themes (Visual Novel / Cyberpunk terminal / Minimal) — one excellent theme first.
