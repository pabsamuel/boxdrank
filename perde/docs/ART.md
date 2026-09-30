# Artwork

Perde's stage draws vector rigs by default and switches to painted artwork the moment the image
file exists (`art` on a puppet, see `CONTENT_GUIDE.md`). The Turkish pack's Karagöz and Hacivat
are painted; the files live in `apps/web/public/art/tr/`:

| file               | what                                            |
| ------------------ | ----------------------------------------------- |
| `karagoz.webp`     | body, 896 × 1776, coat painted in under the arm |
| `karagoz-arm.webp` | the arm alone, same box, drawn as a layer       |
| `hacivat.webp`     | body                                            |
| `hacivat-arm.webp` | arm layer                                       |

Rigs (`packages/content/src/tr/puppets.ts`, `art:` blocks) use a 1000 × 1980 box; the images are
stretched to it (`preserveAspectRatio="none"`), so any resolution with that ratio works.

## Source

Generated with Canva's image generator in the traditional painted-leather style, background
removed, then placed on the export sheet design **`DAHWpy4YgoE`** ("Perde tasvir export sheet")
in the owner's Canva account:

| page | content                                         |
| ---- | ----------------------------------------------- |
| 1–3  | Karagöz, Hacivat, Ottoman street backdrop, full |
| 7–24 | 600 × 600 windows of the three images (tiles)   |

Media ids: Karagöz `MAHWo1QILio`, Hacivat `MAHWoxUTikw`, backdrop `MAHWouzoZTg`.

## Getting pixels out of Canva from a session

Claude's cloud environments cannot reach `canva.com` or `export-download.canva.com` (network
policy), so `export-design` URLs cannot be downloaded from a session. What does come through is
the Canva connector's inline page thumbnail, capped at 600 px on the long side and rendered 1:1
when the page is 600 px. Hence the tiles:

1. Each tile page is 600 × 600 with the image inserted at native size and offset so the page
   shows one window (`insert_fill` with negative `left`/`top`). Windows for a 896 × 1776 figure:
   columns 0, 296; rows 0, 600, 1176. For the 1680 × 944 backdrop: columns 0, 600, 1080; rows 0, 344.
2. `read-design` with `thumbnail_pages` returns the renders inline; save them as
   `<prefix>-<x>-<y>.png` (`k-`, `h-`, `b-`).
3. `node scripts/art-tiles.mjs stitch <tilesDir> <workDir>` joins them and keys out the page
   white (flood fill from the border, so white inside a figure survives).
4. `node scripts/art-tiles.mjs grid <workDir> <gridDir>` draws a coordinate grid to read polygons
   off; `node scripts/art-tiles.mjs parts <workDir> apps/web/public/art/tr` writes the body and
   arm layers as WebP.

If the environment's network policy ever allows `*.canva.com`, `export-design` (PNG, transparent
background, lossless) gives the same pixels in one file; run steps 3–4 on it unchanged.

## Making more

Use `/add-puppet` for the rig and, for painted art, the same Canva prompt pattern: "Traditional
Turkish <character> shadow puppet (tasvir), authentic Ottoman hayal perdesi style, translucent
painted camel leather, bold black ink outlines, ... full body, side profile facing right, plain
white background, no text". Remove the background, add the image to the export sheet, tile it as
above, add an `art` block with a separate arm layer.
