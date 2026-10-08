# 0011 — Wayang Kulit is the first tradition after Karagöz on a shadow screen

## Context

The roadmap lists five traditions. Wayang kulit is the natural first: it is a shadow play on a
lit cloth with rod-held leather figures, so the stage, the rods, the göstermelik mechanism and
the raster-rig pipeline all carry over unchanged. The hard parts are cultural, not technical.

## Decision

1. **A short lakon, not an epic.** "Cincin Rama" tells one Ramayana episode (Anoman Duta) in 21
   lines for children, opened and closed by Semar and Petruk; there is no battle. The language
   is Indonesian (`id-ID`), which the Web Speech API supports; the dalang's Javanese would not be
   recognised on a phone and is not what a family in Jakarta speaks at home.
2. **Four figures, painted in the tatah sungging style.** Semar, Petruk (clown-servants, comedy),
   Rama (alus hero), Hanoman (white monkey, drops in like Karagöz). Rigs are raster: a complete
   body, the front arm as a layer pinned at the shoulder, head, two legs. Wayang arms are two
   jointed pieces on a real figure; we drive the whole front arm from the shoulder, which reads
   right at TV size.
3. **The gunungan is the showpiece.** It hangs before the play and is lifted at the first rod,
   exactly like the Karagöz göstermelik; the stage code needed nothing new for it.
4. **No painted scenery.** A kelir is a plain white cloth; `backdrop_scene: 'none'`, warmer
   cloth colours, slightly higher puppet opacity for the perforated leather.
5. **Premium, and honest about it.** The pack is `premium: true` like every tradition after the
   Turkish core, and the heritage note says plainly that the origin is sacred, that we simplify,
   and that we want someone from the tradition to read the first play.

## Consequences

- `docs/ART.md` lists the media ids and export-sheet pages; `scripts/art-tiles.mjs` knows the
  five pieces and takes `ART_ONLY` to work on a subset.
- The demo (`/stage?demo=1&culture=id`) starts the pack's first play; demo poses now talk when
  it is the seat's line rather than when a hard-coded character speaks.
- Next traditions (Kasperle, Guignol, Pulcinella) are booths, not screens, and share the Punch
  look; Píyǐngxì gets the `paper-screen` look.
