# Vision

## The scene

A parent in a living room, a child on the sofa, the TV on. Two phones. One is Karagöz, the other
Hacivat. The parent tilts a phone and the puppet on the screen leans; the child grabs the other
phone and Hacivat hops. At the bottom of the screen a line of dialogue lights up word by word as
someone says it. The play moves on. Twenty minutes later the child knows what "Yâr bana bir
eğlence!" means and wants to do it again tomorrow.

That is the whole product. Everything in this repo serves that scene.

## Who it is for

- **The parent** who grew up with Karagöz on TRT and wants to hand it on without a museum trip.
- **The child** (4–9) who will hold a phone anyway and might as well hold a puppet rod.
- **Teachers and grandparents** as second-order users: a class with four phones, a grandparent
  reading Hacivat's lines because they know them by heart.
- Families in other traditions: the same living room in Manchester with Punch and Judy, in
  Jakarta with Wayang Kulit, in Munich with Kasperle. Perde is global from the first version.
- **The child who draws.** A figure on paper, one photo, and it walks on the TV with the family's
  voice. The drawing is a puppet like any other and can play Hacivat tonight.

## Principles

1. **Zero setup.** No app store, no accounts to play. A URL on the TV, a QR code on the phone.
2. **The phone is a rod, not a screen.** Look at the TV, not the phone. The phone shows only what
   the puppeteer needs: their line, and a place to drag.
3. **Say it, don't tap it.** Lines advance by speech. Tapping is the fallback, never the design.
4. **Content is the product.** Plays and puppets are data files. The app is a stage; the plays are
   why you come back. Every tradition is a pack.
5. **Respect the tradition.** The opening formula, the characters' voices, the "sürç-i lisan
   ettikse affola" ending: keep them. Cut the beatings and the innuendo; keep the wordplay.
6. **Free is a real show.** The free tier is a complete Karagöz night (opening + one play), not a
   demo. Plus is more nights and more traditions.

## What "done" looks like

- A family can go from the landing page to a finished play in under three minutes.
- Speech recognition passes a clearly spoken line at least nine times out of ten on a mid-range
  Android phone in Turkish.
- Puppet motion feels attached to the hand: under 150 ms from tilt to movement on the same Wi‑Fi.
- Adding a play is one file and one line in an index. Adding a tradition is one folder.
- The service runs on Cloudflare's free tier until it has real traffic, then scales without a
  rewrite.

## What this is not

- Not a video call, not a recorder, not a social network. (Recording a show to share is a later
  milestone; sharing to strangers is not.)
- Not a general puppet editor. Puppets are authored in code by people who care about the art.
- Not a subscription treadmill. Plus is a one-time purchase per family.

## How we work

No gates, no deadlines, measured progress. See `CLAUDE.md` for the operating rules and
`docs/METRICS.md` for what we count.
