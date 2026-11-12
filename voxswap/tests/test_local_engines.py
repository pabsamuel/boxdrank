"""The engines behind the resident TTS server.

These do not load a model — the point is the seam around it. The piper engine
is the one that can be wrong in a way nobody hears until a customer does:
piper has no cloning, so a reference clip it quietly ignores would ship a paying
customer a game in a stranger's voice.
"""

from __future__ import annotations

import sys
import unittest
import wave
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1] / "tools" / "local"
sys.path.insert(0, str(TOOLS))

from engines import piper as piper_engine        # noqa: E402 - needs the path above


class _FakeVoice:
    """Stands in for PiperVoice so the seam is testable with no model on disk."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def synthesize_wav(self, text: str, wav_file, syn_config=None) -> None:
        self.calls.append(text)
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(22050)
        wav_file.writeframes(b"\x00\x00" * 2205)


def _handle(preset_ok: bool, speaker_id: int | None = None) -> dict:
    return {"voice": _FakeVoice(), "speaker_id": speaker_id, "preset_ok": preset_ok,
            "name": "en-us-amy-low.onnx"}


class PiperEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = __import__("tempfile").TemporaryDirectory()
        self.out = Path(self._tmp.name) / "line.wav"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_a_reference_clip_is_refused_rather_than_ignored(self) -> None:
        """The whole product is 'the hero speaks in *your* voice'."""
        handle = _handle(preset_ok=False)
        with self.assertRaises(ValueError) as caught:
            piper_engine.synthesize(handle, "Cover me.", "/orders/X/voices/ayse/ref.wav",
                                    "en", "neutral", self.out)

        message = str(caught.exception)
        self.assertIn("cannot clone", message)
        self.assertIn("preset=yes", message, "the message must name the way out")
        self.assertEqual(handle["voice"].calls, [], "nothing may be synthesised")
        self.assertFalse(self.out.exists())

    def test_a_preset_voice_is_allowed_once_the_operator_says_so(self) -> None:
        handle = _handle(preset_ok=True)
        piper_engine.synthesize(handle, "Cover me.", "/orders/X/voices/ayse/ref.wav",
                                "en", "neutral", self.out)

        self.assertEqual(handle["voice"].calls, ["Cover me."])
        with wave.open(str(self.out)) as w:
            self.assertEqual(w.getframerate(), 22050)
            self.assertGreater(w.getnframes(), 0)

    def test_no_reference_clip_needs_no_opt_in(self) -> None:
        """A role with no voice bound to it is not a cloning request."""
        handle = _handle(preset_ok=False)
        piper_engine.synthesize(handle, "Halt.", "", "en", "neutral", self.out)
        self.assertEqual(handle["voice"].calls, ["Halt."])

    def test_the_language_code_is_not_smuggled_in(self) -> None:
        """A piper voice *is* its language; a code would silently do nothing."""
        handle = _handle(preset_ok=True)
        piper_engine.synthesize(handle, "Merhaba.", "", "tr", "angry", self.out)
        self.assertEqual(handle["voice"].calls, ["Merhaba."])


if __name__ == "__main__":
    unittest.main()
