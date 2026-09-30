# Content guide

Plays, puppets and traditions are data in `packages/content`. Nothing here needs app code.
`pnpm validate:content` enforces the hard rules; this page has the soft ones.

## Adding a play

1. Create `packages/content/src/<culture>/plays/<id>.ts` exporting a `PlayInput`.
2. Add it to the `plays` array in `packages/content/src/<culture>/index.ts`.
3. `pnpm validate:content && pnpm test`.
4. Tick or add a box in `docs/ROADMAP.md`, run `pnpm metrics`.

Rules:

- **≤ 14 words per line** (lint warns; tests fail). Shorter is better: children read along and
  speech recognition has to confirm it. Split long speeches into several lines by the same seat.
- **Every line is spoken.** Stage directions go in `hint` (shown small, never matched).
- **Start with the first character.** The first line belongs to `characters[0]`; for Karagöz
  plays that is Hacivat with the opening.
- **Gestures sparingly.** One `gesture` per beat, on the line where it lands.
- **Sung lines** get `song: true`; they are matched leniently (a third of the words).
- **Provenance in `source`.** Which traditional play, and that it is an original adaptation.
- **Premium?** The free tier is "Giriş + one play per culture". Everything else is `premium: true`.
- **Age.** `ageRange: '4+'` unless there is a reason. No hitting, no death, no innuendo; keep the
  wordplay and the misunderstandings, which are the actual comedy.

Karagöz specifics: keep the four-part shape (Mukaddime → Muhavere → Fasıl → Bitiş) even when
short. Hacivat speaks in flowery Ottoman phrases, Karagöz mishears them. End with "Yıktın perdeyi
eyledin viran! / Var git sahibine haber ver heman!" and the apology "sürç-i lisan ettikse affola".

## Adding a puppet

1. Add a `PuppetInput` in `packages/content/src/<culture>/puppets.ts`, export it in the pack's
   `puppets` array.
2. Use `shapes.ts` helpers (`blob`, `poly`, `circle`, `ellipse`, `rect`) in a 200×400 box, y down,
   feet on y=400 (booth puppets stop around y=330; the board hides the rest).
3. Author facing **right**; the stage flips it.
4. `rod: [x, y]` is where the puppeteer holds the figure. The whole figure leans and swings
   around it: the neck for a Karagöz figure (about `[100, 135]`), the base for a glove puppet
   (`[100, 330]`). If you leave it out, a point on the neck line is assumed.
5. Parts:
   - `body` is the root: pivot `[100, 400]`, `driver: 'lean'`, gain 3–4 (a little extra bend; the
     big lean comes from the rod).
   - `head` under body: pivot at the neck, `driver: 'talk'`, gain 4–6 (nods while speaking).
   - `arm` under body: pivot at the shoulder, `driver: 'arm'`, negative gain (−90…−120) so the
     hand rises; hang it down at rest. Booth puppets add `arm-l` with `arm-inverse` and positive gain.
   - `hat`/headgear under head with `driver: 'bob'` and a small negative gain: it flips when the
     puppet hops (Karagöz's ışkırlak is the reference).
   - Jaws: `snout-top` / `snout-bottom` with `talk` and opposite gains (see the crocodile).
6. Colours from the pack palette; shadow puppets are drawn translucent by the stage, so avoid
   pale fills on pale backgrounds (add a `stroke` if needed).
7. Look at it: `pnpm build && pnpm dev:relay`, then `/stage?demo=1&culture=<id>` or set the puppet
   from the phone menu. `pnpm screenshots` refreshes the docs images.

## Painted artwork for a puppet

A vector rig can carry painted artwork that replaces it once the file exists:

```ts
art: {
  image: '/art/tr/karagoz.png',   // transparent PNG in apps/web/public/art/<culture>/
  width: 1000, height: 1980,      // the box the image is drawn into (its aspect ratio)
  rod: [500, 520],                // where the rod holds it, in that box
  parts: [
    { id: 'body', polygon: [[0,0],[1000,0],[1000,1980],[0,1980]], pivot: [500,520], driver: 'lean', gain: 2 },
    { id: 'head', polygon: [...], parent: 'body', pivot: [520,525], driver: 'talk', gain: 4 },
    { id: 'arm',  polygon: [...], parent: 'body', pivot: [625,620], driver: 'arm', gain: -100 },
  ],
}
```

Polygons are regions of the image; a child's region is cut out of its parent's, so keep the
arm polygon a little generous around the joint. `docs/ART.md` has the generated Karagöz and
Hacivat files and where to put them.

## Adding a tradition (culture pack)

1. `packages/content/src/<id>/culture.ts`: id, names (tr/en), tradition, region, `lang`
   (must exist in `LANGS` in `packages/shared/src/play.ts`; add it there if new — the phone uses it
   for speech recognition), description and a **heritage** note (origin, UNESCO status, what we
   changed for children), `stage` look (`shadow-screen` | `booth` | `paper-screen`, colours,
   opacity, blur), and `defaultSeats` (which puppets p1..p4 get).
2. `puppets.ts` with at least two puppets, `plays/` with at least one play, `index.ts` that parses
   them into a `CulturePack`.
3. Register the pack in `packages/content/src/index.ts` (`packs` array). Order = lobby order.
4. Landing copy in `apps/web/src/pages/Landing.tsx` is generated from `cultures`; only the
   "coming next" list needs editing.
5. Premium: new traditions are `premium: true`; the Turkish pack stays free at its core.

### Respecting the traditions

- **Karagöz ve Hacivat (Türkiye).** UNESCO 2009. Anonymous folk texts; ours are adaptations, say
  so in `source`. Keep the Ottoman flavour of Hacivat's speech; it is the joke, not an obstacle.
- **Punch and Judy (England).** Descended from Pulcinella; the slapstick is the tradition, the
  violence is not for four-year-olds. Keep the crocodile, the sausages, the catchphrase.
- **Wayang Kulit (Indonesia).** Sacred in origin (Javanese/Balinese); UNESCO 2003. Use the
  clown-servants (Semar, Petruk, Gareng, Bagong) for comedy, treat the epic figures with care,
  keep the gunungan as the curtain. Ask someone from the tradition to read the first play.
- **Kasperle (Germany/Austria)**, **Guignol (Lyon)**, **Pulcinella (Naples)**: hand-puppet
  cousins of Punch; each has its own catchphrases and a policeman who arrives late.
- **Píyǐngxì (China).** UNESCO 2011. Articulated leather figures on a paper screen; the
  `paper-screen` look exists for it. Choose a folk tale, not an opera scene, for the first play.
- **Bunraku (Japan)** is three-person puppetry and does not map onto one phone per puppet; if
  ever, treat it as a stage look, not a control scheme.

Credit sources in `source`, keep names in their own spelling, and never make a tradition the
butt of another tradition's joke.
