# CLAUDE.md — rules for AI-assisted work in `voxswap/`

Read `STATUS.md` first and resume from "Next exact action". Keep it updated and
short.

## Hard rules — never break these

1. **The consent gate is not negotiable.** Never add a flag, env var, option or
   code path that skips or weakens any check in `voxswap/consent.py`. If a check
   is wrong for a real order, the order's paperwork gets fixed, not the check.
   Every provider must implement `delete_voice` — withdrawal has to actually work.
2. **Never log, print or write an API key**, and never write one into an order
   folder, a delivery, or `manifest.json`. `doctor` prints only whether a key is
   set.
3. **`orders/<id>/assets/` is read-only.** The only thing VoxSwap writes into an
   order folder is `provider_voice_id` in `order.json` and `consent-audit.log`.
4. **The core stays stdlib-only.** No new runtime dependency for anything in
   `voxswap/` except inside a provider adapter, imported lazily. ffmpeg is an
   optional upgrade, never a requirement — every ffmpeg path needs a working
   fallback.
5. **Never cut a line's audio to make a number fit.** Overflow is reported, not
   hidden.
6. **QC runs before packaging.** A build that fails the quality gate must never
   produce a deliverable.
7. **No stubs that pretend to work.** If an adapter cannot do something, raise
   `ProviderError` with a fix. A silent no-op ships an untouched game to a
   paying customer.

## How the code is organised

* `voxswap/models.py` — `order.json` → typed objects, with operator-readable errors.
* `voxswap/consent.py` — the gate, and the withdrawal path (`purge_order`).
* `voxswap/stages/` — ten stages, in `stages/__init__.py` order. Each returns a
  `StageResult` and writes its output to disk before the next one starts.
* `voxswap/providers/` — swappable ASR / translation / voice. Lazy registry.
  `dubbing.py` holds the translation prompts and batching shared by every
  translation provider; adapters supply only transport.
* `tools/local/` — glue for self-hosted models: a resident TTS server, engines,
  and a whisper.cpp wrapper.
* `voxswap/targets/` — where lines live per engine, and what `INSTALL.md` says.
* `voxswap/audio/` — stdlib WAV toolkit, optional ffmpeg, time-fitting, loudness,
  streaming mixdown.
* `tests/` — stdlib `unittest`, no network, no keys.

## Conventions

* Errors are `VoxSwapError` subclasses with `(message, hint)`. The hint names the
  file to edit or the command to run. Tracebacks are for bugs, not operators.
* Anything expensive happens as late as possible and is cached on disk. A re-run
  must never re-pay for work that already succeeded — there is a test for this.
* Stages communicate through files (`lines.json`, `assets.json`), never memory.
* New user-facing behaviour needs a line in the relevant `docs/` page in the
  same change. Docs that lie are worse than missing docs.
* Comments explain *why*, especially where a cheaper approach was rejected.

## Before saying something works

```bash
python3 -m unittest discover -s tests -t .      # 167 tests, ~45s, no network
python3 tools/make_example.py && python3 -m voxswap run EXAMPLE-GAME
```

Both must pass. Record the evidence in `STATUS.md`. Never mark a phase done
without it.

## When touching local-model support

A local model must never be called once per line through a fresh process — that
reloads gigabytes of weights per utterance. Server mode
(`VOXSWAP_LOCAL_TTS_URL`) is the supported path; the command mode stays for
convenience. Anything talking to `localhost` must bypass HTTP proxies and must
not require an API key.

## When adding a provider

Match the protocol in `providers/base.py`, register a lazy factory in
`providers/registry.py`, keep endpoints and model IDs env-overridable, and add
it to the table in `docs/05-PROVIDERS.md`. Hosted APIs drift — the operator must
be able to fix a changed model ID by editing `.env`, not code.

## When adding a target adapter

Subclass `TargetAdapter`, implement `install_notes()` with **real, specific,
tested steps** for that engine, and be honest in `warnings()` about what the
customer still has to do themselves. A vague `INSTALL.md` is a support ticket.
