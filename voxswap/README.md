<div align="center">
  <h1>🎙️ VoxSwap</h1>
  <p><strong>Put your own voice — or your partner's, or your best friend's — into the games and films you already own.</strong></p>
  <p>Send recordings → the pipeline runs itself → you get a drop-in folder of finished audio.</p>

  ![Python](https://img.shields.io/badge/Python-3.10+-3776ab?style=flat-square&logo=python&logoColor=white)
  ![Dependencies](https://img.shields.io/badge/dependencies-none-00e054?style=flat-square)
  ![Tests](https://img.shields.io/badge/tests-157-blue?style=flat-square)
</div>

---

## New here? Read one file

**[`docs/00-START-HERE.md`](docs/00-START-HERE.md)** — the whole business explained in one page:
what this is, what a day looks like, and what to do first. Everything else is detail.

---

## See it work in 30 seconds

No API keys. No installs. Nothing to sign up for.

```bash
cd voxswap
python3 tools/make_example.py          # builds a fake demo order
python3 -m voxswap run EXAMPLE-GAME    # runs the whole pipeline
```

You get `delivery/EXAMPLE-GAME.zip` — the exact thing a customer receives:
replacement audio in the game's own folder structure, install instructions, a
manifest with checksums, the script, and a QC report.

The demo audio is a synthetic buzz, not speech — it runs on the built-in
`mock` providers so the whole pipeline (matching, timing, loudness, packaging,
quality checks) can be exercised offline and for free. Swap in a real voice
provider and the same command produces real speech.

## What it does

```
customer's voice samples ─┐
                          ├─→ [clone] ─→ [speak every line] ─┐
game / film script ───────┘                                  ├─→ [fit the timing]
                                                             ├─→ [match the loudness]
game / film audio ──────────────────→ [find the character's lines]
                                                             └─→ [package + QC] ─→ ZIP
```

Ten stages, each resumable. Anything expensive happens last, after the free
checks have passed, and nothing is ever regenerated twice.

| | |
| --- | --- |
| **Games** | Replaces individual clips in place, keeping filenames and folder structure. Unreal, Unity, Wwise and loose-file titles. |
| **Films** | Rebuilds a full-length dub track with your voice over the original mix, plus matching subtitles, plus an optional ready-to-play `.mkv`. |
| **Languages** | Play an English game in Turkish, in your own voice. Translation is length-matched so lines still fit their slots. |
| **Consent** | Every voice needs a signed form **and** an order-specific spoken verification phrase. There is no flag to skip it. |
| **Runs offline** | Transcription, translation and voice cloning can all run on your own machine — whisper.cpp, any GGUF model via llama.cpp/Ollama, and XTTS. No API bill, and "your voice never leaves my machine" is a real thing you can say. |
| **Withdrawal** | One command destroys the clone at the provider, every generated take and the delivery. |

## The commands you will actually use

```bash
python3 -m voxswap doctor                  # is this machine ready?
python3 -m voxswap new --customer "..." --email "..." --title "..."
python3 -m voxswap phrase ORD-123          # the consent sentence to send them
python3 -m voxswap validate ORD-123        # check paperwork + files, spend nothing
python3 -m voxswap run ORD-123 --only plan # see which lines would be replaced
python3 -m voxswap run ORD-123             # do it
python3 -m voxswap watch                   # or: run every new order automatically
python3 -m voxswap status ORD-123          # where is it?
python3 -m voxswap purge ORD-123           # someone withdrew consent
```

## Requirements

* **Python 3.10+.** That is the whole requirement for the core.
* **ffmpeg** — optional but strongly recommended. Without it, only plain WAV
  input works. With it you get every audio format, video files, proper
  pitch-preserving time-stretching and real loudness normalisation.
* **API keys** — only when you switch off the `mock` providers. See
  [`docs/05-PROVIDERS.md`](docs/05-PROVIDERS.md).

## Documentation

| File | Read it when |
| --- | --- |
| [`docs/00-START-HERE.md`](docs/00-START-HERE.md) | First. Always. |
| [`docs/01-HOW-IT-WORKS.md`](docs/01-HOW-IT-WORKS.md) | You want to know what the ten stages do |
| [`docs/02-OPERATOR-RUNBOOK.md`](docs/02-OPERATOR-RUNBOOK.md) | A customer just emailed you |
| [`docs/03-ORDER-FORMAT.md`](docs/03-ORDER-FORMAT.md) | You are editing `order.json` |
| [`docs/04-CONSENT-AND-RIGHTS.md`](docs/04-CONSENT-AND-RIGHTS.md) | Before your first real customer |
| [`docs/05-PROVIDERS.md`](docs/05-PROVIDERS.md) | You are ready to spend money on real voices |
| [`docs/11-RUNNING-LOCAL.md`](docs/11-RUNNING-LOCAL.md) | You would rather not spend that money — running it all locally |
| [`docs/06-TARGETS.md`](docs/06-TARGETS.md) | The customer named a specific game or film |
| [`docs/07-QUALITY-BAR.md`](docs/07-QUALITY-BAR.md) | It works but sounds wrong |
| [`docs/08-TROUBLESHOOTING.md`](docs/08-TROUBLESHOOTING.md) | Something broke |
| [`docs/09-PRICING-AND-BUSINESS.md`](docs/09-PRICING-AND-BUSINESS.md) | You are deciding what to charge |
| [`prompts/`](prompts/) | You want Claude to do the next piece of work |
| [`STATUS.md`](STATUS.md) | You are picking this project back up |

## Tests

```bash
python3 -m unittest discover -s tests -t .
```

181 tests, no dependencies, no network, no API keys, ~45 seconds.

12 of them cover the ffmpeg code paths and skip automatically when ffmpeg is
not installed, so the suite stays runnable on a bare machine. CI runs half its
matrix with ffmpeg so they do not quietly never run. The local-model providers
are tested against a real HTTP server running in-process — no network, no
models, no keys.

## Licence

MIT, same as the rest of this repository. The licence covers the code — it says
nothing about what you are allowed to do with someone's voice or someone else's
game. That is [`docs/04-CONSENT-AND-RIGHTS.md`](docs/04-CONSENT-AND-RIGHTS.md).
