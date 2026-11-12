"""End-to-end runs against the offline providers.

These are the tests that would catch a regression a customer would notice:
the wrong files replaced, a job that cannot resume, a delivery that is missing
its manifest, or a consent failure that still produced audio.
"""

from __future__ import annotations

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from tests.helpers import make_config, make_game_order, make_movie_order
from voxswap.audio import probe_wav
from voxswap.log import Logger
from voxswap.models import load_lines
from voxswap.pipeline import job_status, run_order
from voxswap.state import DONE, FAILED
from voxswap.watcher import scan, watch
from voxswap.workspace import Workspace


class PipelineTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.cfg = make_config(self.tmp)
        self.cfg.ensure_dirs()
        self.log = Logger("error")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def run_order(self, order_id: str, **kwargs):
        return run_order(self.cfg, order_id, log=self.log, **kwargs)


class GameJobTests(PipelineTestCase):
    def test_full_run_produces_a_delivery(self) -> None:
        make_game_order(self.cfg)
        result = self.run_order("TEST-GAME")

        self.assertEqual(result.status, DONE, result.error)
        delivery = self.cfg.delivery_dir / "TEST-GAME"
        archive = self.cfg.delivery_dir / "TEST-GAME.zip"
        self.assertTrue(archive.exists())

        for name in ("README.md", "INSTALL.md", "manifest.json", "script.csv", "qc.md"):
            self.assertTrue((delivery / name).exists(), f"{name} missing from the delivery")

        names = zipfile.ZipFile(archive).namelist()
        self.assertIn("manifest.json", names)
        self.assertTrue(any(n.startswith("audio/vo/hero/") for n in names))

    def test_only_matched_characters_are_replaced(self) -> None:
        """The guard is not part of the order, so the guard must not be touched."""
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")

        delivered = sorted(p.name for p in (self.cfg.delivery_dir / "TEST-GAME" / "audio").rglob("*.wav"))
        self.assertEqual(delivered, ["hero_01.wav", "hero_02.wav", "hero_03.wav"])
        self.assertFalse((self.cfg.delivery_dir / "TEST-GAME" / "audio" / "vo" / "npc").exists())

    def test_delivered_paths_mirror_the_originals(self) -> None:
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        manifest = json.loads((self.cfg.delivery_dir / "TEST-GAME" / "manifest.json").read_text())
        for entry in manifest["files"]:
            self.assertEqual(entry["delivered"], f"audio/{entry['original']}")
            self.assertTrue(entry["original_sha256"], "no checksum recorded for the original")

    def test_lines_land_inside_their_slots(self) -> None:
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        for line in load_lines(Workspace.for_order(self.cfg, "TEST-GAME").lines_file):
            if line.status != "done":
                continue
            delivered = self.cfg.delivery_dir / "TEST-GAME" / "audio" / line.source_rel
            duration, _, _ = probe_wav(delivered)
            self.assertLessEqual(abs(duration - line.source_duration_ms), 250,
                                 f"{line.line_id} is {duration - line.source_duration_ms} ms off its slot")

    def test_original_assets_are_never_modified(self) -> None:
        order_dir = make_game_order(self.cfg)
        source = order_dir / "assets" / "vo" / "hero" / "hero_01.wav"
        before = source.read_bytes()
        self.run_order("TEST-GAME")
        self.assertEqual(source.read_bytes(), before)

    def test_transcription_fills_in_missing_script_text(self) -> None:
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        lines = load_lines(Workspace.for_order(self.cfg, "TEST-GAME").lines_file)
        done = [l for l in lines if l.status == "done"]
        self.assertTrue(all(l.text for l in done), "a line reached delivery with no text")

    def test_translation_changes_the_spoken_text(self) -> None:
        make_game_order(self.cfg, order_id="TEST-TR", language={"source": "en", "target": "tr"})
        result = self.run_order("TEST-TR")
        self.assertEqual(result.status, DONE, result.error)
        lines = [l for l in load_lines(Workspace.for_order(self.cfg, "TEST-TR").lines_file) if l.status == "done"]
        self.assertTrue(lines)
        for line in lines:
            self.assertTrue(line.translated_text)
            self.assertEqual(line.speak_text, line.translated_text)
        script = (self.cfg.delivery_dir / "TEST-TR" / "script.csv").read_text(encoding="utf-8-sig")
        self.assertIn("[tr]", script)

    def test_dry_run_limit_caps_the_work(self) -> None:
        make_game_order(self.cfg, order_id="TEST-LIMIT", options={"dry_run_limit": 1, "max_stretch": 1.2})
        result = self.run_order("TEST-LIMIT")
        self.assertEqual(result.status, DONE, result.error)
        delivered = list((self.cfg.delivery_dir / "TEST-LIMIT" / "audio").rglob("*.wav"))
        self.assertEqual(len(delivered), 1)


class ResumeTests(PipelineTestCase):
    def test_second_run_reuses_finished_stages(self) -> None:
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        ws = Workspace.for_order(self.cfg, "TEST-GAME")
        stamps = {p.name: p.stat().st_mtime_ns for p in ws.synth_dir.glob("*.wav")}

        second = self.run_order("TEST-GAME")
        self.assertEqual(second.status, DONE)
        self.assertEqual(second.completed, [], "a finished job re-ran stages it had already done")
        for path, stamp in stamps.items():
            self.assertEqual((ws.synth_dir / path).stat().st_mtime_ns, stamp,
                             "a take was regenerated — that is a real bill on a real provider")

    def test_from_master_reuses_takes_but_rebuilds_the_delivery(self) -> None:
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        ws = Workspace.for_order(self.cfg, "TEST-GAME")
        stamps = {p.name: p.stat().st_mtime_ns for p in ws.synth_dir.glob("*.wav")}

        result = self.run_order("TEST-GAME", from_stage="master")
        self.assertEqual(result.status, DONE, result.error)
        self.assertEqual(result.completed, ["master", "qc", "package"])
        for path, stamp in stamps.items():
            self.assertEqual((ws.synth_dir / path).stat().st_mtime_ns, stamp)

    def test_only_plan_runs_a_single_stage(self) -> None:
        make_game_order(self.cfg)
        result = self.run_order("TEST-GAME", only_stage="intake")
        self.assertEqual(result.completed, ["intake"])
        self.assertFalse((self.cfg.delivery_dir / "TEST-GAME").exists())


class FailureTests(PipelineTestCase):
    def test_missing_consent_stops_before_anything_is_generated(self) -> None:
        order_dir = make_game_order(self.cfg)
        (order_dir / "consent" / "C-1-signed.md").unlink()

        result = self.run_order("TEST-GAME")
        self.assertEqual(result.status, FAILED)
        self.assertEqual(result.failed_stage, "intake")
        self.assertIn("signed consent document", result.error)
        self.assertFalse((self.cfg.delivery_dir / "TEST-GAME").exists())
        self.assertFalse(list(Workspace.for_order(self.cfg, "TEST-GAME").synth_dir.glob("*.wav")))

    def test_no_matching_role_fails_with_a_useful_message(self) -> None:
        make_game_order(self.cfg, order_id="TEST-NOMATCH",
                        roles=[{"role_id": "HERO", "display_name": "Hero", "voice_id": "main",
                                "match": ["vo/nobody/*.wav"], "match_speakers": ["nobody"]}])
        result = self.run_order("TEST-NOMATCH")
        self.assertEqual(result.status, FAILED)
        self.assertEqual(result.failed_stage, "plan")
        self.assertIn("roles[].match", result.error)

    def test_status_reports_the_failure(self) -> None:
        order_dir = make_game_order(self.cfg)
        (order_dir / "consent" / "C-1-signed.md").unlink()
        self.run_order("TEST-GAME")

        info = job_status(self.cfg, "TEST-GAME")
        self.assertEqual(info["status"], FAILED)
        intake = next(s for s in info["stages"] if s["name"] == "intake")
        self.assertIn("signed consent", intake["error"])


class MovieJobTests(PipelineTestCase):
    def test_movie_run_builds_a_dub_track_and_subtitles(self) -> None:
        make_movie_order(self.cfg)
        result = self.run_order("TEST-MOVIE")
        self.assertEqual(result.status, DONE, result.error)

        delivery = self.cfg.delivery_dir / "TEST-MOVIE"
        dub = list((delivery / "dub").glob("*.dub.wav"))
        srt = list((delivery / "dub").glob("*.dub.srt"))
        self.assertEqual(len(dub), 1)
        self.assertEqual(len(srt), 1)
        self.assertTrue(list((delivery / "lines").glob("*.wav")))

        # the track has to span the whole timeline, not just the dialogue
        duration, _, _ = probe_wav(dub[0])
        self.assertGreaterEqual(duration, 11000)
        self.assertIn("Not without her", srt[0].read_text(encoding="utf-8"))

    def test_only_the_hero_is_dubbed(self) -> None:
        make_movie_order(self.cfg)
        self.run_order("TEST-MOVIE")
        lines = load_lines(Workspace.for_order(self.cfg, "TEST-MOVIE").lines_file)
        done = [l for l in lines if l.status == "done"]
        skipped = [l for l in lines if l.status == "skipped"]
        self.assertEqual(len(done), 2)
        self.assertEqual(len(skipped), 1)
        self.assertTrue(all(l.role_id == "HERO" for l in done))

    def test_dialogue_only_warning_is_delivered(self) -> None:
        """Without ffmpeg there is no original mix underneath — say so."""
        make_movie_order(self.cfg)
        self.run_order("TEST-MOVIE")
        warnings = (self.cfg.delivery_dir / "TEST-MOVIE" / "WARNINGS.md").read_text()
        self.assertIn("dialogue only", warnings)


class WatcherTests(PipelineTestCase):
    def test_new_order_is_picked_up_and_delivered(self) -> None:
        make_game_order(self.cfg)
        results = watch(self.cfg, once=True, interval=1, settle_seconds=0, log=self.log)
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0].ok, results[0].error)
        self.assertTrue((self.cfg.delivery_dir / "TEST-GAME.zip").exists())

    def test_hold_file_stops_a_pickup(self) -> None:
        order_dir = make_game_order(self.cfg)
        (order_dir / ".hold").write_text("staging the upload", encoding="utf-8")
        decisions = scan(self.cfg, settle_seconds=0)
        self.assertEqual(decisions[0].action, "hold")
        self.assertEqual(watch(self.cfg, once=True, interval=1, settle_seconds=0, log=self.log), [])

    def test_recent_upload_is_left_to_settle(self) -> None:
        make_game_order(self.cfg)
        decisions = scan(self.cfg, settle_seconds=3600)
        self.assertEqual(decisions[0].action, "wait")

    def test_failed_order_is_not_retried_automatically(self) -> None:
        order_dir = make_game_order(self.cfg)
        (order_dir / "consent" / "C-1-signed.md").unlink()
        watch(self.cfg, once=True, interval=1, settle_seconds=0, log=self.log)

        decisions = scan(self.cfg, settle_seconds=0)
        self.assertEqual(decisions[0].action, "skip")
        self.assertIn("needs a human", decisions[0].reason)

    def test_finished_order_is_not_run_again(self) -> None:
        make_game_order(self.cfg)
        watch(self.cfg, once=True, interval=1, settle_seconds=0, log=self.log)
        self.assertEqual(watch(self.cfg, once=True, interval=1, settle_seconds=0, log=self.log), [])


if __name__ == "__main__":
    unittest.main()


class PurgeTests(PipelineTestCase):
    """Withdrawal has to actually work, including leaving the order re-runnable."""

    def _purge(self, order_id: str, **flags) -> dict:
        from voxswap.consent import purge_order
        from voxswap.pipeline import load_order

        return purge_order(self.cfg, load_order(self.cfg, order_id), log=self.log, **flags)

    def test_purge_removes_the_delivery_and_the_work(self) -> None:
        make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        self._purge("TEST-GAME")

        self.assertFalse((self.cfg.delivery_dir / "TEST-GAME").exists())
        self.assertFalse((self.cfg.delivery_dir / "TEST-GAME.zip").exists())
        self.assertFalse(Workspace.for_order(self.cfg, "TEST-GAME").root.exists())

    def test_purge_forgets_the_clone_so_the_order_can_run_again(self) -> None:
        order_dir = make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        self.assertTrue(json.loads((order_dir / "order.json").read_text())["voices"][0]["provider_voice_id"])

        self._purge("TEST-GAME")
        self.assertEqual(json.loads((order_dir / "order.json").read_text())["voices"][0]["provider_voice_id"], "")

        again = self.run_order("TEST-GAME")
        self.assertEqual(again.status, DONE, again.error)

    def test_purge_keeps_the_original_recordings_unless_asked(self) -> None:
        order_dir = make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        self._purge("TEST-GAME")
        self.assertTrue(list((order_dir / "voices" / "main").glob("*.wav")))

        self._purge("TEST-GAME", samples=True)
        self.assertFalse((order_dir / "voices" / "main").exists())

    def test_purge_writes_an_audit_trail(self) -> None:
        order_dir = make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        self._purge("TEST-GAME")
        self.assertIn("PURGED", (order_dir / "consent-audit.log").read_text())

    def test_a_build_records_consent_and_the_clone_it_created(self) -> None:
        """The trail must prove the clone was allowed, not just that it was deleted."""
        order_dir = make_game_order(self.cfg)
        self.run_order("TEST-GAME")

        events = [ln.split("\t") for ln in
                  (order_dir / "consent-audit.log").read_text(encoding="utf-8").splitlines() if ln]
        kinds = [e[1] for e in events]
        self.assertIn("CLEARED", kinds)
        self.assertIn("CLONED", kinds)

        cloned = next(e for e in events if e[1] == "CLONED")
        self.assertEqual(cloned[2], "main")                 # voice_id
        self.assertEqual(cloned[3], "C-1")                  # consent_ref
        self.assertTrue(cloned[0].endswith("Z"), cloned[0])  # timestamped
        # the provider-side ID must be recoverable from the trail alone
        self.assertTrue(any(f.startswith("id=") and len(f) > 3 for f in cloned), cloned)

    def test_the_audit_trail_is_append_only_across_runs(self) -> None:
        order_dir = make_game_order(self.cfg)
        self.run_order("TEST-GAME")
        first = (order_dir / "consent-audit.log").read_text(encoding="utf-8")

        self.run_order("TEST-GAME", force=True)
        second = (order_dir / "consent-audit.log").read_text(encoding="utf-8")

        self.assertTrue(second.startswith(first), "a re-run must not truncate the trail")
        self.assertGreater(second.count("CLONED"), first.count("CLONED"))

    def test_a_failed_consent_check_records_nothing(self) -> None:
        """No CLEARED line for a voice that never cleared."""
        order_dir = make_game_order(self.cfg)
        (order_dir / "consent" / "C-1-signed.md").unlink()

        result = self.run_order("TEST-GAME")
        self.assertEqual(result.status, FAILED)
        trail = order_dir / "consent-audit.log"
        self.assertFalse(trail.exists() and "CLEARED" in trail.read_text(encoding="utf-8"))
