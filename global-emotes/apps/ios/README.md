# Global Emotes — iOS

Host app (SwiftUI) + custom keyboard extension + share extension. Swift, no cross-platform framework (ADR-0001).

## What's real here

- `EmoteKeyboard/KeyboardViewController.swift` — `UIInputViewController` rendering the app-group emote cache; tap = copy to pasteboard ("Copied — paste to send"), long-press = insert `:shortcode:` text via the document proxy, globe button switches keyboards. **`RequestsOpenAccess: false`** — the keyboard needs no network and no Full Access because the host app syncs packs into the shared container.
- `EmoteShare/ShareViewController.swift` — pick an emote, share the full-quality variant into the target app.
- `Shared/SharedStore.swift` — app-group JSON manifest + content-addressed image cache (round-trip + forward-compat tested in `Tests/`).
- `GlobalEmotes/` — host app: setup instructions, honest permission copy, `SyncService` pulling `/v1/sync/manifest`.

## Honest platform reality (do not oversell)

iOS keyboards cannot insert images into arbitrary apps like native emoji. The supported paths are: pasteboard copy → user pastes; share extension; text shortcodes. Secure fields automatically fall back to the system keyboard (OS behavior). The keyboard never reads `documentContextBeforeInput`/`AfterInput` — CI greps for those symbols.

## Build (requires macOS + Xcode; not available in repo CI)

```bash
brew install xcodegen
cd apps/ios
xcodegen generate          # produces GlobalEmotes.xcodeproj from project.yml
open GlobalEmotes.xcodeproj
# Select the GlobalEmotes scheme → run on simulator.
# Add a unit-test target (GlobalEmotesTests) pointing at Tests/ to run SharedStoreTests.
```

Signing: set your team in Xcode; bundle ids derive from `project.yml` (`app.globalemotes.*`, app group `group.app.globalemotes.shared`) — change once, regenerate. TestFlight checklist: `docs/app-store/IOS_REVIEW_CHECKLIST.md`.
