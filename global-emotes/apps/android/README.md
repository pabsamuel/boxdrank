# Global Emotes — Android

Host app + production IME keyboard. Kotlin, no cross-platform framework (ADR-0001).

## What's real here

- `keyboard/EmoteKeyboardService.kt` — `InputMethodService` rendering the offline pack cache; taps insert via `InputConnectionCompat.commitContent` with temporary URI grants (FileProvider), falling back to clipboard-copy ("Copied — paste to send") and share sheet.
- `keyboard/InsertionHelper.kt` — pure delivery-method selection (unit-tested on the JVM: `./gradlew :app:testDebugUnitTest`). Runtime `EditorInfo` MIME detection always wins; the server compatibility registry is hints only.
- `data/PackRepository.kt` — JSON manifest + content-addressed variant cache shared host-app → IME. The IME performs **no network I/O**; `data/SyncWorker.kt` (WorkManager, host app) syncs `/v1/sync/manifest` and downloads variants.
- `MainActivity.kt` — setup wizard (enable keyboard → switch) with the privacy explainer.

## Privacy invariants (CI-enforced)

The keyboard never calls `getTextBeforeCursor`, `getTextAfterCursor`, `getSelectedText`, never logs key events, and makes no network calls. The `keyboard-privacy` CI job greps this source tree for those symbols and fails the build if any appear in keyboard code.

## Build (requires Android SDK; not available in the repo CI container)

```bash
cd apps/android
./gradlew :app:assembleDebug        # debug APK
./gradlew :app:testDebugUnitTest    # JVM unit tests (insertion planner)
```

Generate the Gradle wrapper on first checkout if missing: `gradle wrapper --gradle-version 8.11`.

## Device test matrix

Fill in `docs/COMPATIBILITY_MATRIX.md` from real devices before making any app-support claims. Known baseline: Gboard-style commitContent works in Google Messages/Telegram/Discord; WhatsApp requires the clipboard/share path.

## TODO before store submission

Launcher icons (owner brand assets), signing config, Play data-safety form (see `docs/app-store/ANDROID_RELEASE_CHECKLIST.md`).
