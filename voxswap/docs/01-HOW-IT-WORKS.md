# How it works

Ten stages. Each one reads what the last one wrote, writes its own output to
disk, and records what it did in `work/<order>/state.json`. That is why a job
can be resumed, and why re-running never costs twice.

```
  intake ──→ index ──→ plan ──→ transcribe ──→ translate ──→ voice
                                                                │
   package ←── qc ←── master ←── synthesize ←───────────────────┘
      │
      └──→ delivery/<order>.zip
```

Two ordering decisions matter:

* **`plan` runs before `transcribe`.** We work out which clips belong to the
  character first, so we never pay to transcribe 40,000 lines of a cast we are
  not replacing.
* **`qc` runs before `package`.** A build that fails quality checks never
  becomes a deliverable, so there is nothing to accidentally email.

Everything paid for (`transcribe`, `translate`, `voice`, `synthesize`) happens
before everything free (`master`, `qc`, `package`). Re-mastering, re-checking
and re-packaging are always free.

---

## The stages

### 1. `intake` — validate, before spending anything

Checks consent (see [`04-CONSENT-AND-RIGHTS.md`](04-CONSENT-AND-RIGHTS.md)),
that `asset_root` exists and is not empty, that a promised script file is really
there, that the named providers exist, and that role IDs are unique.

Fails loudly and early. Everything it catches would otherwise have cost money.

### 2. `index` — find the audio

Walks `asset_root` applying the `include`/`exclude` globs from `order.json`,
and parses the script file if there is one (`.srt`, `.vtt`, `.csv`, `.json`).
Writes `work/<order>/assets.json`.

Nothing is decoded and nothing is transcribed. This stage exists so you can look
at what was found before anything happens to it.

### 3. `plan` — decide who says what

The stage that decides whether the job is right or wrong.

For each clip it works out a **speaker** (from the script's speaker column, or
from the folder name) and matches it against your `roles[]`:

* `match` — globs against the file path (`"vo/v_male/*.wav"`)
* `match_speakers` — matched against the speaker label (`"V"`, `"hero"`)

First role that matches wins, so order in `roles[]` is priority. A clip that
matches nothing is marked `skipped` and is never touched — that is how the rest
of the cast survives.

**Run `--only plan` and read the output before your first paid run on a title.**
It prints how many lines each role got. Wrong number there means a wrong
delivery later.

If the translation provider can also label emotions (Claude can), each line gets
a delivery hint here too: `angry`, `whisper`, `sad`, and so on.

### 4. `transcribe` — only what is missing

Lines the script already covered are skipped. Lines belonging to no role are
skipped. What is left gets sent to the ASR provider, in parallel, capped by
`options.max_parallel`.

On a game that shipped a dialogue table, this stage often does nothing at all.

### 5. `translate` — same length, same attitude

Skipped when source and target language match — the common case.

When it runs, it does dubbing translation, not document translation: meaning and
register preserved, spoken length matched to within about 10%, names and UI
terms untouched, nothing written that cannot be read aloud. Batched 40 lines at
a time, in file order, so neighbouring lines share context. Every batch is
checkpointed, so a crash never re-pays for finished ones.

### 6. `voice` — build the clone, once

Creates one clone per voice that an active role uses, and writes the provider's
ID back into `order.json` so later runs reuse it instead of creating duplicates —
and so `purge` can find it later.

Consent is re-checked here, even though `intake` already checked it: intake may
have run days ago, and the clone is created *now*.

### 7. `synthesize` — the expensive one

Every line, in the cloned voice, with its style and emotion hints, in parallel.

Takes that already exist on disk are not regenerated. Delete a single take from
`work/<order>/synth/` to redo exactly that one line. Failures are per line — one
bad line does not throw away the other four thousand.

Raw provider output lands in `synth/` untouched. All fixing happens next, so a
re-master never costs another synthesis call.

### 8. `master` — make it sit in the mix

Four things, in order:

1. **Trim** the dead air TTS leaves at both ends.
2. **Fit** the line to its slot: within tolerance → leave it; short → pad with
   silence (or slow it slightly if the gap is big); long → pitch-preserving
   compression up to `options.max_stretch`. If even that is not enough, the line
   is flagged as `overflow` and kept intact — **a line is never chopped
   mid-word to make a number work.**
3. **Match loudness** to the clip being replaced, not to a fixed target. Copying
   the original's loudness is always more convincing than hitting a spec value.
4. **Match format**: sample rate and channel count of the original file.

With ffmpeg, stretching uses `atempo` and loudness uses EBU R128 `loudnorm`.
Without it, a built-in overlap-add stretcher and a K-weighting estimate do the
same job slightly less well. Neither path is a stub.

### 9. `qc` — check our own work

Per line: did we produce a file, is it silent (a provider returning `200 OK` and
a second of nothing is a real and common failure), is it clipped, how far is it
from its slot.

Per job: what fraction of planned lines are usable. Below
`options.qc_min_pass_rate` (default 97%) the job **fails here and nothing is
packaged**. The report lands in `work/<order>/report/qc.md`.

### 10. `package` — what the customer receives

```
delivery/<order>/
    README.md        what this is, in plain language
    INSTALL.md       written for this specific engine
    WARNINGS.md      only when there is something they must know
    manifest.json    every file, its original, and both checksums
    script.csv       every line, as written and as spoken
    qc.md            the same report you read
    audio/           games: the replacements, in the game's own folder layout
    dub/             films: the full-length dub track + subtitles
```

`manifest.json` is what makes the whole thing reversible: the customer can
always prove what changed and restore it.

---

## Where things live while a job runs

```
orders/<order>/        the customer's stuff. Read-only, except provider IDs.
work/<order>/
    state.json         stage-by-stage progress — the resume point
    job.log            everything the stages printed
    lines.json         the line manifest, enriched stage by stage
    raw/               originals decoded to WAV (never the customer's files)
    synth/             raw takes, before any fitting
    master/            fitted, levelled, format-matched takes
    report/            qc.md and qc.json
delivery/<order>/      the finished package
delivery/<order>.zip   what you send
```

Deleting `work/<order>/` throws away nothing but time and money.
Deleting `orders/<order>/` throws away the customer's data.

## Resuming and redoing

```bash
python3 -m voxswap run ORD-123                     # continue from wherever it stopped
python3 -m voxswap run ORD-123 --from master       # redo mastering onward (free)
python3 -m voxswap run ORD-123 --only plan         # just re-check the matching
python3 -m voxswap run ORD-123 --force             # redo everything, including paid work
```

`--force` is the only one that can spend money twice. It exists for the case
where a provider silently changed its output and you need a clean rebuild.
