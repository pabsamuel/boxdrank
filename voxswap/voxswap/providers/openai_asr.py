"""Whisper-family ASR over the OpenAI API.

Only ASR. Translation goes through Claude (providers/claude.py) and voice
cloning through ElevenLabs or a local model — this adapter exists because
Whisper is cheap, accurate on game dialogue, and returns segment timings, which
is exactly what the `plan` stage needs.

Env: OPENAI_API_KEY, VOXSWAP_OPENAI_BASE, VOXSWAP_OPENAI_ASR_MODEL
"""

from __future__ import annotations

import os
from pathlib import Path

from ..config import secret
from .base import BaseProvider, Segment, Transcript
from .http import post_multipart


class OpenAIASR(BaseProvider):
    name = "openai"

    def __init__(self) -> None:
        self.base = os.environ.get("VOXSWAP_OPENAI_BASE", "https://api.openai.com/v1").rstrip("/")
        self.model = os.environ.get("VOXSWAP_OPENAI_ASR_MODEL", "whisper-1")

    def transcribe(self, path: Path, *, language: str = "") -> Transcript:
        fields = {
            "model": self.model,
            # verbose_json is the only format that carries segment timings, and
            # timings are what let us keep lip-sync on long clips.
            "response_format": "verbose_json",
            "temperature": "0",
        }
        if language:
            fields["language"] = language.split("-")[0]

        data = post_multipart(
            f"{self.base}/audio/transcriptions",
            fields=fields,
            files=[("file", path)],
            headers={"Authorization": f"Bearer {secret('OPENAI_API_KEY', required=True, provider='openai')}"},
            provider="openai",
            what=f"transcribe {path.name}",
        )

        segments = [
            Segment(
                start_ms=int(float(s.get("start", 0)) * 1000),
                end_ms=int(float(s.get("end", 0)) * 1000),
                text=str(s.get("text", "")).strip(),
            )
            for s in (data.get("segments") or [])
        ]
        return Transcript(
            text=(data.get("text") or "").strip(),
            language=data.get("language") or language,
            segments=segments,
        )
