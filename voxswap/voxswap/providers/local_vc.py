"""Local voice *conversion* — keep the performance, change the performer.

This is the provider the product actually wants, and it is worth being precise
about why, because it is not the obvious choice.

Text-to-speech reads a line out. Everything about *how* it is delivered — the
pause before a threat, the break in a voice, the shout — is invented by the
model from a bare string, and models invent flatly. A game's dialogue was
performed by an actor who made those choices deliberately, and a TTS rebuild
throws all of it away. That is what "robotic" means in practice: not a bad
timbre, a missing performance.

Voice conversion takes the original recording and changes only *who* is
speaking. Timing, stress, pauses, breath, emotion — all of it survives, because
none of it is regenerated. The line still sounds acted, because it still is.

It buys three things beyond naturalness:

  * **lip-sync is free.** The output is the same length as the input to within a
    few milliseconds, so the fitting stage has almost nothing to correct, and
    every correction is a chance to add an artefact;
  * **no transcript is needed**, so no ASR bill and no transcription mistakes
    put words in a character's mouth;
  * **emotion labels stop mattering**, which removes a whole class of wrong.

The one thing it cannot do is change the words. A conversion provider speaks
whatever the original said, so it cannot dub into another language — intake
refuses that combination rather than shipping audio that contradicts the
delivered script.

Set `VOXSWAP_LOCAL_VC_URL` and run `tools/local/tts_server.py --engine freevc`.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from ..errors import ProviderError
from .base import BaseProvider, SynthesisRequest
from .http import post_binary
from .local import LocalVoice


class LocalVoiceConversion(BaseProvider):
    """Reference-based conversion over the resident server."""

    name = "local_vc"
    converts_audio = True

    def __init__(self, voice_dir: Path | None = None) -> None:
        # The reference clip is built exactly as for local TTS: a concatenation
        # of the customer's samples. Sharing that code means one behaviour to
        # get right, and a voice built for one provider works for the other.
        self._voices = LocalVoice(voice_dir)
        self.server_url = os.environ.get("VOXSWAP_LOCAL_VC_URL", "").strip()
        self.timeout = int(os.environ.get("VOXSWAP_LOCAL_TIMEOUT", "900"))

    def ensure_voice(self, voice_id: str, label: str, samples: list[Path], *, consent_ref: str) -> str:
        return self._voices.ensure_voice(voice_id, label, samples, consent_ref=consent_ref)

    def delete_voice(self, provider_voice_id: str) -> None:
        self._voices.delete_voice(provider_voice_id)

    def synthesize(self, request: SynthesisRequest, out_path: Path) -> Path:
        if not self.server_url:
            raise ProviderError(
                "VOXSWAP_LOCAL_VC_URL is not set, so the local_vc provider has nowhere to send audio",
                "Start the server:\n"
                "  python3 tools/local/tts_server.py --engine freevc --port 8124\n"
                "then set VOXSWAP_LOCAL_VC_URL=http://127.0.0.1:8124/vc in voxswap/.env",
            )
        source = request.source_path
        if source is None or not Path(source).exists():
            # Without the original there is nothing to convert. Returning
            # silence, or the reference clip, would ship a wrong line.
            raise ProviderError(
                f"no source recording to convert for this line ({source or 'none given'})",
                "Voice conversion rewrites an existing clip. If the line has no audio of its own, "
                'use a text-to-speech voice provider ("local") for this order instead.',
            )

        host = (urlparse(self.server_url).hostname or "").lower()
        raw = post_binary(
            self.server_url,
            {
                "source_wav": str(Path(source).resolve()),
                "speaker_wav": request.provider_voice_id,
                "sample_rate": request.sample_rate,
            },
            {"Accept": "audio/wav"},
            provider=f"local VC server ({self.server_url})",
            what=f"convert {Path(source).name}",
            timeout=self.timeout,
            retries=1,                      # a local server that is down stays down
            bypass_proxy=host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"),
        )
        if not raw.startswith(b"RIFF"):
            raise ProviderError(
                "the local VC server did not return a WAV",
                f"It replied with {raw[:120]!r}. Check the server log; "
                "it should answer POSTs with audio/wav bytes.",
            )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(raw)
        return out_path
