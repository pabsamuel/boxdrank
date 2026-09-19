"""Offline providers. No network, no API keys, no cost, deterministic.

These are not a toy. They are how you:
  * run the whole pipeline on a new order before spending money,
  * reproduce a customer's bug on your laptop on a plane,
  * keep CI honest (tests must never call a paid API).

The audio they produce is a buzz, not speech — but it has the right duration,
the right format, the right loudness and the right filename, so every stage
after synthesis is exercised for real.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from ..audio import Audio, read_wav, tone, write_wav
from ..ids import short_hash
from .base import BaseProvider, Segment, SynthesisRequest, Transcript

_WORD = re.compile(r"[\w']+")
_MS_PER_WORD = 380            # ~158 wpm, a normal dialogue pace


def _stable_float(*parts: str) -> float:
    """Deterministic 0..1 from the inputs, so runs are reproducible."""
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") / 0xFFFFFFFF


class MockASR(BaseProvider):
    """Reads a sidecar `.txt` next to the clip if present, else invents text.

    The sidecar rule is the useful part: fixtures and real orders can carry
    ground-truth transcripts, so you can test the rest of the pipeline with
    exact text and no ASR bill.
    """

    name = "mock"

    def transcribe(self, path: Path, *, language: str = "") -> Transcript:
        sidecar = path.with_suffix(".txt")
        duration_ms = 0
        try:
            duration_ms = read_wav(path).duration_ms
        except Exception:                                  # noqa: BLE001 - probing is best effort here
            duration_ms = 0

        if sidecar.exists():
            text = sidecar.read_text(encoding="utf-8").strip()
        else:
            stem = re.sub(r"[_\-.]+", " ", path.stem).strip()
            text = f"{stem.capitalize()}."
        return Transcript(
            text=text,
            language=language or "en",
            segments=[Segment(0, duration_ms or len(text) * 60, text)],
        )


class MockTranslation(BaseProvider):
    """Marks text as translated without changing meaning, and simulates the
    length drift real translation causes (target languages are rarely the same
    length), so the time-fitting code gets a realistic workout."""

    name = "mock"

    def translate(self, texts: list[str], *, source: str, target: str, context: str = "",
                  length_match: bool = True) -> list[str]:
        out: list[str] = []
        for text in texts:
            drift = 0.9 + 0.35 * _stable_float(text, target)     # 0.90x - 1.25x
            words = _WORD.findall(text)
            want = max(1, int(round(len(words) * drift)))
            if want <= len(words):
                body = " ".join(words[:want])
            else:
                body = " ".join(words + words[: want - len(words)])
            out.append(f"[{target}] {body}".strip())
        return out


class MockVoice(BaseProvider):
    """Synthesises a voice-shaped buzz whose pitch is derived from the voice ID.

    Two deliberate behaviours:
      * duration comes from the word count, not from `target_duration_ms`, and
        is then skewed by a stable ±18% — so lines land both long and short and
        timefit has to do real work;
      * the same (voice, text) always yields the same audio, so tests can
        assert on bytes.
    """

    name = "mock"

    def __init__(self) -> None:
        self._voices: dict[str, str] = {}

    def ensure_voice(self, voice_id: str, label: str, samples: list[Path], *, consent_ref: str) -> str:
        if voice_id in self._voices:
            return self._voices[voice_id]
        if not samples:
            from ..errors import ProviderError

            raise ProviderError(
                f"no voice samples found for {voice_id!r}",
                "Put at least one WAV in the voice's samples_dir.",
            )
        provider_id = f"mock-{short_hash(voice_id, consent_ref, length=8)}"
        self._voices[voice_id] = provider_id
        return provider_id

    def synthesize(self, request: SynthesisRequest, out_path: Path) -> Path:
        words = max(1, len(_WORD.findall(request.text)))
        skew = 0.82 + 0.36 * _stable_float(request.text, request.provider_voice_id)
        duration_ms = max(240, int(words * _MS_PER_WORD * skew))

        base_freq = 96 + 88 * _stable_float(request.provider_voice_id)
        if request.emotion in ("angry", "excited", "shouting"):
            base_freq *= 1.09
        elif request.emotion in ("sad", "whisper", "tired"):
            base_freq *= 0.93

        audio: Audio = tone(
            duration_ms,
            freq=base_freq,
            sample_rate=request.sample_rate,
            channels=request.channels,
            amplitude=0.30 if request.emotion in ("angry", "shouting") else 0.22,
        )
        write_wav(out_path, audio)
        return out_path

    def delete_voice(self, provider_voice_id: str) -> None:
        for key, value in list(self._voices.items()):
            if value == provider_voice_id:
                del self._voices[key]
