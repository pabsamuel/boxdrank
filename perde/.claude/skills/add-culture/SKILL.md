---
name: add-culture
description: Add a whole puppet tradition as a content pack (culture definition, puppets, first play, stage look, heritage note). Use when asked for Wayang Kulit, Kasperle, Guignol, Píyǐngxì, Pulcinella or any other tradition.
---

# /add-culture <id> <tradition>

Read "Adding a tradition" and "Respecting the traditions" in `docs/CONTENT_GUIDE.md`. Then, as
one slice:

1. Research the tradition briefly (stock characters, catchphrases, the opening ritual, the
   look of the screen or booth, UNESCO status). Write the `heritage` note honestly, including what
   we simplify for children.
2. If the language is new, add it to `LANGS` in `packages/shared/src/play.ts` and make sure the
   Web Speech API supports it (BCP‑47 code).
3. Create `packages/content/src/<id>/culture.ts`, `puppets.ts` (≥ 2 puppets, `/add-puppet`
   rules), `plays/<first>.ts` (`/add-play` rules), `index.ts` (parse into a `CulturePack`).
4. Register in `packages/content/src/index.ts`. New traditions are `premium: true`.
5. Add UI strings only if a new label is needed (`packages/shared/src/i18n.ts`, tr + en).
6. Update the "coming next" list in `apps/web/src/pages/Landing.tsx` (remove the tradition you
   just added) and the pricing table in `docs/PRICING.md`.
7. `pnpm verify`, `pnpm build && pnpm dev:relay`, `/stage?demo=1&culture=<id>` screenshot, adjust
   the `stage` look until the puppets read well.
8. Roadmap tick (M5), `pnpm metrics`, commit: "Add tradition: <Name>".
