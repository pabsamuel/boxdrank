"""Self-hosted providers: your machine, your models, no API bill.

Two reasons this matters more than it looks:

  * **cost** — a full game is tens of thousands of lines, and per-character
    pricing stops being viable long before you get there;
  * **privacy** — plenty of customers will not accept their partner's voice
    being uploaded to a third party. Locally, the audio never leaves the room,
    and that is a genuine selling point for this product specifically.

VoxSwap deliberately does not import torch or bundle a model: pinning a CUDA
stack would break the stdlib-only promise, and every local model has a
different, fast-moving API. Instead there are two seams.

**1. A resident server (recommended for TTS).** Set `VOXSWAP_LOCAL_TTS_URL` and
each line is a POST instead of a process. This matters enormously: a per-line
subprocess reloads gigabytes of weights for every utterance. `tools/local/tts_server.py`
is the other end, and loads the model once.

    VOXSWAP_LOCAL_TTS_URL=http://127.0.0.1:8123/tts
    -> POST {"text", "speaker_wav", "language", "emotion"} -> WAV bytes

**2. A command per call**, for anything you would rather drive from the shell.
Placeholders are substituted and no shell is involved, so quoting cannot bite:

  VOXSWAP_LOCAL_ASR_CMD
      reads {input}, writes JSON to {output}:
      {"text": "...", "language": "en", "segments": [{"start": 0.0, "end": 1.2, "text": "..."}]}
      placeholders: {input} {output} {language}
      ready-made: tools/local/whisper_cpp.py

  VOXSWAP_LOCAL_TTS_CMD
      reads the UTF-8 text in {text_file}, clones {speaker_wav}, writes a WAV to {output}
      placeholders: {text_file} {output} {speaker_wav} {language} {emotion}

For local *transcription* there is a third option that needs no code at all:
whisper.cpp's server speaks the OpenAI transcription API, so
`"asr": "openai"` with `VOXSWAP_OPENAI_BASE` pointed at it works directly, with
no key. See docs/11-RUNNING-LOCAL.md.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path

from urllib.parse import urlparse

from ..audio import Audio, concat, read_wav, write_wav
from ..errors import ProviderError
from .base import BaseProvider, Segment, SynthesisRequest, Transcript
from .http import post_binary

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
        # Prefer a resident server when one is configured: a per-line
        # subprocess reloads several gigabytes of weights for every utterance,
        # which turns a 3,000-line game into days of model loading.
        # tools/local/tts_server.py is the other end of this.
        self.server_url = os.environ.get("VOXSWAP_LOCAL_TTS_URL", "").strip()
        self.timeout = int(os.environ.get("VOXSWAP_LOCAL_TIMEOUT", "900"))

    def _synthesize_over_http(self, request: SynthesisRequest, out_path: Path) -> Path:
        host = (urlparse(self.server_url).hostname or "").lower()
        raw = post_binary(
            self.server_url,
            {
                "text": request.text,
                "speaker_wav": request.provider_voice_id,
                "language": (request.language or "en").split("-")[0],
                "emotion": request.emotion or "neutral",
                "sample_rate": request.sample_rate,
            },
            {"Accept": "audio/wav"},
            provider=f"local TTS server ({self.server_url})",
            what=f"synthesise {len(request.text)} characters",
            timeout=self.timeout,
            retries=1,              # a local server that is down stays down
            bypass_proxy=host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"),
        )
        if not raw.startswith(b"RIFF"):
            raise ProviderError(
                "the local TTS server did not return a WAV",
                f"It replied with {raw[:120]!r}. Check the server log; "
                "it should answer POSTs with audio/wav bytes.",
            )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(raw)
        return out_path

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
        if self.server_url:
            return self._synthesize_over_http(request, out_path)
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
