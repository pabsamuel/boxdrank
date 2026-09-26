"""The ffmpeg code paths.

Every other test pins a non-existent ffmpeg binary so the stdlib fallbacks are
what gets exercised. These do the opposite: they only run where ffmpeg is
actually installed, and they cover the branches that a real operator hits and a
fallback-only suite never would — decoding non-WAV input, re-encoding back to
the game's own format, `atempo` stretching, `loudnorm`, probing, and streaming a
film's audio through the mixdown.

They skip cleanly when ffmpeg is absent, so the suite stays runnable on a bare
machine. CI runs half its matrix with ffmpeg installed so these do not quietly
never run.
"""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from voxswap.audio import ffmpeg as ff
from voxswap.audio import read_wav, rms, tone, write_wav
from voxswap.audio.mixdown import Cue, build_track
from voxswap.audio.timefit import fit_to_slot, stretch

HAVE_FFMPEG = ff.available()
RATE = 16000


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not installed on this machine")
class FfmpegConversionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.source = self.tmp / "source.wav"
        write_wav(self.source, tone(1200, sample_rate=RATE, amplitude=0.3))

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_probe_reports_the_real_profile(self) -> None:
        profile = ff.audio_profile(self.source)
        self.assertEqual(profile["codec"], "pcm_s16le")
        self.assertEqual(profile["sample_rate"], RATE)
        self.assertEqual(profile["channels"], 1)

    def test_duration_matches_the_file(self) -> None:
        self.assertAlmostEqual(ff.duration_ms(self.source), 1200, delta=40)

    def test_round_trip_through_a_compressed_format(self) -> None:
        """A game that ships .flac gets .flac back, at the same length."""
        encoded = ff.from_wav(self.source, self.tmp / "out.flac", codec="flac", sample_rate=RATE, channels=1)
        self.assertTrue(encoded.exists())
        self.assertEqual(ff.audio_profile(encoded)["codec"], "flac")

        decoded = ff.to_wav(encoded, self.tmp / "back.wav")
        audio = read_wav(decoded)
        self.assertAlmostEqual(audio.duration_ms, 1200, delta=40)
        self.assertGreater(rms(audio), 0.0)

    def test_decoding_feeds_the_stdlib_reader(self) -> None:
        """The point of to_wav: something Python's wave module can read."""
        encoded = ff.from_wav(self.source, self.tmp / "out.flac", codec="flac")
        decoded = ff.to_wav(encoded, self.tmp / "back.wav", sample_rate=RATE, channels=1)
        self.assertEqual(read_wav(decoded).sample_rate, RATE)


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not installed on this machine")
class FfmpegTimingTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_atempo_shortens_without_losing_the_signal(self) -> None:
        source = self.tmp / "in.wav"
        write_wav(source, tone(2000, sample_rate=RATE, amplitude=0.3))
        out = ff.atempo(source, self.tmp / "faster.wav", 1.25)
        audio = read_wav(out)
        self.assertAlmostEqual(audio.duration_ms, 1600, delta=80)
        self.assertGreater(rms(audio), 0.01)

    def test_atempo_chains_beyond_its_own_limit(self) -> None:
        """atempo only accepts 0.5-2.0 per instance; larger factors are chained."""
        source = self.tmp / "in.wav"
        write_wav(source, tone(4000, sample_rate=RATE, amplitude=0.3))
        out = ff.atempo(source, self.tmp / "much_faster.wav", 3.0)
        self.assertAlmostEqual(read_wav(out).duration_ms, 1333, delta=120)

    def test_stretch_prefers_ffmpeg_when_a_tmp_dir_is_given(self) -> None:
        out = stretch(tone(2000, sample_rate=RATE, amplitude=0.3), 1.25, tmp_dir=self.tmp)
        self.assertAlmostEqual(out.duration_ms, 1600, delta=80)
        self.assertFalse(list(self.tmp.glob("_stretch_*")), "scratch files were left behind")

    def test_fit_to_slot_compresses_through_ffmpeg(self) -> None:
        result = fit_to_slot(
            tone(1500, sample_rate=RATE, amplitude=0.3), 1200,
            max_stretch=1.4, tolerance_ms=50, tmp_dir=self.tmp,
        )
        self.assertEqual(result.strategy, "compressed")
        self.assertAlmostEqual(result.audio.duration_ms, 1200, delta=90)


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not installed on this machine")
class FfmpegLoudnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_loudnorm_produces_readable_audio(self) -> None:
        source = self.tmp / "quiet.wav"
        write_wav(source, tone(2000, sample_rate=RATE, amplitude=0.03))
        out = ff.loudnorm(source, self.tmp / "normalised.wav", -18.0)
        audio = read_wav(out)
        self.assertGreater(audio.duration_ms, 1500)
        self.assertGreater(rms(audio), rms(read_wav(source)))


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not installed on this machine")
class FfmpegMixdownTests(unittest.TestCase):
    """The film path: a real bed, streamed and ducked, not a silence placeholder."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.bed = self.tmp / "film.wav"
        write_wav(self.bed, tone(6000, freq=90, sample_rate=RATE, amplitude=0.4))
        self.line = self.tmp / "line.wav"
        write_wav(self.line, tone(900, freq=180, sample_rate=RATE, amplitude=0.3))

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_bed_is_streamed_in_and_ducked_under_the_line(self) -> None:
        result = build_track(
            [Cue(start_ms=2000, audio_path=self.line)],
            self.tmp / "dub.wav",
            total_ms=6000,
            sample_rate=RATE,
            channels=1,
            bed=self.bed,
        )
        self.assertTrue(result.used_original_bed, "ffmpeg is present, so the real mix should be underneath")
        self.assertEqual(result.cues_placed, 1)
        self.assertEqual(result.cues_dropped, 0)

        audio = read_wav(result.out_path)
        self.assertAlmostEqual(audio.duration_ms, 6000, delta=120)

        # the bed survives outside the line, and is pushed down under it
        def level(start_ms: int, end_ms: int) -> float:
            a = int(RATE * start_ms / 1000)
            b = int(RATE * end_ms / 1000)
            return rms(type(audio)(audio.samples[a:b], RATE, 1))

        outside = level(200, 1500)
        self.assertGreater(outside, 0.0, "the original mix was lost entirely")
        self.assertLess(level(2200, 2700), outside, "the bed was not ducked under the dubbed line")

    def test_a_missing_take_is_dropped_not_fatal(self) -> None:
        result = build_track(
            [Cue(start_ms=1000, audio_path=self.line), Cue(start_ms=3000, audio_path=self.tmp / "gone.wav")],
            self.tmp / "dub.wav",
            total_ms=5000, sample_rate=RATE, channels=1, bed=self.bed,
        )
        self.assertEqual(result.cues_placed, 1)
        self.assertEqual(result.cues_dropped, 1)


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not installed on this machine")
class FfmpegMuxTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.video = self.tmp / "film.mkv"
        # Build a tiny video to mux into. If this environment's ffmpeg cannot
        # encode one, skip rather than fail: the thing under test is mux_audio.
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error",
                 "-f", "lavfi", "-i", "testsrc=duration=2:size=64x64:rate=10",
                 "-f", "lavfi", "-i", "sine=frequency=200:duration=2",
                 "-c:v", "mpeg4", "-c:a", "pcm_s16le", str(self.video)],
                capture_output=True, timeout=120, check=True,
            )
        except Exception as exc:  # noqa: BLE001 - environment capability, not a defect
            self.skipTest(f"could not build a test video here: {exc}")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_dub_is_added_as_a_second_track_without_touching_the_video(self) -> None:
        dub = self.tmp / "dub.wav"
        write_wav(dub, tone(2000, sample_rate=RATE, amplitude=0.3))
        out = ff.mux_audio(self.video, dub, self.tmp / "film.voxswap.mkv", language="tr")

        streams = ff.probe(out)["streams"]
        audio = [s for s in streams if s.get("codec_type") == "audio"]
        video = [s for s in streams if s.get("codec_type") == "video"]
        self.assertEqual(len(video), 1, "the picture should be copied through untouched")
        self.assertEqual(len(audio), 2, "the original audio should be kept alongside the dub")
        self.assertEqual(video[0].get("codec_name"), "mpeg4", "the video was re-encoded")


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not installed on this machine")
class FilmPipelineWithFfmpegTests(unittest.TestCase):
    """The film path as an operator doing films actually runs it.

    Every other pipeline test pins a fake ffmpeg, so the film tests there get a
    silence bed and no mux. This one runs the real thing end to end: a real
    video container, the original mix streamed in and ducked, EBU R128
    normalisation in `master`, and the dub muxed back as a second track.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

        from tests.helpers import make_config, make_movie_order

        self.cfg = make_config(self.tmp)
        self.cfg.ffmpeg, self.cfg.ffprobe = "ffmpeg", "ffprobe"    # the point of this test
        self.cfg.ensure_dirs()

        self.order_dir = make_movie_order(self.cfg, "TEST-FILM")
        (self.order_dir / "assets" / "film.wav").unlink()
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error",
                 "-f", "lavfi", "-i", "testsrc=duration=14:size=64x64:rate=10",
                 "-f", "lavfi", "-i", "sine=frequency=180:duration=14",
                 "-c:v", "mpeg4", "-c:a", "pcm_s16le",
                 str(self.order_dir / "assets" / "film.mkv")],
                capture_output=True, timeout=180, check=True,
            )
        except Exception as exc:  # noqa: BLE001 - environment capability, not a defect
            self.skipTest(f"could not build a test video here: {exc}")

        import json
        order = json.loads((self.order_dir / "order.json").read_text())
        order["target"]["include"] = ["*.mkv"]
        (self.order_dir / "order.json").write_text(json.dumps(order), encoding="utf-8")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_film_run_muxes_a_second_audio_track(self) -> None:
        from voxswap.log import Logger
        from voxswap.pipeline import run_order
        from voxswap.state import DONE

        result = run_order(self.cfg, "TEST-FILM", log=Logger("error"))
        self.assertEqual(result.status, DONE, result.error)

        delivery = self.cfg.delivery_dir / "TEST-FILM"
        dub = next(iter((delivery / "dub").glob("*.dub.wav")))
        self.assertGreater(read_wav(dub).duration_ms, 11000)

        muxed = next(iter(delivery.glob("*.voxswap.mkv")))
        streams = ff.probe(muxed)["streams"]
        self.assertEqual(len([s for s in streams if s.get("codec_type") == "video"]), 1)
        self.assertEqual(len([s for s in streams if s.get("codec_type") == "audio"]), 2)

        # with ffmpeg the original mix really is underneath, so the package must
        # not carry the dialogue-only warning
        warnings = delivery / "WARNINGS.md"
        if warnings.exists():
            self.assertNotIn("dialogue only", warnings.read_text())

    def test_original_mix_is_present_under_the_dub(self) -> None:
        from voxswap.log import Logger
        from voxswap.pipeline import run_order

        run_order(self.cfg, "TEST-FILM", log=Logger("error"))
        dub = next(iter((self.cfg.delivery_dir / "TEST-FILM" / "dub").glob("*.dub.wav")))
        audio = read_wav(dub)

        # a stretch of timeline with no dubbed line still carries the film's mix
        rate = audio.sample_rate
        quiet_span = type(audio)(audio.samples[int(rate * 12.0) : int(rate * 13.5)], rate, audio.channels)
        self.assertGreater(rms(quiet_span), 0.0, "the original mix was replaced instead of ducked")


if __name__ == "__main__":
    unittest.main()
