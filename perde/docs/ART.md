# Artwork

Perde's stage draws vector rigs by default and switches to painted artwork the moment the image
file exists (`art` on a puppet, see `CONTENT_GUIDE.md`). The Turkish pack already declares
artwork for Karagöz and Hacivat; the files are not in the repository yet.

## Generated tasvir artwork (Canva)

Made with Canva's image generator in the traditional painted-leather style, background removed.
Previews (100 px) are in `docs/art/`; the full images are in the owner's Canva account:

| figure                  | Canva media                         | file expected at                                 |
| ----------------------- | ----------------------------------- | ------------------------------------------------ |
| Karagöz (cut-out)       | https://www.canva.com/M/MAHWo1QILio | `apps/web/public/art/tr/karagoz.png`             |
| Hacivat (cut-out)       | https://www.canva.com/M/MAHWoxUTikw | `apps/web/public/art/tr/hacivat.png`             |
| Ottoman street backdrop | https://www.canva.com/M/MAHWouzoZTg | `apps/web/public/art/tr/backdrop.jpg` (optional) |

Both figures are tall 1:2 images; the `art` blocks assume a 1000 × 1980 box and stretch to it
(`preserveAspectRatio="none"`), so any resolution with that ratio works. Aim for ~1000 px wide
PNGs with transparency (≈300–600 kB each).

## Getting the files into the repository

The build sandbox cannot reach canva.com, so a person downloads them once:

1. Open each Canva link, **Download** as PNG (transparent) / JPG.
2. Put the files at the paths above (or upload them to a Google Drive folder named `Perde art`
   and tell Claude; it can fetch from Drive and commit).
3. `pnpm build && pnpm dev:relay`, open `/stage?demo=1`: the painted figures replace the vector
   ones. If an arm or head cuts wrong, adjust the polygons in `packages/content/src/tr/puppets.ts`.

Prompt for Claude in Chrome:

```
Open https://www.canva.com/M/MAHWo1QILio and download the image as a PNG with transparent
background; do the same for https://www.canva.com/M/MAHWoxUTikw. Then open
https://www.canva.com/M/MAHWouzoZTg and download it as JPG. Tell me the file names in Downloads.
```

## Making more

Use `/add-puppet` for the rig and, for painted art, the same Canva prompt pattern: "Traditional
Turkish <character> shadow puppet (tasvir), authentic Ottoman hayal perdesi style, translucent
painted camel leather, bold black ink outlines, ... full body, side profile facing right, plain
white background, no text". Remove the background, download, add an `art` block.
