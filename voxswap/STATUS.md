# STATUS

> Living document. A new session should be able to resume from this file alone.
> Update it at the end of every working session.

## Current state

**v0.1.0 — complete, and now proven on real models.** Ten stages, seven provider
adapters, five target adapters, 181 tests green on Python 3.10/3.11/3.12, with
and without ffmpeg.

The headline changed since the last entry: **you do not need an API key or a
GPU.** Voice conversion (`local_vc`, FreeVC) ran a full order on a plain CPU at
roughly 1.5 s per line, with zero timing error, and it sounds better than the
cloning models it replaced because it keeps the original actor's performance
instead of rebuilding it from text.

Live and verified:

* the **recording booth** at `voxswap/web/booth.html`, published at
  <https://pabsamuel.github.io/boxdrank/voxswap/booth.html>
* **GAME-DEMO** — a small game voiced by one actor, rebuilt in a customer's
  voice, both casts in one playable page
* consent by **signed declaration** for a customer's own voice; the spoken
  phrase is still mandatory for anyone else's

## Next exact action

**Record yourself in the booth**, then run one real order on a game you own:

```bash
cd voxswap
python3 -m voxswap new ORD-001          # unzip the booth pack into it
python3 -m voxswap validate ORD-001     # paperwork + files, spends nothing
python3 -m voxswap run ORD-001 --only plan
python3 -m voxswap run ORD-001
```

With `"voice": "local_vc"` and the FreeVC server running, that costs nothing and
needs no account. `docs/11-RUNNING-LOCAL.md` has the install, including the four
ways it fails on a clean machine.

Write down what broke. That list is the v0.2 backlog.

## What works, verified

| Area | Status | Evidence |
| --- | --- | --- |
| Order model + validation | done | 18 tests in `tests/test_orders.py` |
| Consent gate + withdrawal | done | 12 tests in `tests/test_consent.py`, 4 purge tests |
| Script/subtitle parsing (srt, vtt, csv, json) | done | 10 tests in `tests/test_scripts.py` |
| Audio toolkit (WAV, timing, loudness, mixing) | done | 22 tests in `tests/test_audio.py` |
| Providers + registry | done | 12 tests in `tests/test_providers.py` |
| Game pipeline end to end | done | `tests/test_pipeline.py::GameJobTests`, and `EXAMPLE-GAME` |
| Film pipeline end to end | done | `tests/test_pipeline.py::MovieJobTests` |
| Resume / caching / locking | done | `ResumeTests` — asserts takes are never regenerated |
| Watcher (auto-start) | done | `WatcherTests` |
| ElevenLabs adapter | **unverified** | written against the documented API; no live call made |
| OpenAI ASR adapter | **unverified** | same |
| Claude translation adapter | **unverified** | same |
| `local_llm` translation (llama.cpp/Ollama) | done | 22 tests against a real in-process HTTP server |
| Local voice, server mode | done | 9 tests in `tests/test_local_voice.py` |
| `tools/local/tts_server.py` (resident server) | done | ran a real order end to end against a live model — see below |
| `engines/piper.py` | done | 4 tests, plus the `DEMO-LOCAL` run below |
| `local_vc` voice conversion + `engines/freevc.py` | done | 8 tests, and a real `DEMO-LOCAL` run — see below |
| `engines/xtts.py` | **unverified** | the server around it is now proven; the XTTS engine itself needs a machine that can fetch the model |
| `tools/local/whisper_cpp.py` | **unverified** | needs whisper.cpp built locally |

"Unverified" means the code is written and imports cleanly, but has never been
run against a live account. Expect small fixes — model IDs and response shapes
drift. All of them are env-overridable for exactly this reason.

## Test status

```
python3 -m unittest discover -s tests -t .
→ 181 tests, OK, ~45s, no network, no API keys

python3 tools/make_example.py && python3 -m voxswap run EXAMPLE-GAME
→ 10 stages, 0.4s, 4/4 lines at 100% QC, median slot error 0 ms
→ delivery/EXAMPLE-GAME.zip, manifest checksums verified against the files on disk
→ order assets unmodified; the 2 unmatched NPC clips stayed out of the package
```

### First run against a real model

An order (`DEMO-LOCAL`) whose audio is real speech rather than test tones: the
game's dialogue in one Piper voice, the customer in another, the consent phrase
actually spoken. Synthesised through the resident server, no network, no key.

```
6 lines synthesised in ~1s   (model loaded once, not per line)
consent gate passed on a real 16s spoken phrase
QC, first pass:  median slot error 353 ms, 5 of 6 outside tolerance
```

The overflow was real, not a bug: the replacement voice speaks more slowly than
the one it replaces, so every line ran long. Nothing was cut — QC named each
line and the amount. Raising `options.max_stretch` to 1.35 and re-running from
`master` brought it to **104 ms median, 1 of 6 outstanding**, reusing every take
rather than re-synthesising.

Piper cannot clone, so this proves the local *path* end to end, not the cloning
model. That still needs XTTS on a machine that can fetch it.

### Then a real cloning model, then conversion

`YourTTS` (zero-shot cloning, weights on GitHub rather than Hugging Face) ran
the same order through the same engine: 6 lines in 9 s on CPU, 24 ms median slot
error. It clones, but it is audibly robotic — it regenerates the line from text,
so the original performance is gone.

`FreeVC` conversion (`"voice": "local_vc"`) replaced it and is the current
recommendation:

```
6 lines in 9s on CPU, median slot error 0 ms, 0 outside tolerance
timing drift before mastering: -6 to -24 ms (frame rounding only)
clipping: 1-3 isolated samples, no runs
```

Conversion keeps the original actor's delivery and changes only the speaker, so
nothing about the performance has to be invented. The cost is that it cannot
change the words: intake refuses a conversion provider on a translated order
rather than shipping audio that contradicts `script.csv`.

Both halves are covered. The main suite pins a non-existent ffmpeg binary, so it
always exercises the stdlib fallbacks; `tests/test_ffmpeg_paths.py` (12 tests)
covers the ffmpeg branches — decode/encode round-trip, `atempo`, `loudnorm`, the
streamed and ducked film bed, muxing, and a full film run with a real video —
and skips cleanly where ffmpeg is absent. CI runs the whole matrix both ways on
3.10/3.11/3.12.

## Known gaps

* The live-API adapters have still never run against a real account (see the
  table above). Everything else is covered.
* Packed-audio titles (Wwise `.bnk`, FMOD `.bank`, Unreal `.pak`) are
  deliberately not opened — we deliver import-ready audio plus instructions.
* No web intake form; orders are folders an operator creates.
* No billing, no customer portal, no queue beyond the folder watcher.
* Emotion labelling only happens when the translation provider supports it
  (`claude`). Heuristics fill in otherwise.

## Phase log

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Project shape, docs, consent design | done |
| 1 | Core: models, state, workspace, CLI, pipeline runner | done |
| 2 | Audio toolkit: WAV, time-fitting, loudness, streaming mixdown | done |
| 3 | Ten stages, game + film paths | done |
| 4 | Providers (mock/ElevenLabs/OpenAI/Claude/local), targets | done |
| 5 | Tests, demo order, docs, prompt library | done |
| 5b | ffmpeg path coverage; fixed 3 defects it found (see DECISIONS #17) | done |
| 5c | Local-model path: `local_llm` provider, resident TTS server, keyless local ASR, whisper.cpp wrapper, `docs/11-RUNNING-LOCAL.md` | done |
| 5d | Audit trail records creation (`CLEARED`/`CLONED`), not only deletion; `purge` declines cleanly with no terminal | done |
| 6 | First real order with a live provider | **next** |
| 7 | Second title, second engine — prove the target adapters | not started |
| 8 | Local model path, for cost and privacy | not started |
