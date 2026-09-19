"""Whisper-family ASR over any OpenAI-compatible transcription endpoint.

Only ASR. Translation goes through `claude` or `local_llm`, and voice cloning
through ElevenLabs or a local model — this adapter exists because Whisper is
cheap, accurate on game dialogue, and returns segment timings, which is exactly
what the `plan` stage needs.

**It also covers local transcription**, because whisper.cpp's server and most
local runners expose the same `/v1/audio/transcriptions` endpoint. Point the
base URL at your own machine and no key is needed:

    VOXSWAP_OPENAI_BASE=http://127.0.0.1:8080/v1     # whisper.cpp --port 8080

Env: OPENAI_API_KEY, VOXSWAP_OPENAI_BASE, VOXSWAP_OPENAI_ASR_MODEL
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from ..config import secret
from .base import BaseProvider, Segment, Transcript
from .http import post_multipart


class OpenAIASR(BaseProvider):
    name = "openai"

    def __init__(self) -> None:
        self.base = os.environ.get("VOXSWAP_OPENAI_BASE", "https://api.openai.com/v1").rstrip("/")
        self.model = os.environ.get("VOXSWAP_OPENAI_ASR_MODEL", "whisper-1")
        host = (urlparse(self.base).hostname or "").lower()
        # A whisper.cpp server on your own machine has no API key and must not
        # be sent through a corporate proxy.
        self.is_local = host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local")

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

        key = secret("OPENAI_API_KEY", required=not self.is_local, provider="openai")
        data = post_multipart(
            f"{self.base}/audio/transcriptions",
            fields=fields,
            files=[("file", path)],
            headers={"Authorization": f"Bearer {key or 'local'}"},
            provider=f"openai ({self.base})" if self.is_local else "openai",
            what=f"transcribe {path.name}",
            bypass_proxy=self.is_local,
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
