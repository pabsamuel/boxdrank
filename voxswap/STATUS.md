# STATUS

> Living document. A new session should be able to resume from this file alone.
> Update it at the end of every working session.

## Current state

**v0.1.0 — the pipeline is complete and runs end to end offline.** Ten stages,
six provider adapters, five target adapters, 157 tests green on Python
3.10/3.11/3.12, with and without ffmpeg. **It can run fully offline** —
transcription, translation and voice cloning all have a local path. No real *provider* has been exercised
against a real account yet — that is the next milestone and it needs an API key,
which only the owner can supply.

## Next exact action

Run one real order **on your own voice, on a game you own**, start to finish:
`new` → `phrase` → `validate` → `run --only plan` → `dry_run_limit: 5` → full run.

Two routes, pick one:

* **Hosted** — put an `ELEVENLABS_API_KEY` in `voxswap/.env` and go. Fastest to
  a first result.
* **Local** — follow `docs/11-RUNNING-LOCAL.md`. Free per order, needs a GPU and
  an afternoon. Start with ASR (whisper.cpp server, no key, no downside), then
  translation, then the voice.

Either way: write down what broke. That list is the v0.2 backlog.

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
| `tools/local/tts_server.py` + XTTS engine | **unverified** | the server is exercised by its protocol tests; the XTTS engine itself needs a machine with the model installed |
| `tools/local/whisper_cpp.py` | **unverified** | needs whisper.cpp built locally |

"Unverified" means the code is written and imports cleanly, but has never been
run against a live account. Expect small fixes — model IDs and response shapes
drift. All of them are env-overridable for exactly this reason.

## Test status

```
python3 -m unittest discover -s tests -t .
→ 157 tests, OK, ~45s, no network, no API keys
```

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
| 6 | First real order with a live provider | **next** |
| 7 | Second title, second engine — prove the target adapters | not started |
| 8 | Local model path, for cost and privacy | not started |
