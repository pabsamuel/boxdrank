# Running everything locally

No API bill, no per-character pricing, and the sentence that sells this product
better than any feature list:

> **Your voice never leaves my machine.**

For a business whose whole premise is "give me a recording of your girlfriend's
voice", that is not a nice-to-have. Expect to be asked.

This page is the honest version: what local wins at, what it loses at, and what
it actually costs you in hardware and hours.

---

## The short answer

| Job | Run locally? | What to use |
| --- | --- | --- |
| **Transcription** (ASR) | **Yes, always** | whisper.cpp with a quantised model. As good as hosted, free, fast. There is no reason to pay for this. |
| **Translation** | **Yes, if you have the VRAM** | llama.cpp / Ollama with a GGUF instruct model, 14B or bigger for multilingual work. Good, not frontier. |
| **Voice cloning** (TTS) | **Yes, with a caveat** | XTTS-v2. This is the part where hosted still sounds better, and where GGUF is currently the weakest. Read the section below before you promise a customer. |

So: **ASR and translation go local immediately**; the voice is the decision that
needs your ears on it.

> Local audio models move fast. The specific recommendations here are a snapshot
> — check what is current before you buy a GPU for one of them. The *shape* of
> the advice (whisper.cpp for ASR, a GGUF instruct model for translation, a
> zero-shot cloner for TTS) has been stable for a while.

---

## 1. Transcription — whisper.cpp

Quantised Whisper, no Python ML stack, runs on a laptop CPU.

```bash
git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && make
./models/download-ggml-model.sh large-v3-turbo
```

**Two ways to wire it up.** Prefer the server:

**a) Its server, through the existing `openai` adapter** — no new code, no key:

```bash
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin --port 8080
```
```
# voxswap/.env
VOXSWAP_OPENAI_BASE=http://127.0.0.1:8080/v1
```
```json
"providers": { "asr": "openai" }
```

VoxSwap notices the address is local, skips the API key requirement, and
bypasses any HTTP proxy you have set.

**b) The CLI, per file**, using the bundled wrapper:

```
VOXSWAP_WHISPER_BIN=/path/to/whisper.cpp/build/bin/whisper-cli
VOXSWAP_WHISPER_MODEL=/path/to/whisper.cpp/models/ggml-large-v3-turbo.bin
VOXSWAP_LOCAL_ASR_CMD=python3 tools/local/whisper_cpp.py --in {input} --out {output} --lang {language}
```
```json
"providers": { "asr": "local" }
```

Simpler to set up, but it reloads the model on every clip — fine for a film,
painful for a game. `tools/local/whisper_cpp.py` also converts your audio to the
16 kHz mono WAV whisper.cpp insists on, using ffmpeg.

**Remember the cheapest ASR of all is the customer's own script file.** Ask
every time.

## 2. Translation — any OpenAI-compatible local server

llama.cpp, Ollama, LM Studio, vLLM — they all expose `/v1/chat/completions`, so
one adapter covers all of them.

```bash
# llama.cpp
llama-server -m models/qwen3-14b-instruct-q5_k_m.gguf -c 8192 --port 8080

# or Ollama
ollama serve && ollama pull qwen3:14b
```

```
# voxswap/.env — llama.cpp
VOXSWAP_LOCAL_LLM_BASE=http://127.0.0.1:8080/v1

# or Ollama (note the port and that it needs a real model name)
VOXSWAP_LOCAL_LLM_BASE=http://127.0.0.1:11434/v1
VOXSWAP_LOCAL_LLM_MODEL=qwen3:14b
```
```json
"providers": { "translation": "local_llm" }
```

**Model size matters here more than anywhere else.** Dubbing translation is not
word substitution: the model has to pick the *shorter* of two correct phrasings
because the line has 2.1 seconds, keep a mercenary sounding like a mercenary,
and leave item names alone. A 7B model will do it badly in a way you will not
notice until a native speaker tells you. 14B is a sensible floor; bigger is
better; pick one with genuinely good coverage of your target language rather
than the best English benchmark score.

VoxSwap already compensates for small models where it can:

* **batches of 12**, not 40 (`VOXSWAP_LOCAL_LLM_BATCH`), because small models
  lose count on long lists;
* a **stricter retry** when the count comes back wrong, then a **fall back to
  one line at a time**, so a sloppy model costs speed rather than correctness;
* markdown fences and chatty preambles are stripped rather than fatal;
* a line the model never manages keeps its **source text**, and shows up
  untranslated in `script.csv` where you can fix that one line.

The same dubbing instructions are used for local and hosted models — they live
in one place (`providers/dubbing.py`), so the two cannot drift apart.

## 3. Voice cloning — the honest section

This is where local costs you something real.

**Use XTTS-v2.** It clones from a short reference clip, speaks ~16 languages
from that one clone, and runs offline. It is a PyTorch model, not GGUF.

```bash
pip install TTS          # see "When pip install TTS fails" below — it usually does
python3 tools/local/tts_server.py --engine xtts --option device=cuda
```

Run that from **inside the `voxswap/` folder of a clone of this repository**.
`tools/local/tts_server.py` is a path relative to it, so from a home directory
you get `No such file or directory`:

```bash
git clone https://github.com/pabsamuel/boxdrank
cd boxdrank/voxswap
```
```
# voxswap/.env
VOXSWAP_LOCAL_TTS_URL=http://127.0.0.1:8123/tts
```
```json
"providers": { "voice": "local" }
```

**Run the server, not the per-line command.** `tools/local/tts_server.py` loads
the model once and answers one POST per line. The command-per-line mode reloads
several gigabytes of weights for *every utterance* — on a 3,000-line game that
is days of loading for minutes of speech. VoxSwap prefers the server whenever
`VOXSWAP_LOCAL_TTS_URL` is set.

### When `pip install TTS` fails

Two failures are near-certain, and neither is your machine's fault.

**1. `No matching distribution found for TTS`.** Coqui's last release caps out
at Python 3.11 (`Requires-Python >=3.9,<3.12`), so a 3.12 or 3.13 install finds
nothing at all. Either install Python 3.11 alongside what you have and call it
explicitly, or use the maintained community fork, which tracks new Python:

```bash
# Windows, keeping your existing Python:
py -3.11 -m pip install TTS
py -3.11 tools/local/tts_server.py --engine xtts

# or, on any Python version:
pip install coqui-tts
```

**2. `metadata-generation-failed` on `sudachidict_core`.** That is a Japanese
dictionary pulled in by `spacy[ja]`, and it downloads its data during install,
so it dies behind a proxy or a firewall. Nothing in VoxSwap needs it. Skip the
dependency tree and install what inference actually uses:

```bash
pip install torch torchaudio numpy scipy librosa soundfile \
            coqpit anyascii inflect num2words pysbd einops
pip install --no-deps TTS==0.22.0
```

Leave `encodec` out of that list deliberately. It needs `docopt`, which fails
to build against current setuptools (`AttributeError: install_layout`), and pip
then abandons the **whole** transaction — so a two-gigabyte torch download
finishes and installs nothing. Neither package is used by any cloning model;
they belong to Bark.

**No GPU?** It still runs, just slowly — a line takes seconds rather than a
fraction of one. Fine for a first order, painful for a 3,000-line game.

### If the model download is blocked

XTTS-v2 lives on Hugging Face. Where that is unreachable, **YourTTS** is the
fallback: an older Coqui zero-shot cloning model whose weights are on GitHub
releases instead. It is audibly behind XTTS — flatter, more accent drift — but
it genuinely clones, and it takes the same engine:

```bash
mkdir -p ~/.local/share/tts && cd ~/.local/share/tts
curl -LO https://github.com/coqui-ai/TTS/releases/download/v0.10.1_models/tts_models--multilingual--multi-dataset--your_tts.zip
unzip tts_models--multilingual--multi-dataset--your_tts.zip && rm *.zip
```

```bash
python3 tools/local/tts_server.py --engine xtts \
    --option model=tts_models/multilingual/multi-dataset/your_tts
```

Dropping it in the cache directory first is what stops Coqui phoning home: the
model manager only downloads what it cannot already find. YourTTS speaks `en`,
`fr-fr` and `pt-br` only.

### What about GGUF for TTS?

It exists — OuteTTS-class models run through llama.cpp and can clone a voice —
and it is genuinely appealing: same runtime as your translation model, tiny
memory footprint, no torch.

But be clear-eyed: for *voice cloning specifically*, GGUF TTS is currently
behind XTTS-v2, which is itself behind the good hosted providers. On a paying
order the thing the customer is judging is whether it sounds like them. That is
the one place not to economise first.

If you want to try it anyway, that is a 15-line file:
`tools/local/engines/` takes a module exposing `load()` and `synthesize()`,
and `--engine yourmodule` runs it. Copy `engines/xtts.py` and swap the two
calls. Check the model's current API — this area changes fast.

### Piper — when you do not need a clone

`engines/piper.py` is the opposite trade to XTTS: a line synthesises in well
under a second on a plain CPU, the voices are 60–140 MB instead of two
gigabytes, and there is no torch and no GPU anywhere.

```bash
pip install piper-tts
# voices: the releases at github.com/rhasspy/piper, or the piper-voices repo
python3 tools/local/tts_server.py --engine piper --port 8123 \
    --option model=/path/en-us-ryan-high.onnx --option preset=yes
```

What it cannot do is clone. A Piper voice is a fixed speaker baked into the
model file, so the customer's reference recording has nowhere to go. That makes
it wrong for the headline feature and right for three real jobs:

* **previewing an order** — hear the timing, the slot fits and the install
  layout of a whole game before paying a cloning provider per line;
* **roles nobody asked to be cloned** — narrators, announcers, incidental NPCs;
* **a machine with no GPU**, where XTTS would take days.

Because silently ignoring the reference clip would ship a paying customer a game
in a stranger's voice, the engine refuses to do it by accident: without
`--option preset=yes` it raises instead of synthesising. Multi-speaker models
(LibriTTS carries 904) take `--option speaker=<id>`.

Expect to reach for `options.max_stretch`. A preset voice has its own pace, and
if it is slower than the actor it replaces every line overflows its slot — QC
will tell you exactly which ones and by how much.

### Getting a good local clone

The model matters less than the input. In order of impact:

1. **90 seconds minimum of clean reference audio**, 2–5 minutes is where it gets
   good. VoxSwap builds the reference by concatenating up to 60 seconds of the
   samples, so give it variety, not one long monotone take.
2. **Quiet room, decent mic, no music, no second voice.** Denoised audio clones
   worse than clean quiet audio.
3. **Punctuation carries the delivery.** XTTS takes its emotion from the
   reference clip and the text, not from a label — so `emotion` is ignored by
   that engine and your line text is doing the work.

---

## A fully local order

```json
"providers": {
  "asr": "openai",
  "translation": "local_llm",
  "voice": "local"
}
```

with, in `voxswap/.env`:

```
VOXSWAP_OPENAI_BASE=http://127.0.0.1:8080/v1      # whisper.cpp server, no key
VOXSWAP_LOCAL_LLM_BASE=http://127.0.0.1:8081/v1   # llama.cpp server
VOXSWAP_LOCAL_TTS_URL=http://127.0.0.1:8123/tts   # tools/local/tts_server.py
```

Nothing leaves the machine. Check it with `python3 -m voxswap doctor`, then run
a real order on your own voice before you sell it.

---

## Hardware, roughly

Ballpark figures to plan with, not benchmarks:

| | VRAM | Notes |
| --- | --- | --- |
| whisper.cpp large-v3-turbo | ~2 GB (or CPU) | CPU is fine; it is faster than realtime on a modern laptop |
| 7–8B instruct, Q4 | ~5–6 GB | Too small for good dubbing translation |
| 14B instruct, Q4–Q5 | ~9–12 GB | The sensible floor for translation |
| 32B instruct, Q4 | ~20 GB | Noticeably better again |
| XTTS-v2 | ~4 GB | Runs on CPU, slowly |

A single 16 GB consumer GPU comfortably runs whisper + a 14B translator + XTTS,
though not all three at full tilt simultaneously. **Run the stages separately**
if memory is tight: VoxSwap's stages are already sequential and resumable, so
you can stop the translation server before starting the TTS server and resume
the job with `--from voice`.

**Time**, for a 3,000-line game at ~3 seconds a line (≈2.5 hours of audio):

* mid-range GPU: roughly an hour or two of synthesis
* CPU only: think overnight

Neither is a problem — the watcher runs jobs unattended. It only becomes a
problem if you promised same-day delivery.

## When to switch

Switch the **voice** provider to local when either is true:

* a single order's synthesis cost approaches what a second-hand GPU costs, or
* a customer asks where their voice is being sent — and they will.

Switch **ASR and translation** to local now. They are free, they are good, and
they remove two API keys from your setup.

## Proving it before you sell it

Do not swap a provider on a paying order. Instead:

1. Run one order end to end with hosted providers. Keep the delivery.
2. Run the *same* order with local providers, into a different order ID.
3. Listen to the same five lines from each, back to back.
4. Have a native speaker read ten translated lines from each.

If local holds up, switch and enjoy the margin. If it does not, you now know
exactly which stage to keep hosted — and because providers are per-order, you
can mix: local ASR and translation, hosted voice, is a perfectly sensible
configuration and saves most of the setup cost with none of the quality risk.
