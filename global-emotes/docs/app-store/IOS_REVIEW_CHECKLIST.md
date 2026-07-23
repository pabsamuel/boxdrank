# iOS App Store review checklist

- [ ] Owner Apple Developer account; bundle ids `app.globalemotes{,.EmoteKeyboard,.EmoteShare}` (or rebranded) registered with app group `group.app.globalemotes.shared`
- [ ] App icons + launch assets (owner brand — placeholders shipped)
- [ ] Privacy nutrition labels: email (account), identifiers (install id), usage data (allowlisted events) — **no** "keyboard input" collection; keyboard has `RequestsOpenAccess: false`
- [ ] Review notes: explain the keyboard reads only the app-group cache, needs no Full Access, and that emote insertion is copy/paste by design (include the keyboard-privacy URL)
- [ ] Guideline 4.4 (extensions): keyboard functions without network; provides the globe key (`handleInputModeList`) ✓ implemented
- [ ] Creator SaaS is web-billed (no IAP at v1); Fan Plus IAP deferred — do not mention paid unlocks in-app until IAP ships (3.1.1 compliance)
- [ ] Demo account for review: seeded fan account + pre-synced packs on a TestFlight build
- [ ] Screenshots (6.7", 5.5"), description honest about supported-app insertion vs paste
- [ ] Export compliance: standard HTTPS only
