# Decisions

Why things are the way they are. If you are about to change one of these, read
the reason first — most of them were chosen against an obvious-looking
alternative.

---

### 1. The core has no dependencies

**Chosen:** stdlib-only core; ffmpeg optional; provider SDKs imported lazily.

**Instead of:** numpy + pydub + requests + an ML stack.

A one-person studio needs to run this on a laptop, a cheap VPS and CI without a
build toolchain. Every dependency is a machine where it does not install. WAV
reading, resampling, loudness estimation, time-stretching and mixing are all a
few hundred lines of arithmetic — cheaper than the support burden of a native
dependency.

### 2. ffmpeg is an upgrade, never a requirement

Every ffmpeg path has a working fallback: OLA time-stretch instead of `atempo`,
a K-weighting estimate instead of `loudnorm`, a silence bed instead of a decoded
film mix. The tool degrades, it does not fail. The delivery says so when the
fallback changes what the customer receives.

### 3. Consent is code, not policy

**Chosen:** a hard gate in `consent.py` with no override flag, requiring an
order-specific spoken verification phrase.

**Instead of:** a checkbox in the order, or a policy document.

A policy is what you meant to do. A gate is what happened. The spoken phrase is
the only cheap control that actually distinguishes "they agreed" from "I have
their voice notes", because it cannot be lifted from existing audio.

### 4. `plan` runs before `transcribe`

Transcribing a whole game to find out which 3% of it matters is a large bill for
nothing. Role assignment comes first, and only matched lines are transcribed.

### 5. `qc` runs before `package`

A build that fails the quality gate never becomes a deliverable, so there is
nothing to accidentally send. The alternative — package then check — leaves a
correct-looking ZIP sitting next to a failure report.

### 6. Stages talk through files, not memory

`lines.json`, `assets.json`, `synth/`, `master/`. It makes `--from <stage>`,
crash recovery and "delete one take to redo one line" fall out for free, and it
means an operator can inspect any intermediate state with a text editor.

### 7. Expensive stages cache aggressively; only `--force` re-pays

There is a test asserting that a second run does not regenerate a single take.
That test is protecting a bill, not a behaviour.

### 8. Loudness matches the original clip, not a target number

Copying the loudness of the clip being replaced is always more convincing than
hitting a spec value, because it is by definition right for that moment in the
mix. `target_lufs` is only the fallback for when there is no reference (film).

### 9. Overflowing lines are flagged, never cut

Cutting mid-word to hit a duration produces a line that is *worse* than one that
runs 300 ms long, and hides the problem from the person who could fix it by
rewording.

### 10. Translation goes through an instruction-following model

Dubbing translation has to choose the shorter of two correct phrasings because
the slot is 2.1 seconds, keep a character's register, and never produce
something unreadable aloud. That is instruction-following, not lookup. It also
gets us per-line emotion labels from the same pass.

### 11. Local models are driven by a command, not an import

Pinning torch would break decision 1, and every local TTS has a different,
fast-moving Python API. A five-placeholder command contract (`{text_file}`,
`{speaker_wav}`, `{output}`, `{language}`, `{emotion}`) works with anything the
operator can run, and survives the model being replaced.

### 12. Packed game audio is not opened

Wwise `.bnk`, FMOD `.bank`, Unreal `.pak`. We deliver import-ready audio and a
mapping, and say plainly that the last step needs the title's own tooling.
Half-working extraction that corrupts someone's game install is worse than an
honest manual step.

### 13. Provider endpoints and model IDs live in env vars

Hosted APIs drift. When a model ID changes, the operator edits `.env` and their
customer's job runs today, instead of waiting for a code change.

### 14. The film dub ducks the original instead of replacing it

Retail films ship one mixed track; there is no way to remove only the original
actor. Ducking keeps the music and effects. `WARNINGS.md` tells the customer the
original may be faintly audible, because they will hear it and should hear it
from us first.

### 15. The film mix is streamed, not loaded

A two-hour 48 kHz stereo track is ~1.4 GB as samples. The mixdown decodes,
ducks, mixes and writes block by block, so memory stays flat regardless of
runtime.

### 16. `mock` providers are first-class

They are how you test a new title for free, reproduce a bug offline, and keep CI
honest. A test suite that needs an API key is a test suite nobody runs.
