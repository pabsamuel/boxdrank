# Perde — working notes for Claude Code

Perde is a shadow-puppet theatre for the living room: a TV shows the stage, phones are the puppet
rods, and the script runs karaoke-style with speech recognition. Turkish Karagöz & Hacivat first,
other traditions as content packs. Read `docs/VISION.md` once; everything below is operational.

## Ground rules (these are the owner's decisions, not suggestions)

- **Build, don't gate.** No "validate demand", "get stakeholder approval", "survey users" steps.
  Nobody is waiting to approve anything. If a thing is on the roadmap, build it to done.
- **No deadlines.** Progress is measured, not scheduled. `docs/ROADMAP.md` has milestones with
  checkboxes; `pnpm metrics` turns them into `docs/PROGRESS.md`. Never add dates or estimates.
- **Definition of done** for any change: typecheck + lint + unit tests + build pass (`pnpm verify`),
  e2e passes when the change touches the web app or relay, docs/roadmap checkbox updated,
  `pnpm metrics` run if the numbers moved.
- **Ship whole slices.** A play without a puppet, or a UI without its state-machine test, is not
  a slice. Finish the vertical.
- **Content is data.** Adding a play, puppet or culture never requires touching app code. If it
  does, fix the app so it doesn't.
- **Kids first.** Lines ≤ 14 words, no violence, no scary endings. Respect the traditions
  (`docs/CONTENT_GUIDE.md` has the notes per culture).

## Commands

```bash
pnpm install
pnpm verify            # typecheck + lint + test + build — run before every commit
pnpm test              # vitest (packages/*, apps/*)
pnpm e2e               # playwright vs wrangler dev; needs `pnpm build` first
pnpm dev:relay         # workerd on :8787 serving apps/web/dist + /api
pnpm dev:web           # vite on :5173 with /api proxied to :8787
pnpm validate:content  # editorial lint for plays/puppets
pnpm metrics           # regenerate docs/PROGRESS.md
pnpm screenshots       # docs/screenshots/*.png from a running relay
pnpm deploy            # wrangler deploy (docs/DEPLOY.md)
```

In sandboxes without a downloadable browser: `PERDE_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e`.
Reuse a running relay for e2e with `PERDE_E2E_PORT=8787`.

## Map

- `packages/shared/src/protocol.ts` — every message on the wire (zod). Change here first, then
  relay, then web. Seats are player slots `p1..p4`; characters are per play.
- `packages/shared/src/matcher.ts` — fuzzy line matching (Turkish-aware). Thresholds live here.
- `packages/shared/src/room-core.ts` — pure relay routing; the Durable Object is a thin adapter.
- `packages/content/src/<culture>/` — `culture.ts`, `puppets.ts`, `plays/*.ts`, `index.ts`.
  Register new packs in `packages/content/src/index.ts`.
- `apps/web/src/lib/stage-machine.ts` — the whole game logic as a pure reducer. Test it there.
- `apps/web/src/pages/Stage.tsx` (TV) · `Join.tsx` (phone) · `Landing.tsx`.
- `apps/web/src/components/PuppetSvg.tsx` — how a puppet rig becomes SVG (vector paths or
  clipped image regions); drivers: arm, lean, talk, bob, stride. `Backdrop.tsx` is the scenery.
- `apps/web/src/pages/Draw.tsx` + `lib/cutout.ts` + `packages/shared/src/rig.ts` — draw your own:
  paper removal, joint guessing, basic rig. `docs/ART.md` for painted artwork files.
- `apps/relay/src/index.ts` — Worker routes + `Room` Durable Object (WebSocket hibernation).
- `apps/relay/src/entitlements.ts` — free vs Plus; Lemon Squeezy licence keys.

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`; no `any`. Prettier decides formatting.
- Tests next to code: `*.test.ts`. Pure logic gets unit tests; UI gets e2e.
- UI strings go through `packages/shared/src/i18n.ts` (tr + en). Content carries its own language.
- Commit messages: imperative, say why. Keep model names out of code, docs and PR text; commit trailers are whatever the tooling adds.
- Don't add dependencies for things a page of code can do.

## Skills (type `/name`)

`/status` progress + what's next · `/add-play` · `/add-puppet` · `/add-culture` · `/playtest`
manual test protocol on real devices · `/ship` verify → commit → PR · `/steward` PR posture.

## When something is unclear

Pick the option that gets a family playing sooner, write the decision in `docs/decisions/`, move on.
