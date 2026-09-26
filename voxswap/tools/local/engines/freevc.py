"""FreeVC engine for tts_server.py — voice conversion, the natural-sounding path.

    pip install TTS            # see docs/11-RUNNING-LOCAL.md, the install bites
    python3 tools/local/tts_server.py --engine freevc --port 8124

    # voxswap/.env
    VOXSWAP_LOCAL_VC_URL=http://127.0.0.1:8124/vc

This engine implements `convert`, not `synthesize`, and that is the whole point.
It never sees the script. It takes the recording a game already ships and
changes only the speaker's identity, so the actor's timing, stress, pauses and
emotion all survive untouched — see `providers/local_vc.py` for why that matters
more than the choice of model.

Two practical consequences:

  * the output is the same length as the input to within a few milliseconds, so
    the fitting stage has almost nothing to correct;
  * there is nothing to get wrong about *what* is said, because nothing about
    the words is regenerated.

Reference audio still decides the quality of the result. FreeVC reads a speaker
embedding from it, so more clean speech means a closer match; VoxSwap hands over
the concatenated reference it builds from the customer's samples.

First run downloads WavLM (~1.2 GB) and a speaker encoder alongside the model.
"""

from __future__ import annotations

from pathlib import Path

MODEL = "voice_conversion_models/multilingual/vctk/freevc24"


def load(**options):
    """Load the model once. Anything passed with --option arrives here."""
    try:
        from TTS.api import TTS
    except ImportError as exc:
        raise SystemExit(
            "error: the TTS package is not installed.\n"
            "  pip install TTS\n"
            "It is a fussy install — docs/11-RUNNING-LOCAL.md lists the four ways it fails."
        ) from exc

    device = options.get("device", "")
    if not device:
        try:
            import torch

            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"

    model = options.get("model", MODEL)
    tts = TTS(model)
    tts.to(device)
    print(f"  freevc: {model} on {device}", flush=True)
    return tts


def convert(handle, source_wav: str, speaker_wav: str, out_path: Path) -> None:
    """Rewrite one recording in the reference voice.

    No text, no language and no emotion argument, because none of them exist
    here: whatever the source said, in whatever way it said it, is what comes
    back out.
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    handle.voice_conversion_to_file(
        source_wav=str(source_wav),
        target_wav=str(speaker_wav),
        file_path=str(out_path),
    )
