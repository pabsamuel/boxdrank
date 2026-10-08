"""XTTS-v2 engine for tts_server.py — zero-shot voice cloning, runs offline.

    pip install TTS
    python3 tools/local/tts_server.py --engine xtts --option device=cuda

XTTS clones from a few seconds of reference audio and speaks ~16 languages from
that one clone, which is exactly the shape VoxSwap needs. It is a PyTorch model,
not GGUF — see docs/11-RUNNING-LOCAL.md for why the GGUF options are weaker for
*cloning* specifically, even though they win for transcription and translation.

First run downloads the model (~2 GB) and may ask you to accept its licence.
"""

from __future__ import annotations

from pathlib import Path

MODEL = "tts_models/multilingual/multi-dataset/xtts_v2"

# XTTS takes a language code, not a locale.
_LANGUAGES = {
    "en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl",
    "cs", "ar", "zh", "zh-cn", "ja", "hu", "ko", "hi",
}


def load(**options):
    """Load the model once. Anything passed with --option arrives here."""
    try:
        from TTS.api import TTS
    except ImportError as exc:                       # noqa: F841 - message is the point
        raise SystemExit(
            "error: the TTS package is not installed.\n"
            "  pip install TTS\n"
            "(and a torch build matching your GPU, if you have one)"
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
    print(f"  xtts: {model} on {device}", flush=True)
    return tts


def synthesize(handle, text: str, speaker_wav: str, language: str, emotion: str, out_path: Path) -> None:
    """One line. `emotion` is unused: XTTS carries delivery from the reference
    clip rather than from a label, so a per-line emotion tag has nowhere to go.
    Punctuation in the text does more than any tag would."""
    code = (language or "en").split("-")[0].lower()
    if code not in _LANGUAGES:
        code = "en"
    if not speaker_wav:
        raise ValueError("XTTS needs a reference clip; VoxSwap passes one as speaker_wav")

    handle.tts_to_file(
        text=text,
        speaker_wav=speaker_wav,
        language=code,
        file_path=str(out_path),
        split_sentences=False,      # VoxSwap already splits by line; splitting again breaks timing
    )
