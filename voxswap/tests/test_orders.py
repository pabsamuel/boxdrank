"""Order parsing and state handling."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from tests.helpers import base_order, make_config, make_game_order
from voxswap.errors import OrderError
from voxswap.models import Order
from voxswap.state import DONE, FAILED, JobLock, JobState


class OrderParsingTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.cfg = make_config(self.tmp)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _load_with(self, mutate) -> Order:
        order_dir = make_game_order(self.cfg)
        data = json.loads((order_dir / "order.json").read_text())
        mutate(data)
        (order_dir / "order.json").write_text(json.dumps(data), encoding="utf-8")
        return Order.load(order_dir)

    def test_valid_order_loads(self) -> None:
        order = Order.load(make_game_order(self.cfg))
        self.assertEqual(order.roles[0].voice_id, "main")
        self.assertEqual(order.voice("main").person_label, "Test Customer")
        self.assertFalse(order.language.needs_translation)

    def test_missing_order_file_names_the_template(self) -> None:
        empty = self.tmp / "orders" / "NOPE"
        empty.mkdir(parents=True)
        with self.assertRaises(OrderError) as caught:
            Order.load(empty)
        self.assertIn("order.template.json", caught.exception.hint)

    def test_broken_json_is_reported_as_json(self) -> None:
        order_dir = make_game_order(self.cfg)
        (order_dir / "order.json").write_text('{"order_id": "x",}', encoding="utf-8")
        with self.assertRaises(OrderError) as caught:
            Order.load(order_dir)
        self.assertIn("not valid JSON", caught.exception.message)

    def test_missing_field_names_the_field(self) -> None:
        with self.assertRaises(OrderError) as caught:
            self._load_with(lambda d: d["customer"].pop("email"))
        self.assertIn("customer.email", caught.exception.message)

    def test_role_pointing_at_an_unknown_voice_is_rejected(self) -> None:
        with self.assertRaises(OrderError) as caught:
            self._load_with(lambda d: d["roles"][0].update({"voice_id": "ghost"}))
        self.assertIn("ghost", caught.exception.message)

    def test_voice_pointing_at_an_unknown_consent_is_rejected(self) -> None:
        with self.assertRaises(OrderError):
            self._load_with(lambda d: d["voices"][0].update({"consent_ref": "C-404"}))

    def test_duplicate_voice_ids_are_rejected(self) -> None:
        def mutate(d):
            d["voices"].append(dict(d["voices"][0]))
        with self.assertRaises(OrderError) as caught:
            self._load_with(mutate)
        self.assertIn("duplicate", caught.exception.message)

    def test_unknown_adapter_is_rejected_with_the_list(self) -> None:
        with self.assertRaises(OrderError) as caught:
            self._load_with(lambda d: d["target"].update({"adapter": "cryengine"}))
        self.assertIn("unreal", caught.exception.hint)

    def test_bad_max_stretch_is_rejected(self) -> None:
        with self.assertRaises(OrderError):
            self._load_with(lambda d: d["options"].update({"max_stretch": 0.5}))

    def test_language_pair_detects_translation(self) -> None:
        order = self._load_with(lambda d: d["language"].update({"target": "tr-TR"}))
        self.assertTrue(order.language.needs_translation)

    def test_same_language_different_region_is_not_translation(self) -> None:
        order = self._load_with(lambda d: d["language"].update({"source": "en-US", "target": "en-GB"}))
        self.assertFalse(order.language.needs_translation)


class StateTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.names = ["a", "b", "c"]

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _state(self) -> JobState:
        return JobState(self.tmp / "state.json", "ORD-1", self.names)

    def test_new_job_reports_new(self) -> None:
        self.assertEqual(self._state().overall_status, "new")

    def test_progress_survives_a_reload(self) -> None:
        state = self._state()
        state.finish("a", state.begin("a"), "did a")
        reloaded = self._state()
        self.assertTrue(reloaded.is_done("a"))
        self.assertEqual(reloaded.stages["a"].summary, "did a")
        self.assertEqual(reloaded.next_stage(), "b")

    def test_all_done_reports_done(self) -> None:
        state = self._state()
        for name in self.names:
            state.finish(name, state.begin(name), "ok")
        self.assertEqual(state.overall_status, DONE)

    def test_failure_is_sticky_and_recorded(self) -> None:
        state = self._state()
        state.fail("a", state.begin("a"), "provider exploded")
        self.assertEqual(self._state().overall_status, FAILED)
        self.assertIn("exploded", self._state().stages["a"].error)

    def test_reset_from_clears_later_stages_only(self) -> None:
        state = self._state()
        for name in self.names:
            state.finish(name, state.begin(name), "ok")
        state.reset_from("b")
        self.assertTrue(state.is_done("a"))
        self.assertFalse(state.is_done("b"))
        self.assertFalse(state.is_done("c"))

    def test_lock_prevents_a_second_runner(self) -> None:
        lock = JobLock(self.tmp / ".lock")
        self.assertTrue(lock.acquire())
        self.assertFalse(JobLock(self.tmp / ".lock").acquire())
        lock.release()
        self.assertTrue(JobLock(self.tmp / ".lock").acquire())

    def test_stale_lock_is_taken_over(self) -> None:
        """A killed process must not wedge an order forever."""
        stale = JobLock(self.tmp / ".lock2")
        stale.acquire()
        self.assertTrue(JobLock(self.tmp / ".lock2", stale_after_s=0).acquire())


if __name__ == "__main__":
    unittest.main()
