"""A customer who re-records must get their new voice, and only that.

The failure this guards against is quiet: an order folder still names the clone
made from last week's samples, every stage before delivery is "already done",
and the game ships in the old voice — while the old clone sits at the provider
where a withdrawal request can no longer find it.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tests.helpers import RATE, make_config, make_game_order
from voxswap.audio import tone, write_wav
from voxswap.consent import last_clone, orphaned_clones
from voxswap.errors import ProviderError
from voxswap.log import Logger
from voxswap.pipeline import load_order, run_order
from voxswap.providers.local import LocalVoice
from voxswap.state import DONE
from voxswap.workspace import Workspace


def trail(order_dir: Path) -> list[list[str]]:
    text = (order_dir / "consent-audit.log").read_text(encoding="utf-8")
    return [ln.split("\t") for ln in text.splitlines() if ln]


def clone_on_file(order_dir: Path) -> str:
    data = json.loads((order_dir / "order.json").read_text(encoding="utf-8"))
    return data["voices"][0]["provider_voice_id"]


class RebuildTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.cfg = make_config(self.tmp)
        self.cfg.ensure_dirs()
        self.log = Logger("error")
        self.order_dir = make_game_order(self.cfg)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def build(self, order_id: str, **kwargs):
        return run_order(self.cfg, order_id, log=self.log, **kwargs)

    def rerecord(self) -> None:
        write_wav(self.order_dir / "voices" / "main" / "s0.wav", tone(3000, freq=210, sample_rate=RATE))

    def kinds(self) -> list[str]:
        return [e[1] for e in trail(self.order_dir)]

    # ------------------------------------------------------------------

    def test_the_clone_records_what_it_was_made_from(self) -> None:
        self.build("TEST-GAME")
        record = last_clone(self.order_dir, "main")
        self.assertEqual(record["id"], clone_on_file(self.order_dir))
        self.assertRegex(record["samples"], r"^[0-9a-f]{16}$")

    def test_new_samples_rebuild_the_clone_and_delete_the_old_one(self) -> None:
        self.build("TEST-GAME")
        old = clone_on_file(self.order_dir)
        ws = Workspace.for_order(self.cfg, "TEST-GAME")
        old_takes = {p.name for p in ws.synth_dir.glob("*.wav")}

        self.rerecord()
        result = self.build("TEST-GAME")                   # a plain re-run, no flags

        self.assertEqual(result.status, DONE, result.error)
        self.assertIn("voice", result.completed, "a finished order ignored the new samples")
        new = clone_on_file(self.order_dir)
        self.assertNotEqual(new, old)
        replaced = [e for e in trail(self.order_dir) if e[1] == "REPLACED"]
        self.assertEqual(len(replaced), 1)
        self.assertIn(f"old={old}", replaced[0])
        self.assertIn(f"new={new}", replaced[0])
        # every take was made again, in the new voice
        new_takes = {p.name for p in ws.synth_dir.glob("*.wav")} - old_takes
        self.assertTrue(new_takes, "the delivery reused takes rendered in the replaced voice")

    def test_from_voice_without_new_samples_reuses_the_clone(self) -> None:
        self.build("TEST-GAME")
        before = self.kinds().count("CLONED")
        result = self.build("TEST-GAME", from_stage="voice")
        self.assertEqual(result.status, DONE, result.error)
        self.assertEqual(self.kinds().count("CLONED"), before, "a clone was paid for twice")
        self.assertNotIn("REPLACED", self.kinds())

    def test_an_unchanged_finished_order_runs_nothing(self) -> None:
        self.build("TEST-GAME")
        self.assertEqual(self.build("TEST-GAME").completed, [])

    def test_a_clone_with_no_fingerprint_on_record_is_kept(self) -> None:
        """Orders cloned before fingerprints were kept: "cannot tell" is not "changed"."""
        self.build("TEST-GAME")
        log = self.order_dir / "consent-audit.log"
        log.write_text("\n".join(
            "\t".join(f for f in line.split("\t") if not f.startswith("samples="))
            for line in log.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
        old = clone_on_file(self.order_dir)

        self.rerecord()
        self.build("TEST-GAME", from_stage="voice")
        self.assertEqual(clone_on_file(self.order_dir), old)

    def test_deleting_samples_after_cloning_is_not_a_rerecording(self) -> None:
        """Clearing samples once the clone exists is good hygiene. A finished
        order must stay finished rather than restart and fail at the gate
        (which, rightly, still wants samples before it touches a voice)."""
        self.build("TEST-GAME")
        old = clone_on_file(self.order_dir)
        for sample in (self.order_dir / "voices" / "main").glob("*.wav"):
            sample.unlink()

        result = self.build("TEST-GAME")
        self.assertEqual(result.status, DONE, result.error)
        self.assertEqual(result.completed, [])
        self.assertEqual(clone_on_file(self.order_dir), old)

    def test_force_rebuilds_without_leaving_the_old_clone_behind(self) -> None:
        self.build("TEST-GAME")
        old = clone_on_file(self.order_dir)
        self.rerecord()
        self.build("TEST-GAME", force=True)
        self.assertNotEqual(clone_on_file(self.order_dir), old)
        self.assertIn("REPLACED", self.kinds())

    def test_a_failed_delete_is_recorded_and_purge_retries_it(self) -> None:
        self.build("TEST-GAME")
        old = clone_on_file(self.order_dir)
        self.rerecord()

        boom = ProviderError("provider said no", "try later")
        with mock.patch("voxswap.providers.mock.MockVoice.delete_voice", side_effect=boom):
            result = self.build("TEST-GAME")
        self.assertEqual(result.status, DONE, "a good new clone must not fail the build")
        self.assertIn("ORPHANED", self.kinds())
        self.assertEqual(orphaned_clones(self.order_dir, "main"), [old])

        from voxswap.consent import purge_order

        with mock.patch("voxswap.providers.mock.MockVoice.delete_voice") as deleted:
            report = purge_order(self.cfg, load_order(self.cfg, "TEST-GAME"), log=self.log)
        called = [c.args[0] for c in deleted.call_args_list]
        self.assertIn(old, called, "withdrawal skipped a clone the trail says still exists")
        self.assertIn(old, report["clones_deleted"])


class LocalReferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_new_samples_make_a_new_reference(self) -> None:
        provider = LocalVoice(voice_dir=self.tmp / "voices")
        sample = self.tmp / "s.wav"
        write_wav(sample, tone(2000, freq=140, sample_rate=16000))
        first = provider.ensure_voice("main", "Ada", [sample], consent_ref="C-1")

        write_wav(sample, tone(2000, freq=220, sample_rate=16000))      # re-recorded in place
        second = provider.ensure_voice("main", "Ada", [sample], consent_ref="C-1")

        self.assertNotEqual(first, second, "the old reference was handed back for new samples")
        self.assertTrue(Path(second).exists())


if __name__ == "__main__":
    unittest.main()
