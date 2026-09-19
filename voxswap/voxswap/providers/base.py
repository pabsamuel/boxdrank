"""Provider interfaces.

Three capabilities, three interfaces. Everything swappable sits behind these so
an order can name `"voice": "elevenlabs"` today and `"voice": "xtts_local"`
tomorrow without touching a stage.

Rules for every adapter:
  * Never print or log an API key.
  * Raise ProviderError with a fix, not a traceback.
  * Be idempotent where you can: `ensure_voice` must reuse an existing clone
    rather than creating a duplicate on every run.
  * Implement `delete_voice`. Consent can be withdrawn, and when it is we must
    be able to destroy the clone at the provider, not just locally.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable


@dataclass
class Segment:
    start_ms: int
    end_ms: int
    text: str
    speaker: str = ""


@dataclass
class Transcript:
    text: str
    language: str = ""
    segments: list[Segment] = field(default_factory=list)


@dataclass
class SynthesisRequest:
    text: str
    provider_voice_id: str
    language: str = ""
    style: str = "neutral"
    emotion: str = "neutral"
    target_duration_ms: int = 0     # a hint; timefit does the real work
    sample_rate: int = 48000
    channels: int = 1
    source_path: Path | None = None
    """The clip being replaced.

    Text-to-speech providers ignore this. Voice *conversion* providers cannot
    work without it: they keep the original performance — its timing, stress,
    pauses and emotion — and change only who is speaking. That is the difference
    between a line that sounds acted and one that sounds read aloud.
    """


@runtime_checkable
class ASRProvider(Protocol):
    name: str

    def transcribe(self, path: Path, *, language: str = "") -> Transcript: ...


@runtime_checkable
class TranslationProvider(Protocol):
    name: str

    def translate(self, texts: list[str], *, source: str, target: str, context: str = "",
                  length_match: bool = True) -> list[str]: ...


@runtime_checkable
class VoiceProvider(Protocol):
    name: str

    #: True when the provider rewrites an existing recording rather than
    #: speaking text. Such a provider cannot change the words, so it cannot
    #: dub into another language — the pipeline refuses that combination at
    #: intake rather than delivering audio that contradicts the script.
    converts_audio: bool

    def ensure_voice(self, voice_id: str, label: str, samples: list[Path], *, consent_ref: str) -> str: ...

    def synthesize(self, request: SynthesisRequest, out_path: Path) -> Path: ...

    def delete_voice(self, provider_voice_id: str) -> None: ...


class BaseProvider:
    """Shared plumbing. Adapters subclass this and set `name`."""

    name = "base"
    converts_audio = False

    def describe(self) -> str:
        return self.name

    # Adapters that cannot do something should say so clearly rather than
    # silently no-op — a silent no-op ships an untouched game to a customer.
    def _unsupported(self, what: str) -> None:
        from ..errors import ProviderError

        raise ProviderError(
            f"provider {self.name!r} cannot {what}",
            "Pick a different provider for this capability in order.json -> providers.",
        )
