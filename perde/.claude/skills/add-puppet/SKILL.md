---
name: add-puppet
description: Author a new puppet rig (SVG parts with pivots and drivers) for a culture pack and check it on the stage. Use when a play needs a character that has no figure yet.
---

# /add-puppet <culture> <name>

Read the "Adding a puppet" section of `docs/CONTENT_GUIDE.md`. Then:

1. Look at the existing rigs in `packages/content/src/<culture>/puppets.ts` and reuse the palette
   constants and `feet()` helper where they exist.
2. Author in a 200×400 box facing right using `shapes.ts` helpers. Required parts:
   `body` (root, pivot [100,400], driver lean), `head` (driver talk, pivot at the neck),
   `arm` (driver arm, negative gain, pivot at the shoulder, hand as a child), headgear with
   driver bob. Give the figure one unmistakable silhouette feature (Karagöz's hat, Hacivat's
   kavuk, Tuzsuz's sword).
3. Set `color` (used on the karaoke bar), `description` (one sentence with character), `premium`.
4. Export it in the pack's `puppets` array; add it to `defaultSeats` only if it should be one of
   the four default seats.
5. `pnpm validate:content && pnpm test` (the content test checks parent ordering and drivers).
6. Look at it: `pnpm build && pnpm dev:relay`, then a Playwright screenshot of
   `/stage?demo=1&culture=<culture>` after setting the puppet via the stage machine, or simply
   `pnpm screenshots` and open the PNGs. Fix proportions until it reads at 1/8 of the screen width.
7. Roadmap tick, `pnpm metrics`, commit: "Add puppet: <Name> (<culture>)".
