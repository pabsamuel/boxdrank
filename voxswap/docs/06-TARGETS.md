# Targets: games and films

`target.adapter` decides how lines are found, how the delivery is laid out, and
what install instructions the customer receives. Picking the right one is the
difference between "drop this folder in" and "I don't know what to do with this".

---

## `generic` — loose audio files

The default, and the best case. The game keeps its voice lines as ordinary files
on disk (`.wav`, `.ogg`, `.mp3`).

* **Discovery:** your `include`/`exclude` globs.
* **Delivery:** `audio/` mirroring the original folder structure exactly.
* **Customer's job:** back up, copy over, launch.

## `unreal` — Unreal Engine

Audio usually lives inside `.pak` / `.utoc` / `.ucas` archives. The customer
extracts first (FModel, umodel, repak), you work on what comes out.

* **Speaker guess:** from `Content/Audio/VO/<Character>/...` folder names.
* **Delivery:** `mod` layout nests under `Content/Mods/VoxSwap`.
* **Customer's job:** either loose files (if the title allows it) or repack into
  `pakchunk999-VoxSwap_P.pak` in `Content/Paks/~mods/`. The generated
  `INSTALL.md` walks through both.

## `unity` — Unity

Two very different cases, and the generated `INSTALL.md` covers both:

* **`StreamingAssets`** — loose files. Easy: copy in, done.
* **Asset bundles / `resources.assets`** — needs AssetRipper or UABEA to import
  each clip back, keeping the clip name identical.

FMOD (`.bank`) titles behave like Wwise below.

## `wwise` — Wwise titles (`.bnk` / `.wem`)

Common in big-budget games. The audio is not in plain files, and no open tool
safely rewrites a bank.

VoxSwap is honest about this rather than pretending: it delivers finished,
correctly-timed WAVs plus a mapping in `manifest.json`, and the customer (or
you, as a paid "assisted install") converts to `.wem` with the Wwise authoring
tool and injects with the title's modding toolkit.

**Price this differently.** The audio work is the same; the install is not.

## `video` — films and series

The customer supplies the video file and a subtitle file. The subtitles are the
script: they carry the lines *and* the exact timings.

* `target.script_file` is **required** — without it there is no timeline.
* Roles are matched on subtitle speaker labels (`HERO: Get down!`) so ask for
  subtitles with speaker names when possible, or edit them in.
* **Delivery:**
  * `dub/<name>.dub.wav` — a full-length track aligned to the original runtime
  * `dub/<name>.dub.srt` — subtitles matching the new dialogue
  * `lines/` — every individual take, for review or re-use
  * `<name>.voxswap.mkv` — the film with the dub as a second audio track
    (only when you have ffmpeg)

### How the film mix actually works

A retail film ships one mixed track: dialogue, music and effects are already
baked together. There is no way to remove only the original actor.

So the dub is laid **over** the original with the original ducked underneath
during each line, fading in and out so the drop is not audible as a click. In
loud scenes you may faintly hear the original voice. A perfectly clean result
would need a music-and-effects (M&E) track, which retail releases do not
include. `WARNINGS.md` tells the customer this, in those words.

The mix is built in a streaming pass — the film's audio is decoded block by
block, ducked, mixed and written straight out — so a two-hour film does not need
1.4 GB of RAM.

**Without ffmpeg there is nothing to stream from**, so you get a dialogue-only
track and the delivery says so. For film work, install ffmpeg.

---

## Choosing `include` patterns

This is where time is lost. Look at `work/<order>/assets.json` after `index` —
it lists every path that matched, with a count by extension.

| Situation | Pattern |
| --- | --- |
| All dialogue under one folder | `["vo/**/*.wav"]` |
| One character, known folder | `["vo/v_male/**/*"]` |
| Everything except music and effects | `["**/*.wav"]` + `exclude: ["**/music/**", "**/sfx/**", "**/amb/**"]` |
| One film | `["*.mkv"]` |

Then confirm with `--only plan`, which prints the line count per role. That
number is the one that matters.
