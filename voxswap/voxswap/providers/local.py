"""Self-hosted providers driven by a command line.

Why not import XTTS / F5-TTS / whisper.cpp directly? Because pinning torch and
CUDA inside this project would make a stdlib-only tool impossible to install,
and every local model has a different, fast-moving Python API. Instead we define
a tiny contract and let the operator point at whatever they have running.

Local models matter for two real reasons:
  * cost — a full game is tens of thousands of lines; per-character API pricing
    stops being viable quickly;
  * privacy — some customers will not accept their voice, or their partner's
    voice, being uploaded to a third party. With a local model the audio never
    leaves the machine.

Contract (placeholders are substituted, no shell is involved):

  VOXSWAP_LOCAL_ASR_CMD
      must read {input} and write JSON to {output}:
      {"text": "...", "language": "en", "segments": [{"start": 0.0, "end": 1.2, "text": "..."}]}
      placeholders: {input} {output} {language}

  VOXSWAP_LOCAL_TTS_CMD
      must read the UTF-8 text in {text_file} and write a WAV to {output},
      cloning the voice in {speaker_wav}
      placeholders: {text_file} {output} {speaker_wav} {language} {emotion}

Example (Coqui XTTS v2 through a small wrapper script of your own):
  VOXSWAP_LOCAL_TTS_CMD="python tools/xtts_say.py --text {text_file} --speaker {speaker_wav} --lang {language} --out {output}"
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path

from ..audio import Audio, concat, read_wav, write_wav
from ..errors import ProviderError
from .base import BaseProvider, Segment, SynthesisRequest, Transcript

_TIMEOUT = int(os.environ.get("VOXSWAP_LOCAL_TIMEOUT", "900"))
_REFERENCE_SECONDS = 60          # XTTS-class models need only a short reference


def _command(env_var: str, what: str) -> str:
    value = os.environ.get(env_var, "").strip()
    if not value:
        raise ProviderError(
            f"{env_var} is not set, so the local provider cannot {what}",
            f"Set {env_var} in voxswap/.env — see docs/05-PROVIDERS.md for the contract.",
        )
    return value


def _run(template: str, mapping: dict[str, str], what: str) -> None:
    args = [part.format(**mapping) for part in shlex.split(template)]
    try:
        proc = subprocess.run(args, capture_output=True, timeout=_TIMEOUT, check=False)
    except FileNotFoundError as exc:
        raise ProviderError(f"local command not found: {args[0]}", f"Check the command in your .env ({what}).") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProviderError(f"local command timed out after {_TIMEOUT}s while trying to {what}",
                            "Raise VOXSWAP_LOCAL_TIMEOUT or use a smaller model.") from exc
    except KeyError as exc:
        raise ProviderError(f"unknown placeholder {exc} in the local command template",
                            "Allowed: {input} {output} {language} {text_file} {speaker_wav} {emotion}") from exc
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-5:]
        raise ProviderError(f"local command failed while trying to {what}", " / ".join(tail) or "no stderr")


class LocalASR(BaseProvider):
    name = "local"

    def transcribe(self, path: Path, *, language: str = "") -> Transcript:
        template = _command("VOXSWAP_LOCAL_ASR_CMD", "transcribe")
        out = path.with_suffix(".asr.json")
        _run(template, {"input": str(path), "output": str(out), "language": language.split("-")[0] or "auto"},
             f"transcribe {path.name}")
        if not out.exists():
            raise ProviderError(f"local ASR wrote no JSON for {path.name}",
                                "The command must write its result to the {output} path.")
        data = json.loads(out.read_text(encoding="utf-8"))
        segments = [
            Segment(int(float(s.get("start", 0)) * 1000), int(float(s.get("end", 0)) * 1000), str(s.get("text", "")).strip())
            for s in (data.get("segments") or [])
        ]
        return Transcript(text=str(data.get("text", "")).strip(), language=str(data.get("language", "") or language),
                          segments=segments)


class LocalVoice(BaseProvider):
    """Zero-shot local cloning: the 'voice' is a reference WAV on disk."""

    name = "local"

    def __init__(self, voice_dir: Path | None = None) -> None:
        self.voice_dir = voice_dir or Path(os.environ.get("VOXSWAP_LOCAL_VOICE_DIR", ".voices")).resolve()

    def ensure_voice(self, voice_id: str, label: str, samples: list[Path], *, consent_ref: str) -> str:
        if not samples:
            raise ProviderError(f"no samples for voice {voice_id!r}", "Add WAV files to the voice's samples_dir.")
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        reference = self.voice_dir / f"{voice_id}.wav"
        if reference.exists():
            return str(reference)

        # Build one clean reference clip: concatenating a minute of varied
        # speech clones far better than a single short take.
        merged: Audio | None = None
        for sample in samples:
            try:
                audio = read_wav(sample)
            except Exception:                            # noqa: BLE001 - skip unreadable samples, report if none work
                continue
            merged = audio if merged is None else concat(merged, audio)
            if merged.duration_ms >= _REFERENCE_SECONDS * 1000:
                break
        if merged is None:
            raise ProviderError(
                f"none of the samples for {voice_id!r} could be read",
                "Convert them to PCM WAV (install ffmpeg and VoxSwap will do it automatically).",
            )
        write_wav(reference, merged)
        return str(reference)

    def synthesize(self, request: SynthesisRequest, out_path: Path) -> Path:
        template = _command("VOXSWAP_LOCAL_TTS_CMD", "synthesise speech")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        text_file = out_path.with_suffix(".txt")
        text_file.write_text(request.text, encoding="utf-8")
        _run(
            template,
            {
                "text_file": str(text_file),
                "output": str(out_path),
                "speaker_wav": request.provider_voice_id,
                "language": (request.language or "en").split("-")[0],
                "emotion": request.emotion or "neutral",
            },
            f"synthesise {len(request.text)} characters",
        )
        text_file.unlink(missing_ok=True)
        if not out_path.exists():
            raise ProviderError("local TTS produced no audio", "The command must write a WAV to the {output} path.")
        return out_path

    def delete_voice(self, provider_voice_id: str) -> None:
        Path(provider_voice_id).unlink(missing_ok=True)
