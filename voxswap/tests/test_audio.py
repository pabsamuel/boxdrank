"""Audio toolkit: the parts that decide whether a line sounds right."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from voxswap.audio import (
    Audio, concat, duck, estimate_lufs, fit_to_slot, normalize_to, ola_stretch,
    overlay, pad_to, peak, probe_wav, read_wav, resample, rms, silence,
    to_channels, tone, trim_silence, write_wav,
)


class WavIOTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_roundtrip_preserves_shape(self) -> None:
        clip = tone(500, sample_rate=16000, channels=2)
        path = self.tmp / "a.wav"
        write_wav(path, clip)
        back = read_wav(path)
        self.assertEqual(back.sample_rate, 16000)
        self.assertEqual(back.channels, 2)
        self.assertEqual(back.duration_ms, clip.duration_ms)
        self.assertEqual(len(back.samples), len(clip.samples))

    def test_probe_matches_read(self) -> None:
        path = self.tmp / "b.wav"
        write_wav(path, tone(750, sample_rate=24000))
        duration, rate, channels = probe_wav(path)
        self.assertEqual((duration, rate, channels), (750, 24000, 1))

    def test_silence_has_no_level(self) -> None:
        self.assertEqual(rms(silence(200)), 0.0)
        self.assertEqual(peak(silence(200)), 0.0)

    def test_resample_keeps_duration(self) -> None:
        out = resample(tone(1000, sample_rate=48000), 24000)
        self.assertEqual(out.sample_rate, 24000)
        self.assertAlmostEqual(out.duration_ms, 1000, delta=5)

    def test_channel_conversion_is_reversible_in_length(self) -> None:
        stereo = to_channels(tone(400, sample_rate=16000), 2)
        self.assertEqual(stereo.channels, 2)
        self.assertAlmostEqual(stereo.duration_ms, 400, delta=2)
        mono = to_channels(stereo, 1)
        self.assertEqual(mono.channels, 1)
        self.assertAlmostEqual(mono.duration_ms, 400, delta=2)


class EditingTests(unittest.TestCase):
    def test_trim_silence_removes_dead_air(self) -> None:
        padded = concat(concat(silence(400, 16000), tone(600, sample_rate=16000)), silence(400, 16000))
        trimmed = trim_silence(padded)
        self.assertLess(trimmed.duration_ms, padded.duration_ms)
        self.assertGreater(trimmed.duration_ms, 500)      # the speech itself survives

    def test_pad_to_reaches_the_slot(self) -> None:
        out = pad_to(tone(300, sample_rate=16000), 1000)
        self.assertAlmostEqual(out.duration_ms, 1000, delta=2)

    def test_pad_both_centres_the_clip(self) -> None:
        out = pad_to(tone(300, sample_rate=16000), 1100, where="both")
        self.assertAlmostEqual(out.duration_ms, 1100, delta=2)
        self.assertEqual(rms(Audio(out.samples[:1000], out.sample_rate, 1)), 0.0)

    def test_overlay_mixes_at_the_right_offset(self) -> None:
        base = silence(2000, 16000)
        mixed = overlay(base, tone(300, sample_rate=16000), 1000)
        head = Audio(mixed.samples[: 16000 * 900 // 1000], 16000, 1)
        body = Audio(mixed.samples[16000 * 1050 // 1000 : 16000 * 1200 // 1000], 16000, 1)
        self.assertEqual(rms(head), 0.0)
        self.assertGreater(rms(body), 0.0)

    def test_overlay_extends_when_the_clip_runs_past_the_end(self) -> None:
        mixed = overlay(silence(500, 16000), tone(400, sample_rate=16000), 400)
        self.assertGreaterEqual(mixed.duration_ms, 800)

    def test_duck_attenuates_only_its_span(self) -> None:
        bed = tone(3000, sample_rate=16000, amplitude=0.5)
        ducked = duck(bed, 1000, 2000, factor=0.1, fade_ms=50)
        inside = Audio(ducked.samples[16000 * 1200 // 1000 : 16000 * 1800 // 1000], 16000, 1)
        outside = Audio(ducked.samples[: 16000 * 800 // 1000], 16000, 1)
        self.assertLess(rms(inside), rms(outside) * 0.3)


class TimeFitTests(unittest.TestCase):
    def test_ola_stretch_shortens_and_lengthens(self) -> None:
        clip = tone(2000, sample_rate=16000)
        shorter = ola_stretch(clip, 1.25)
        longer = ola_stretch(clip, 0.8)
        self.assertAlmostEqual(shorter.duration_ms, 1600, delta=60)
        self.assertAlmostEqual(longer.duration_ms, 2500, delta=80)

    def test_ola_stretch_keeps_the_signal(self) -> None:
        """A stretch that silences the audio is worse than no stretch at all."""
        clip = tone(1500, sample_rate=16000, amplitude=0.3)
        out = ola_stretch(clip, 1.15)
        self.assertGreater(rms(out), rms(clip) * 0.5)

    def test_fit_pads_a_slightly_short_take(self) -> None:
        """A small gap is filled with silence — slowing speech down would be
        more audible than the pause."""
        result = fit_to_slot(tone(760, sample_rate=16000), 840, tolerance_ms=50)
        self.assertEqual(result.strategy, "padded")
        self.assertAlmostEqual(result.audio.duration_ms, 840, delta=5)

    def test_fit_compresses_a_long_take(self) -> None:
        result = fit_to_slot(tone(1200, sample_rate=16000), 1000, max_stretch=1.3, tolerance_ms=50)
        self.assertEqual(result.strategy, "compressed")
        self.assertAlmostEqual(result.audio.duration_ms, 1000, delta=60)

    def test_fit_flags_overflow_instead_of_cutting_the_line(self) -> None:
        result = fit_to_slot(tone(3000, sample_rate=16000), 1000, max_stretch=1.1, tolerance_ms=50)
        self.assertEqual(result.strategy, "overflow")
        self.assertGreater(result.delta_ms, 0)
        self.assertIn("max_stretch", result.note)
        self.assertGreater(result.audio.duration_ms, 1000)    # nothing was chopped off

    def test_fit_expands_a_very_short_take(self) -> None:
        """A big gap is closed by slowing the take, then padding the remainder."""
        result = fit_to_slot(tone(500, sample_rate=16000), 1000, max_stretch=1.3, tolerance_ms=50)
        self.assertEqual(result.strategy, "expanded")
        self.assertAlmostEqual(result.audio.duration_ms, 1000, delta=10)

    def test_preserve_timing_off_leaves_length_alone(self) -> None:
        result = fit_to_slot(tone(1800, sample_rate=16000), 500, preserve_timing=False)
        self.assertEqual(result.strategy, "as-is")
        self.assertGreater(result.audio.duration_ms, 1000)


class LoudnessTests(unittest.TestCase):
    def test_silence_reads_as_no_loudness(self) -> None:
        self.assertLess(estimate_lufs(silence(1000, 16000)), -90)

    def test_louder_signal_measures_louder(self) -> None:
        quiet = estimate_lufs(tone(1000, sample_rate=16000, amplitude=0.05))
        loud = estimate_lufs(tone(1000, sample_rate=16000, amplitude=0.5))
        self.assertGreater(loud, quiet + 10)

    def test_normalize_moves_towards_the_target(self) -> None:
        clip = tone(1000, sample_rate=16000, amplitude=0.02)
        out, measured, applied = normalize_to(clip, -18.0)
        self.assertGreater(applied, 0)
        self.assertAlmostEqual(estimate_lufs(out), -18.0, delta=2.0)
        self.assertLess(measured, -18.0)

    def test_normalize_never_clips(self) -> None:
        clip = tone(1000, sample_rate=16000, amplitude=0.95)
        out, _, _ = normalize_to(clip, 0.0)
        self.assertLess(peak(out), 1.0)


if __name__ == "__main__":
    unittest.main()
