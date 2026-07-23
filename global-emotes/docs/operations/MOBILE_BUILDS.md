# MOBILE BUILDS

This repo's CI container has no Android SDK or Xcode; the `android-build` CI job runs on GitHub-hosted runners (non-blocking until the Gradle wrapper is committed), and iOS builds are human-run on macOS. Exact commands:

## Android

```bash
cd apps/android
gradle wrapper --gradle-version 8.11    # first checkout only
./gradlew :app:testDebugUnitTest        # JVM insertion-planner tests
./gradlew :app:assembleDebug            # debug APK → app/build/outputs/apk/debug
```

Device test: install APK → Settings → add "Global Emotes" keyboard → open Google Messages → keyboard → tap emote (direct insert) → open WhatsApp → tap emote (expect "Copied — paste to send"). Record results in `docs/COMPATIBILITY_MATRIX.md`.

## iOS

```bash
brew install xcodegen
cd apps/ios && xcodegen generate && open GlobalEmotes.xcodeproj
```

Run the `GlobalEmotes` scheme on a simulator → Sync packs (requires local API running + a session cookie; for pure-UI testing, write a manifest into the app-group container). Enable the keyboard in Settings → verify copy flow in Notes, paste in Telegram. Secure-field check: focus a password field → system keyboard takes over (OS behavior) — document, don't fight it.

## Signing / stores

Owner accounts required (OWNER_ACTIONS). Checklists: `docs/app-store/IOS_REVIEW_CHECKLIST.md`, `docs/app-store/ANDROID_RELEASE_CHECKLIST.md`.
