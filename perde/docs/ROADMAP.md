# Roadmap

Milestones, not dates. A milestone is done when every box is ticked and `pnpm verify` is green.
`pnpm metrics` reads the boxes below and writes `PROGRESS.md`. Tick boxes in the same PR as the
work; don't tick ahead.

## M0 — Foundations ✅

- [x] Monorepo with pnpm workspaces, strict TypeScript, ESLint, Prettier, Vitest
- [x] Wire protocol with zod schemas shared by phone, relay and TV
- [x] Play, puppet and culture schemas with cross-reference lint
- [x] Turkish-aware fuzzy line matcher with unit tests
- [x] Pure room routing logic with unit tests
- [x] CI: typecheck · lint · unit · content lint · build · e2e (`perde-ci.yml`)
- [x] CLAUDE.md, docs, skills, progress metrics

## M1 — A family can play Karagöz tonight ✅

- [x] Relay: Cloudflare Worker + Durable Object rooms with WebSocket hibernation
- [x] TV: room code + QR per seat, lobby → free play → play, karaoke bar, curtain
- [x] Phone: pick-up flow (iOS motion permission), gyroscope → pose, touch strip, gestures
- [x] Phone: Web Speech API (tr-TR / en-GB) with "I said it" fallback
- [x] Stage machine: casting, unclaimed characters, speech matching, leniency levels
- [x] Karagöz pack: 5 puppets (Karagöz, Hacivat, Çelebi, Zenne, Tuzsuz Deli Bekir)
- [x] Karagöz pack: 4 plays (Giriş, Salıncak, Kayık, Eczahane)
- [x] Landing page (TR/EN) with live stage
- [x] Deploy workflow to Cloudflare Workers

## M2 — Feels good in the hand

- [ ] Playtest on iPhone + Android on real Wi‑Fi; record tilt→movement latency in `docs/PLAYTESTS.md`
- [x] Track the hand, not just the wrist: sideways/upward travel from the accelerometer with zero-velocity resets, heading and lean from the rotation matrix (no gimbal lock upright), 50 Hz sends, 45 ms follow on the TV
- [x] Hang the figure from its rod point and let the feet trail when dragged; face the way it walks; wrist flick turns it, tipping forward bows
- [x] No buttons on the phone while playing: the screen is the rod (drag to walk, double-tap the line to count it as said); set-up lives behind ☰
- [x] Live motion tuning panel on the phone (gains, deadband, inversions, iOS sign) persisted per device
- [ ] Tune the default gains from real-device numbers (copy them from the tuning panel into `DEFAULT_TUNING`)
- [x] Look like the real thing: parchment grain, hand-inked Ottoman street backdrop, patterned painted-leather kaftans with ink outlines, curled çarık shoes, striped seaside booth for Punch
- [x] Raster puppet rigs: an image plus part polygons with pivots; a parent's region has its children cut out (no ghost arms). Packs can carry painted artwork (`art`) that replaces the vector rig once its file loads
- [x] Drop the generated Karagöz, Hacivat and backdrop artwork into `apps/web/public/art/tr/` (`docs/ART.md`)
- [x] Shadow-screen look: dark room, wooden frame and valance, lamp behind the cloth, visible rods, layered arms
- [x] Painted Çelebi and Zenne (generated, tiled and rigged the same way); every seat's figure is a tasvir
- [x] Seats have home spots on the stage; a phone's x is travel from home, so four figures never pile up
- [x] Draw your own puppet on the phone: photo → paper removed on-device → tap the joints (guessed first) → head, arm and legs rigged → lives on the phone and travels to any TV
- [x] The TV reads the lines of characters nobody holds (speech synthesis) and moves on; the next line shows under the current one; a coaching card appears when the first rod is picked up
- [ ] Speech: log pass/fail per line in the browser console and collect a first accuracy table
- [x] Puppet entrances/exits (walk in from the wing, walk off when the section ends); Karagöz drops in from above
- [x] Sound: tef (tambourine) hit on entrance and a curtain sting, synthesized with WebAudio
- [x] The show opens like a real one: a painted göstermelik hangs in the lobby and lifts with the nareke whistle; the TV asks for one tap to unlock sound and fullscreen
- [x] TV keyboard/remote help overlay (`?`), fullscreen prompt on load
- [x] Reconnect UX: phone shows "reconnecting…" and re-sends its pose; TV survives a reload

## M3 — Plus is real

- [ ] Lemon Squeezy store, product and licence keys wired (`ENTITLEMENTS_MODE=lemonsqueezy`)
- [x] Checkout link on the landing page (`PERDE_CHECKOUT_URL`) and the locked-play prompt on the phone
- [ ] Licence activation flow tested end to end with a test-mode key
- [ ] `docs/PRICING.md` prices confirmed after the first ten sales (numbers only, no gating)
- [ ] Custom domain on Cloudflare (perde.app or whatever is bought) and HTTPS everywhere

## M4 — More Karagöz

- [ ] Plays: Kanlı Kavak (softened), Yalova Safası, Ters Evlenme, Ağalık
- [ ] Puppets: Beberuhi, Laz, Kastamonulu, Arnavut, Bebe Ruhi's frog
- [ ] The classic semai as an actual sung intro with a short melody (WebAudio)
- [x] Section titles on the TV between fasıl parts
- [ ] Free-play props: a swing, a boat, a shop counter as scenery layers per play

## M5 — Other traditions

- [ ] Wayang Kulit (Indonesia): gunungan, Semar, Petruk, a Ramayana scene; shadow-screen look
- [ ] Kasperle (Germany): Kasperle, Gretel, Krokodil, Räuber; one play
- [ ] Guignol (France): Guignol, Gnafron, Madelon; one play
- [ ] Píyǐngxì (China): two figures with articulated arms; one short scene
- [ ] Pulcinella (Italy) as the ancestor of Punch; one play
- [ ] Culture picker on the TV lobby (not only from the phone)
- [ ] Automatic joint detection for drawings (pose model in the browser) prefilling the taps

## M6 — Beyond the living room

- [ ] Record a show (canvas capture + mic) and save it to the phone
- [ ] Classroom mode: 4 phones, teacher's phone is host, shorter plays
- [ ] Custom puppet colours (Plus): per-seat palette swap
- [ ] PWA install prompt on phones; offline landing
- [ ] Accessibility pass: keyboard on the TV, screen-reader labels on the phone, reduced motion
