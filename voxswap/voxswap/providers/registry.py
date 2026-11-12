"""Provider lookup.

Adapters are imported lazily so that a missing API key, a missing optional
package, or a provider you never use can never break an unrelated job. An
order names providers by string; this module turns those strings into objects.
"""

from __future__ import annotations

from typing import Any, Callable

from ..errors import ProviderError

ASR_PROVIDERS: dict[str, Callable[[], Any]] = {}
TRANSLATION_PROVIDERS: dict[str, Callable[[], Any]] = {}
VOICE_PROVIDERS: dict[str, Callable[[], Any]] = {}

#: Voice providers that rewrite an existing recording instead of speaking text.
#: Named here rather than discovered by instantiating every adapter, because
#: constructing a hosted adapter can demand a key for a provider this order
#: never uses.
VOICE_CONVERSION_PROVIDERS: set[str] = set()


def _register() -> None:
    from . import mock

    ASR_PROVIDERS["mock"] = mock.MockASR
    TRANSLATION_PROVIDERS["mock"] = mock.MockTranslation
    VOICE_PROVIDERS["mock"] = mock.MockVoice

    def eleven_voice() -> Any:
        from .elevenlabs import ElevenLabsVoice

        return ElevenLabsVoice()

    def eleven_asr() -> Any:
        from .elevenlabs import ElevenLabsASR

        return ElevenLabsASR()

    def openai_asr() -> Any:
        from .openai_asr import OpenAIASR

        return OpenAIASR()

    def claude_translation() -> Any:
        from .claude import ClaudeTranslation

        return ClaudeTranslation()

    def local_llm_translation() -> Any:
        from .local_llm import LocalLLMTranslation

        return LocalLLMTranslation()

    def local_asr() -> Any:
        from .local import LocalASR

        return LocalASR()

    def local_voice() -> Any:
        from .local import LocalVoice

        return LocalVoice()

    def local_vc() -> Any:
        from .local_vc import LocalVoiceConversion

        return LocalVoiceConversion()

    VOICE_PROVIDERS["elevenlabs"] = eleven_voice
    VOICE_PROVIDERS["local"] = local_voice
    VOICE_PROVIDERS["local_vc"] = local_vc
    VOICE_CONVERSION_PROVIDERS.add("local_vc")
    ASR_PROVIDERS["elevenlabs"] = eleven_asr
    ASR_PROVIDERS["openai"] = openai_asr
    ASR_PROVIDERS["local"] = local_asr
    TRANSLATION_PROVIDERS["claude"] = claude_translation
    TRANSLATION_PROVIDERS["local_llm"] = local_llm_translation


_register()


def _resolve(table: dict[str, Callable[[], Any]], name: str, kind: str) -> Any:
    factory = table.get(name)
    if factory is None:
        raise ProviderError(
            f"unknown {kind} provider {name!r}",
            f"Available: {', '.join(sorted(table))}. Set providers.{kind} in order.json.",
        )
    return factory()


def get_asr(name: str) -> Any:
    return _resolve(ASR_PROVIDERS, name, "asr")


def get_translation(name: str) -> Any:
    return _resolve(TRANSLATION_PROVIDERS, name, "translation")


def get_voice(name: str) -> Any:
    return _resolve(VOICE_PROVIDERS, name, "voice")


def catalogue() -> dict[str, list[str]]:
    return {
        "asr": sorted(ASR_PROVIDERS),
        "translation": sorted(TRANSLATION_PROVIDERS),
        "voice": sorted(VOICE_PROVIDERS),
    }
