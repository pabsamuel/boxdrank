# Roadmap

Tick things off as you go. Each phase is shippable on its own — do not start the
next one until the current one has actually been used on a real order.

---

## Phase 6 — your first real order *(next)*

The goal is not features. It is proving the whole chain works with real money
and a real voice.

- [ ] Choose a voice provider and put the key in `voxswap/.env` (`docs/05-PROVIDERS.md`)
- [ ] Install ffmpeg on the machine you will actually work on
- [ ] Record 2–5 minutes of your own voice, properly (quiet room, varied delivery)
- [ ] Pick a small game you own with loose `.wav` or `.ogg` voice files
- [ ] Do the full workflow on yourself: `new` → `phrase` → `validate` →
      `run --only plan` → `dry_run_limit: 5` → full run
- [ ] Install the result in the actual game and play it
- [ ] Write down everything that was confusing, wrong or missing
- [ ] Update `STATUS.md` and turn that list into Phase 7

## Phase 7 — prove the second title

One title working is luck. Two is a product.

- [ ] A second game on a different engine (Unity or Unreal)
- [ ] One film, end to end, with subtitles and a muxed `.mkv`
- [ ] One order in a language you do not speak, checked by someone who does
- [ ] Fix the target adapter's `INSTALL.md` based on what actually happened
- [ ] Record your real per-order costs and time, and set your prices from them

## Phase 8 — the local model path

The code side is done: a `local_llm` translation provider for any
OpenAI-compatible server, a resident TTS server so models load once, a
whisper.cpp wrapper, and keyless local ASR through the `openai` adapter. Guide:
[`docs/11-RUNNING-LOCAL.md`](docs/11-RUNNING-LOCAL.md).

What is left is yours, and needs hardware:

- [ ] Point `asr` at a local whisper.cpp server — free, as good as hosted, do this first
- [ ] Run a GGUF instruct model (14B+) and switch `translation` to `local_llm`
- [ ] Get XTTS-v2 running behind `tools/local/tts_server.py`
- [ ] Run the **same order** hosted and local, and listen to five lines of each
      back to back before switching a customer
- [ ] Have a native speaker compare ten translated lines from each
- [ ] Add "your voice never leaves our machine" to your sales page — and mean it

## Phase 9 — less operator time per order

Only worth doing once orders are regular. Every item here buys back minutes of
*your* attention.

- [ ] A web intake form that writes an order folder, so you stop doing it by hand
- [ ] Automatic consent-phrase email + a reminder when it has not arrived in 3 days
- [ ] A per-title "recipe" file, so a repeat title needs no pattern work
- [ ] A one-page HTML preview of a finished job (waveforms + play buttons) so QC
      is listening, not file-browsing
- [ ] Archive finished orders automatically at the end of your retention period

## Phase 10 — scale, if you want it

- [ ] Several jobs in parallel, rather than one folder watcher
- [ ] A queue with priorities so a paid rush job jumps a free taster
- [ ] Per-order cost tracking written into `state.json`, so margin is measured
- [ ] Assisted-install tooling for Wwise/FMOD titles, as a paid add-on
- [ ] Public status page / order tracker for customers

---

## Deliberately not planned

These are "no" until something changes, and the reasons matter:

* **Opening Wwise/FMOD/Unreal archives ourselves.** The tooling is
  title-specific and fragile. Delivering import-ready audio plus honest
  instructions is more robust than half-working extraction.
* **Removing the original actor from a film mix.** Not possible from a stereo
  retail mix. Do not promise it.
* **A "skip consent" mode for testing.** Use the `mock` providers — they need no
  consent because they clone nothing. There must be no path in this codebase
  that generates a real voice without a real consent record.
* **Training a shared model on customer voices.** A completely different
  consent conversation. Do not drift into it by accident.
