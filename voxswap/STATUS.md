# STATUS

> Living document. A new session should be able to resume from this file alone.
> Update it at the end of every working session.

## Current state

**v0.1.0 — the pipeline is complete and runs end to end offline.** Ten stages,
five provider adapters, five target adapters, 100 tests green. No real provider
has been exercised against a real account yet — that is the next milestone and
it needs an API key, which only the owner can supply.

## Next exact action

1. Put an `ELEVENLABS_API_KEY` (or configure a local model) in `voxswap/.env`.
2. Run one real order **on your own voice, on a game you own**, start to finish:
   `new` → `phrase` → `validate` → `run --only plan` → `dry_run_limit: 5` → full run.
3. Write down what broke. That list is the v0.2 backlog.

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
| Local (XTTS/whisper.cpp) adapter | **unverified** | needs a machine with a model installed |

"Unverified" means the code is written and imports cleanly, but has never been
run against a live account. Expect small fixes — model IDs and response shapes
drift. All of them are env-overridable for exactly this reason.

## Test status

```
python3 -m unittest discover -s tests -t .
→ 100 tests, OK, ~13s, no network, no API keys
```

Run on this machine without ffmpeg, which means the stdlib fallback paths are
the ones under test. **Re-run the suite on a machine with ffmpeg too** — the
ffmpeg branches (format conversion, `atempo`, `loudnorm`, film muxing) are not
currently covered.

## Known gaps

* No ffmpeg on the dev machine, so ffmpeg code paths are untested (see above).
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
| 6 | First real order with a live provider | **next** |
| 7 | Second title, second engine — prove the target adapters | not started |
| 8 | Local model path, for cost and privacy | not started |
