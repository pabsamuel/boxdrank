"""Provider registry and the offline providers."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voxswap.audio import read_wav, tone, write_wav
from voxswap.errors import ProviderError
from voxswap.providers import catalogue, get_asr, get_translation, get_voice
from voxswap.providers.base import SynthesisRequest
from voxswap.providers.mock import MockASR, MockTranslation, MockVoice


class RegistryTests(unittest.TestCase):
    def test_every_capability_has_an_offline_option(self) -> None:
        for kind, names in catalogue().items():
            self.assertIn("mock", names, f"{kind} has no offline provider")

    def test_unknown_provider_lists_the_alternatives(self) -> None:
        with self.assertRaises(ProviderError) as caught:
            get_voice("wishful-thinking")
        self.assertIn("mock", caught.exception.hint)

    def test_real_adapters_load_without_keys(self) -> None:
        """Importing an adapter must not require credentials — only calling it does."""
        self.assertEqual(get_asr("openai").name, "openai")
        self.assertEqual(get_voice("elevenlabs").name, "elevenlabs")
        self.assertEqual(get_translation("claude").name, "claude")


class MockProviderTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_asr_prefers_a_sidecar_transcript(self) -> None:
        clip = self.tmp / "line.wav"
        write_wav(clip, tone(600, sample_rate=8000))
        clip.with_suffix(".txt").write_text("Exactly this.", encoding="utf-8")
        self.assertEqual(MockASR().transcribe(clip).text, "Exactly this.")

    def test_asr_falls_back_to_the_filename(self) -> None:
        clip = self.tmp / "hero_takes_cover.wav"
        write_wav(clip, tone(600, sample_rate=8000))
        self.assertIn("Hero takes cover", MockASR().transcribe(clip).text)

    def test_translation_is_deterministic_and_marked(self) -> None:
        provider = MockTranslation()
        first = provider.translate(["Hold the line."], source="en", target="tr")
        second = provider.translate(["Hold the line."], source="en", target="tr")
        self.assertEqual(first, second)
        self.assertTrue(first[0].startswith("[tr]"))

    def test_translation_keeps_the_line_count(self) -> None:
        texts = ["One.", "Two.", "Three."]
        self.assertEqual(len(MockTranslation().translate(texts, source="en", target="de")), 3)

    def test_cloning_needs_samples(self) -> None:
        with self.assertRaises(ProviderError):
            MockVoice().ensure_voice("v", "Someone", [], consent_ref="C-1")

    def test_cloning_is_idempotent(self) -> None:
        provider = MockVoice()
        sample = self.tmp / "s.wav"
        write_wav(sample, tone(1000, sample_rate=8000))
        first = provider.ensure_voice("v", "Someone", [sample], consent_ref="C-1")
        second = provider.ensure_voice("v", "Someone", [sample], consent_ref="C-1")
        self.assertEqual(first, second)

    def test_synthesis_is_reproducible_byte_for_byte(self) -> None:
        provider = MockVoice()
        request = SynthesisRequest(text="Same words, same voice.", provider_voice_id="mock-1", sample_rate=8000)
        a = provider.synthesize(request, self.tmp / "a.wav").read_bytes()
        b = provider.synthesize(request, self.tmp / "b.wav").read_bytes()
        self.assertEqual(a, b)

    def test_longer_text_makes_longer_audio(self) -> None:
        provider = MockVoice()
        short = provider.synthesize(SynthesisRequest(text="Go.", provider_voice_id="m", sample_rate=8000),
                                    self.tmp / "s.wav")
        long = provider.synthesize(
            SynthesisRequest(text="Go now, before the whole district wakes up and finds us here.",
                             provider_voice_id="m", sample_rate=8000),
            self.tmp / "l.wav")
        self.assertGreater(read_wav(long).duration_ms, read_wav(short).duration_ms)

    def test_deleting_a_voice_forgets_it(self) -> None:
        provider = MockVoice()
        sample = self.tmp / "s.wav"
        write_wav(sample, tone(1000, sample_rate=8000))
        provider_id = provider.ensure_voice("v", "Someone", [sample], consent_ref="C-1")
        provider.delete_voice(provider_id)
        self.assertEqual(provider._voices, {})


if __name__ == "__main__":
    unittest.main()
