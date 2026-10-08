# Providers

Three capabilities, chosen per order in `order.json`:

```json
"providers": { "asr": "openai", "translation": "claude", "voice": "elevenlabs" }
```

Nothing is constructed and no key is required until a stage actually needs it,
so an order using `mock` for everything runs on a machine with no keys at all.

---

## Keys

Copy `.env.example` to `.env` in the `voxswap/` folder and fill in only what you
use. Real environment variables win over the file. Nothing from `.env` is ever
written into an order folder, a log, or a delivery.

```
ELEVENLABS_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

Check what is set with `python3 -m voxswap doctor` (it prints *whether* a key is
set, never the key).

---

## Voice — the one that defines the product

### `mock` (default)

Offline, free, deterministic, instant. Produces a voice-shaped buzz with correct
duration, format and loudness. Everything downstream is exercised for real.

Use it for: new titles, pattern debugging, CI, reproducing a customer's bug.
It is not a toy — it is how you avoid paying to discover a typo.

### `local_vc` — voice **conversion**, and probably what you want

Every other voice provider on this page reads the script out loud. This one does
not: it takes the recording the game already ships and changes only *who* is
speaking.

That difference is the whole quality gap. A game's dialogue was performed — the
pause before a threat, the crack in a shout, the throwaway delivery of a
one-liner. Text-to-speech rebuilds a line from a bare string and invents all of
that, flatly. Conversion keeps it, because it never regenerates it. When a
customer says a demo sounds "robotic", this is almost always what they are
hearing, and no amount of shopping for a better TTS model fixes it.

Three things fall out of it:

* **lip-sync is free.** Output length matches input to a few milliseconds, so
  the fitting stage barely has to touch the audio — and every correction is a
  chance to add an artefact.
* **no transcription is needed.** No ASR bill, and no chance of a mis-heard word
  being put in a character's mouth.
* **emotion labels stop mattering**, which deletes a whole category of wrong.

```
# voxswap/.env
VOXSWAP_LOCAL_VC_URL=http://127.0.0.1:8124/vc
```
```bash
python3 tools/local/tts_server.py --engine freevc --port 8124
```
```json
"providers": { "voice": "local_vc" }
```

**The one thing it cannot do is change the words.** It has no idea what is being
said, so it cannot dub into another language. Intake refuses that combination
outright rather than delivering `en` audio alongside a `tr` script — a failure
nobody would notice until a bilingual customer did. Translating an order means
`"voice": "local"` and accepting TTS delivery for it.

It also needs a clip to convert, so it cannot invent a line that has no source
audio. For that, use TTS.

### `elevenlabs`

Hosted instant cloning plus multilingual TTS. Fastest route to a shippable
product.

* **Good:** clone from ~1 minute of audio, one clone speaks many languages,
  expressive, no GPU.
* **Costs:** per character. A full game's protagonist (20k–60k lines) gets
  expensive fast — price it before you promise it.
* **Privacy:** the person's voice leaves your machine. Say so in your consent
  form. Some customers will say no, and that is what `local` is for.

Tunables (env, so you can react to API changes without a code edit):

```
VOXSWAP_ELEVEN_BASE=https://api.elevenlabs.io/v1
VOXSWAP_ELEVEN_TTS_MODEL=eleven_multilingual_v2
VOXSWAP_ELEVEN_STT_MODEL=scribe_v1
VOXSWAP_ELEVEN_OUTPUT_FORMAT=pcm_24000
```

Keep `OUTPUT_FORMAT` as a `pcm_*` value unless you have ffmpeg: PCM is wrapped
into WAV with the standard library, while mp3/opus output needs ffmpeg to
decode. **Model IDs and endpoints on hosted APIs drift — check the current
ElevenLabs docs when something 404s, and change the env var, not the code.**

The adapter names each clone `voxswap-<voice_id>-<consent_ref>`, so an audit of
your provider account can be traced back to a signed consent without opening
this repo. `delete_voice` is implemented, which is what makes withdrawal real.

### `local`

Your own model, on your own machine. Full guide:
[`11-RUNNING-LOCAL.md`](11-RUNNING-LOCAL.md).

**Preferred — a resident server.** `tools/local/tts_server.py` loads the model
once and answers one POST per line:

```bash
pip install TTS
python3 tools/local/tts_server.py --engine xtts --option device=cuda
```
```
VOXSWAP_LOCAL_TTS_URL=http://127.0.0.1:8123/tts
```

This is not a micro-optimisation. The alternative reloads gigabytes of weights
for *every utterance* — days of model loading on a full game.

**Or a command per line**, if you would rather drive it from the shell:

```
VOXSWAP_LOCAL_TTS_CMD=python3 my_tts.py --text {text_file} --speaker {speaker_wav} --lang {language} --out {output}
```

Read the UTF-8 text at `{text_file}`, clone `{speaker_wav}`, write a WAV to
`{output}`. Placeholders: `{text_file} {output} {speaker_wav} {language}
{emotion}`. No shell is involved, so no quoting surprises.

"Cloning" here builds a clean reference clip: up to 60 seconds of the person's
samples concatenated into `<voice_dir>/<voice_id>.wav`, which is what zero-shot
models like XTTS want. `delete_voice` removes it, so withdrawal works locally
too.

* **Good:** no per-character cost, audio never leaves your machine, viable for
  whole games, and "your voice never leaves my machine" is a real selling point.
* **Costs:** a GPU, setup time, and cloning quality below the good hosted
  providers. That last one is the honest trade — see the guide.

---

## ASR (transcription)

Only used for lines the customer's script did not cover.

| Provider | Notes |
| --- | --- |
| `mock` | Reads a `.txt` sidecar next to the clip if present, else invents text from the filename. The sidecar rule makes fixtures and hand-corrected transcripts free. |
| `openai` | Whisper-family. Cheap, accurate on game dialogue, returns segment timings (which is what keeps long clips in sync). `VOXSWAP_OPENAI_ASR_MODEL` to change the model. |
| `elevenlabs` | One less vendor if you already use them for voice. Returns word-level timings. |
| `local` | Your own whisper.cpp or similar, via `VOXSWAP_LOCAL_ASR_CMD`. Must write `{"text","language","segments":[{"start","end","text"}]}` to `{output}` — `tools/local/whisper_cpp.py` already does. |

**For local transcription, the `openai` adapter is usually the better route:**
whisper.cpp's server speaks the same endpoint, so pointing `VOXSWAP_OPENAI_BASE`
at `http://127.0.0.1:8080/v1` works with no key, no proxy, and no model reload
per clip.

**The cheapest ASR is the customer's own script file.** Ask for it every time:
it costs nothing, fixes every proper noun, and gives you speaker labels.

## Translation

| Provider | Notes |
| --- | --- |
| `mock` | Marks text as translated and simulates realistic length drift, so time-fitting gets a proper workout offline. |
| `claude` | Real dubbing translation: length-matched, register-preserving, names untouched, written to be read aloud. Also labels each line's emotion for the voice provider. |
| `local_llm` | The same, through any OpenAI-compatible local server — llama.cpp, Ollama, LM Studio, vLLM. Free, offline, needs a 14B-class GGUF model to be good. See [`11-RUNNING-LOCAL.md`](11-RUNNING-LOCAL.md). |

Both real providers share one set of dubbing instructions (`providers/dubbing.py`),
so improving the prompt improves both and they cannot drift apart. `local_llm`
uses smaller batches and falls back to one line at a time when a small model
loses count — a weak model costs speed, not correctness.

```
VOXSWAP_LOCAL_LLM_BASE=http://127.0.0.1:8080/v1   # llama.cpp
VOXSWAP_LOCAL_LLM_MODEL=local-model               # Ollama/LM Studio need a real name
VOXSWAP_LOCAL_LLM_BATCH=12
```

Dubbing translation is an instruction-following job, not a lookup: it has to
choose the shorter of two correct phrasings because the line has 2.1 seconds.
That is why it runs through a model rather than a phrase-based MT engine.

```
VOXSWAP_CLAUDE_MODEL=claude-opus-5
VOXSWAP_CLAUDE_EFFORT=medium        # low | medium | high | xhigh | max
```

Requires `pip install anthropic`. Raise the effort for a marquee order, lower it
for bulk. Batches are checkpointed, so a failure halfway costs you only the
current batch of 40 lines.

---

## Adding your own provider

1. Write a class in `voxswap/providers/` matching the relevant protocol in
   `providers/base.py` (`transcribe`, `translate`, or
   `ensure_voice`/`synthesize`/`delete_voice`).
2. Register a lazy factory in `providers/registry.py`.
3. Rules: never log a key; raise `ProviderError(message, hint)` with a fix, not
   a traceback; make `ensure_voice` reuse an existing clone; **implement
   `delete_voice`** — consent can be withdrawn, and a promise you cannot execute
   is not a promise.

There is a ready-made prompt for this: [`prompts/04-add-a-provider.md`](../prompts/04-add-a-provider.md).
