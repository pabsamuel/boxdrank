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

Any local model, driven by a command you provide. VoxSwap deliberately does not
pin torch or bundle a model — that would make a stdlib-only tool impossible to
install, and every local TTS has a different, fast-moving API.

```
VOXSWAP_LOCAL_TTS_CMD="python tools/xtts_say.py --text {text_file} --speaker {speaker_wav} --lang {language} --out {output}"
VOXSWAP_LOCAL_VOICE_DIR=.voices
VOXSWAP_LOCAL_TIMEOUT=900
```

The contract: read the UTF-8 text at `{text_file}`, clone the voice in
`{speaker_wav}`, write a WAV to `{output}`. Placeholders available:
`{text_file} {output} {speaker_wav} {language} {emotion}`. No shell is
involved, so no quoting surprises.

"Cloning" here just builds a clean reference clip: up to 60 seconds of the
person's samples concatenated into `<voice_dir>/<voice_id>.wav`. That is what
zero-shot models like XTTS want.

* **Good:** no per-character cost, audio never leaves your machine, viable for
  whole games.
* **Costs:** a GPU, setup time, and quality that depends entirely on the model
  you chose.

---

## ASR (transcription)

Only used for lines the customer's script did not cover.

| Provider | Notes |
| --- | --- |
| `mock` | Reads a `.txt` sidecar next to the clip if present, else invents text from the filename. The sidecar rule makes fixtures and hand-corrected transcripts free. |
| `openai` | Whisper-family. Cheap, accurate on game dialogue, returns segment timings (which is what keeps long clips in sync). `VOXSWAP_OPENAI_ASR_MODEL` to change the model. |
| `elevenlabs` | One less vendor if you already use them for voice. Returns word-level timings. |
| `local` | Your own whisper.cpp or similar, via `VOXSWAP_LOCAL_ASR_CMD`. Must write `{"text","language","segments":[{"start","end","text"}]}` to `{output}`. |

**The cheapest ASR is the customer's own script file.** Ask for it every time:
it costs nothing, fixes every proper noun, and gives you speaker labels.

## Translation

| Provider | Notes |
| --- | --- |
| `mock` | Marks text as translated and simulates realistic length drift, so time-fitting gets a proper workout offline. |
| `claude` | Real dubbing translation: length-matched, register-preserving, names untouched, written to be read aloud. Also labels each line's emotion for the voice provider. |

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
