"""ElevenLabs adapter: voice cloning, TTS, and speech-to-text.

This is the fastest path to a shippable product: instant voice cloning from a
couple of minutes of audio, multilingual output from the same clone, and a
hosted ASR endpoint. The trade-offs are that you are sending a real person's
voice to a third party, and that per-character pricing dominates your unit cost
on a full game.

Every endpoint, model ID and output format is env-overridable, because hosted
APIs change and a paying customer's job should never be blocked waiting for a
code change:

    VOXSWAP_ELEVEN_BASE, VOXSWAP_ELEVEN_TTS_MODEL,
    VOXSWAP_ELEVEN_STT_MODEL, VOXSWAP_ELEVEN_OUTPUT_FORMAT

Read docs/05-PROVIDERS.md before changing any of them.
"""

from __future__ import annotations

import json
import os
import wave
from pathlib import Path

from ..config import secret
from ..errors import ProviderError
from .base import BaseProvider, Segment, SynthesisRequest, Transcript
from .http import delete as http_delete
from .http import post_binary, post_multipart

# "pcm_24000" gives us headerless 24 kHz PCM, which we can wrap into a WAV with
# the stdlib. Asking for mp3 would force an ffmpeg dependency for decoding.
_DEFAULT_FORMAT = "pcm_24000"
_PCM_RATES = {"pcm_16000": 16000, "pcm_22050": 22050, "pcm_24000": 24000, "pcm_44100": 44100}


def _base() -> str:
    return os.environ.get("VOXSWAP_ELEVEN_BASE", "https://api.elevenlabs.io/v1").rstrip("/")


def _headers() -> dict[str, str]:
    return {"xi-api-key": secret("ELEVENLABS_API_KEY", required=True, provider="elevenlabs")}


class ElevenLabsVoice(BaseProvider):
    name = "elevenlabs"

    def __init__(self) -> None:
        self.model = os.environ.get("VOXSWAP_ELEVEN_TTS_MODEL", "eleven_multilingual_v2")
        self.output_format = os.environ.get("VOXSWAP_ELEVEN_OUTPUT_FORMAT", _DEFAULT_FORMAT)
        self._cache: dict[str, str] = {}

    # -- cloning ---------------------------------------------------------

    def ensure_voice(self, voice_id: str, label: str, samples: list[Path], *, consent_ref: str) -> str:
        """Create the clone once and remember it.

        The provider-side name embeds our order-local voice ID and the consent
        reference, so an audit of the ElevenLabs account can be tied back to a
        signed consent record without opening this repo.
        """
        if voice_id in self._cache:
            return self._cache[voice_id]
        if not samples:
            raise ProviderError(
                f"no usable samples for voice {voice_id!r}",
                "ElevenLabs instant cloning needs at least ~1 minute of clean speech.",
            )

        data = post_multipart(
            f"{_base()}/voices/add",
            fields={
                "name": f"voxswap-{voice_id}-{consent_ref}",
                "description": f"VoxSwap clone of {label}. Consent: {consent_ref}.",
                "labels": json.dumps({"voxswap_voice_id": voice_id, "consent_ref": consent_ref}),
            },
            files=[("files", p) for p in samples],
            headers=_headers(),
            provider="elevenlabs",
            what=f"clone voice {voice_id!r}",
        )
        provider_id = data.get("voice_id") or ""
        if not provider_id:
            raise ProviderError(
                f"ElevenLabs did not return a voice_id for {voice_id!r}",
                f"Response was: {json.dumps(data)[:300]}",
            )
        self._cache[voice_id] = provider_id
        return provider_id

    def delete_voice(self, provider_voice_id: str) -> None:
        """Destroy the clone provider-side. Required for consent withdrawal."""
        http_delete(
            f"{_base()}/voices/{provider_voice_id}",
            _headers(),
            provider="elevenlabs",
            what=f"delete voice {provider_voice_id}",
        )
        for key, value in list(self._cache.items()):
            if value == provider_voice_id:
                del self._cache[key]

    # -- synthesis -------------------------------------------------------

    def synthesize(self, request: SynthesisRequest, out_path: Path) -> Path:
        settings = _voice_settings(request.emotion, request.style)
        payload: dict[str, object] = {
            "text": request.text,
            "model_id": self.model,
            "voice_settings": settings,
        }
        if request.language:
            payload["language_code"] = request.language.split("-")[0]

        url = f"{_base()}/text-to-speech/{request.provider_voice_id}?output_format={self.output_format}"
        raw = post_binary(url, payload, _headers(), provider="elevenlabs",
                          what=f"synthesise {len(request.text)} characters")

        out_path.parent.mkdir(parents=True, exist_ok=True)
        if self.output_format in _PCM_RATES:
            _wrap_pcm(raw, out_path, _PCM_RATES[self.output_format])
        else:
            # Non-PCM (mp3/opus): write as-is and let the master stage convert
            # it with ffmpeg. Fails loudly there if ffmpeg is missing.
            out_path.with_suffix(_ext_for(self.output_format)).write_bytes(raw)
            return out_path.with_suffix(_ext_for(self.output_format))
        return out_path


class ElevenLabsASR(BaseProvider):
    name = "elevenlabs"

    def __init__(self) -> None:
        self.model = os.environ.get("VOXSWAP_ELEVEN_STT_MODEL", "scribe_v1")

    def transcribe(self, path: Path, *, language: str = "") -> Transcript:
        fields = {"model_id": self.model}
        if language:
            fields["language_code"] = language.split("-")[0]
        data = post_multipart(
            f"{_base()}/speech-to-text",
            fields=fields,
            files=[("file", path)],
            headers=_headers(),
            provider="elevenlabs",
            what=f"transcribe {path.name}",
        )
        text = (data.get("text") or "").strip()
        segments: list[Segment] = []
        for word in data.get("words") or []:            # word-level timings, when present
            if word.get("type") not in (None, "word"):
                continue
            segments.append(
                Segment(
                    start_ms=int(float(word.get("start", 0)) * 1000),
                    end_ms=int(float(word.get("end", 0)) * 1000),
                    text=str(word.get("text", "")),
                    speaker=str(word.get("speaker_id", "") or ""),
                )
            )
        return Transcript(text=text, language=data.get("language_code") or language, segments=segments)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _voice_settings(emotion: str, style: str) -> dict[str, float | bool]:
    """Map our emotion labels onto the provider's knobs.

    Lower stability = more expressive and more variable. Shouting and whispering
    need the room to move; narration does not.
    """
    stability, style_amount = 0.45, 0.35
    if emotion in ("angry", "shouting", "excited", "surprised"):
        stability, style_amount = 0.30, 0.65
    elif emotion in ("whisper", "sad", "tired", "pained"):
        stability, style_amount = 0.55, 0.45
    elif emotion == "neutral" and style in ("narration", "neutral"):
        stability, style_amount = 0.60, 0.20
    return {
        "stability": stability,
        "similarity_boost": 0.85,       # stay close to the customer's actual voice
        "style": style_amount,
        "use_speaker_boost": True,
    }


def _wrap_pcm(raw: bytes, out_path: Path, sample_rate: int) -> None:
    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(raw)


def _ext_for(output_format: str) -> str:
    if output_format.startswith("mp3"):
        return ".mp3"
    if output_format.startswith("opus") or output_format.startswith("ogg"):
        return ".ogg"
    if output_format.startswith("ulaw") or output_format.startswith("alaw"):
        return ".wav"
    return ".bin"
