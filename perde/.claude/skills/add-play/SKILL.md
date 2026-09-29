---
name: add-play
description: Write and register a new play (script) for a culture pack, kid-friendly and speech-recognition-friendly. Use when asked to add, adapt or translate a play.
---

# /add-play <culture> <title>

Read `docs/CONTENT_GUIDE.md` first. Then:

1. Pick the traditional source (for Karagöz: a classical fasıl such as Kanlı Kavak, Yalova Safası,
   Ters Evlenme, Ağalık, Kayık, Salıncak…). Note it in `source` as an original adaptation.
2. Write `packages/content/src/<culture>/plays/<id>.ts` exporting a `PlayInput`:
   - `id` kebab-case ASCII, `cultureId`, `lang` from the culture, `title`, `subtitle`, `summary`
     (one sentence a parent reads on the phone), `ageRange`, `durationMin` ≈ lines × 7 s,
     `premium` (true unless it is the culture's free show), `characters` (seat = character id,
     `puppetId` must exist in the pack), `sections`.
   - Karagöz: Mukaddime → Muhavere → Fasıl sections → Bitiş with the closing formulas.
   - Lines ≤ 14 words, spoken text only; stage directions in `hint`; `gesture` on the beat;
     `song: true` for sung lines. 25–40 lines is a good length.
   - Comedy = misunderstandings and wordplay; no hitting, no fear.
3. Register it in `packages/content/src/<culture>/index.ts`.
4. `pnpm validate:content && pnpm test` — fix every warning about long lines.
5. If the play introduces a character with no puppet, run `/add-puppet` first.
6. Tick/add the roadmap box, `pnpm metrics`, commit as one slice: "Add play: <Title> (<culture>)".
7. Optional: `pnpm build && pnpm dev:relay`, open `/stage?demo=1` to watch the opening; the demo
   runs `giris`, so for other plays start them from a phone or the keyboard.
