# The quality bar

It runs, it produced files, and it still sounds wrong. This page is the fix
list, roughly in the order that problems actually occur.

Almost every fix here is a **free re-run** (`--from master`) because all the
expensive work is cached.

---

## What "good" sounds like

A customer should hear *their own voice in the game*, not *a mod*. Concretely:

* the line starts and ends where the original did (±250 ms)
* it sits at the same loudness as everything around it
* nothing is rushed or slurred by time-compression
* the read matches the scene — shouting is shouted
* the cadence is theirs, not a newsreader's

## The clone does not sound like them

**Almost always the samples, not the provider.** In order of impact:

| Problem | Fix |
| --- | --- |
| Too little audio | 90 seconds minimum, 2–5 minutes is where it gets good. `validate` warns you below 30s. |
| One flat monotone take | Ask for variety: normal, a question, excited, quiet. A clone can only do what it heard. |
| Background noise, music, echo | Re-record. Denoised audio clones worse than clean quiet audio. |
| Phone speaker / gaming headset mic | Any USB mic, or a phone's own voice-memo app held 15 cm away, beats a headset boom. |
| Multiple people audible | Cut those parts out. A clone of two people is a clone of neither. |
| Heavy compression (voice notes, Discord) | Ask for WAV/FLAC, or the original file rather than a re-send. |

Ask for a re-record early. It is free, it takes them ten minutes, and it fixes
more than any option in this file.

## Lines are too long / overflow their slots

QC reports them as `timing`, and `master` logs them as `overflow`.

1. **Translated orders:** the target language is simply longer. Raise
   `options.max_stretch` to `1.2`, rarely `1.25`. Past that it sounds rushed.
2. **Shorten the words, not the audio.** Edit the line in
   `work/<order>/lines.json` (`translated_text`) and re-run `--from synthesize`
   for that order. A shorter sentence beats a compressed one every time.
3. **Check the slot is real.** If `source_duration_ms` is 0, the original could
   not be probed — install ffmpeg so slots are known.
4. **Decide it does not matter.** For barks and ambient lines, nobody notices.
   Raise `qc_max_duration_delta_ms` for that order and move on.

A line is never cut mid-word to hit a number. Overflow is reported, not hidden.

## Lines sound too quiet or too loud

Mastering matches the loudness of the clip being replaced, which is almost
always right. When it is not:

* **Games:** `options.target_lufs` around `-18.0` (the fallback when there is no
  reference).
* **Films:** try `-23.0`; broadcast mixes are quieter than game dialogue.
* **Clipping** in QC: lower `target_lufs`. Normalisation already backs off to
  avoid clipping, so this means the source was hot to begin with.

## A line came back silent

QC catches it (`silent`) and fails the line rather than shipping a gap. Causes:

* the provider returned `200 OK` and nothing — delete that one take from
  `work/<order>/synth/` and re-run `--from synthesize`
* the text was empty or punctuation-only — fix it in `lines.json`
* the provider rejected the text content — check `job.log` for the response

## The wrong character got replaced

Stop and re-check `--only plan` output. Then:

* tighten `roles[].match` to the character's own folder
* prefer `match_speakers` when you have a script with speaker labels
* remember first-match-wins: put specific roles above general ones
* look at `work/<order>/assets.json` for the paths you are actually matching

Then `--from plan`. Nothing downstream is reused, but nothing is wasted either —
you have not paid for the wrong lines yet if you checked at `plan`.

## The performance is flat

* `emotion_transfer: true` and a translation provider that labels emotions
  (`claude`) gives the voice provider per-line delivery hints.
* Set `roles[].style` — `neutral` for narration, but try a different style for a
  character who is always shouting.
* Provider-specific: ElevenLabs stability is lowered automatically for angry and
  excited lines; tune `_voice_settings` in the adapter if a customer's voice
  needs it.
* Some flatness is the samples. See the first section.

## The film dub is audible over the original

Expected, to a degree — see [`06-TARGETS.md`](06-TARGETS.md). Options: raise the
dub's level (`target_lufs`), or accept it. It cannot be fully removed without an
M&E track.

## Timing drifts over a long film

The dub is placed at subtitle timestamps, so drift means the subtitles are
drifting. Ask for a subtitle file that matches their exact release, or shift it
with any subtitle tool before running.

---

## Before you send anything

- [ ] `qc.md` pass rate is 100%, or you know exactly which lines are not and why
- [ ] You listened to four lines: first, longest, loudest, and a flagged one
- [ ] You skimmed `script.csv` — names, numbers and UI terms are right
- [ ] `WARNINGS.md` says nothing you should have told them yourself first
- [ ] For a translated order: a native speaker read ten lines, if you are not one

That last one is the cheapest quality insurance in this business.
