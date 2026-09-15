"""Swappable ASR / translation / voice providers."""

from .base import ASRProvider, Segment, SynthesisRequest, Transcript, TranslationProvider, VoiceProvider  # noqa: F401
from .registry import catalogue, get_asr, get_translation, get_voice  # noqa: F401

__all__ = [
    "ASRProvider", "TranslationProvider", "VoiceProvider",
    "Segment", "Transcript", "SynthesisRequest",
    "get_asr", "get_translation", "get_voice", "catalogue",
]
