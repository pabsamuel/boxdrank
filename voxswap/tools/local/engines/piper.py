"""Piper engine for tts_server.py — fast CPU speech, **no cloning**.

    pip install piper-tts
    python3 tools/local/tts_server.py --engine piper \
        --option model=/path/en-us-ryan-high.onnx --option preset=yes

Piper is the opposite trade to XTTS. It runs a line in well under a second on a
plain CPU, needs no GPU and no torch, and the voices are 60–140 MB instead of
two gigabytes. What it cannot do is clone: a Piper voice is a fixed speaker
baked into the model file, so the customer's reference recording has nowhere to
go.

That makes it the wrong engine for the product's headline feature and the right
one for three real jobs:

  * **previewing an order** — hear the timing, the slot fits and the install
    layout of a 3,000-line game without paying a cloning provider per line;
  * **roles nobody asked to be cloned** — narrators, announcers, incidental NPCs;
  * **a machine with no GPU**, where XTTS would take days.

Because ignoring `speaker_wav` silently would ship a paying customer a game in
the wrong voice, this engine refuses to do it by accident: pass
`--option preset=yes` to say out loud that a preset voice is what you want.

Multi-speaker models (LibriTTS has 904) take `--option speaker=<id>`.
"""

from __future__ import annotations

import json
import wave
from pathlib import Path


def load(**options):
    """Load one voice once. Anything passed with --option arrives here."""
    try:
        from piper import PiperVoice
    except ImportError as exc:
        raise SystemExit(
            "error: the piper-tts package is not installed.\n"
            "  pip install piper-tts\n"
            "Voices: https://github.com/rhasspy/piper (releases) or the piper-voices repo."
        ) from exc

    model = options.get("model", "")
    if not model:
        raise SystemExit(
            "error: piper needs a voice file.\n"
            "  --option model=/path/to/en-us-ryan-high.onnx\n"
            "The matching .onnx.json must sit next to it."
        )
    path = Path(model).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"error: no such piper voice: {path}")

    voice = PiperVoice.load(path)
    speakers = 1
    config = path.with_suffix(path.suffix + ".json")
    if config.exists():
        try:
            speakers = int(json.loads(config.read_text(encoding="utf-8")).get("num_speakers", 1))
        except (OSError, ValueError, json.JSONDecodeError):
            pass

    speaker_id = options.get("speaker")
    speaker_id = int(speaker_id) if speaker_id not in (None, "") else None
    if speaker_id is not None and not 0 <= speaker_id < speakers:
        raise SystemExit(f"error: speaker {speaker_id} is out of range for {path.name} (0..{speakers - 1})")

    preset_ok = str(options.get("preset", "")).lower() in ("yes", "true", "1")
    print(f"  piper: {path.name}, {speakers} speaker(s)"
          + (f", using speaker {speaker_id}" if speaker_id is not None else ""), flush=True)
    if not preset_ok:
        print("  piper: cloning is NOT available — add --option preset=yes to accept a fixed voice",
              flush=True)

    return {"voice": voice, "speaker_id": speaker_id, "preset_ok": preset_ok, "name": path.name}


def synthesize(handle, text: str, speaker_wav: str, language: str, emotion: str, out_path: Path) -> None:
    """One line.

    `language` is ignored because a Piper voice *is* its language — you change
    language by loading a different voice, not by passing a code. `emotion` is
    ignored for the same reason XTTS ignores it: there is nowhere for a label to
    go. Punctuation in the text does more than a tag would.
    """
    if speaker_wav and not handle["preset_ok"]:
        raise ValueError(
            f"piper cannot clone a voice, but VoxSwap passed a reference clip ({Path(speaker_wav).name}). "
            f"Every line would come back in {handle['name']}'s voice instead of the customer's. "
            "Use the xtts engine to clone, or restart the server with --option preset=yes "
            "if a fixed preset voice is genuinely what this order wants."
        )

    config = None
    if handle["speaker_id"] is not None:
        from piper import SynthesisConfig      # only needed to pick a speaker

        config = SynthesisConfig(speaker_id=handle["speaker_id"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_path), "wb") as wav:
        handle["voice"].synthesize_wav(text, wav, syn_config=config)
