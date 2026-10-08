"""`purge` — the destructive command, so its guard rails are worth a test.

Withdrawal has to work, but it must never fire by accident: this is the only
command that deletes a customer's clone and the audio made from it.
"""

from __future__ import annotations

import argparse
import io
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from tests.helpers import make_config, make_game_order
from voxswap.cli import cmd_purge
from voxswap.log import Logger
from voxswap.pipeline import run_order


class PurgeConfirmationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.cfg = make_config(self.tmp)
        self.cfg.ensure_dirs()
        self.log = Logger("error")
        self.order_dir = make_game_order(self.cfg)
        run_order(self.cfg, "TEST-GAME", log=self.log)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _args(self, **over: object) -> argparse.Namespace:
        base = {"order": "TEST-GAME", "voice": "", "consent_ref": "", "samples": False, "yes": False}
        base.update(over)
        return argparse.Namespace(**base)

    def _purge(self, args: argparse.Namespace) -> int:
        with redirect_stdout(io.StringIO()):
            return int(cmd_purge(args, self.cfg, self.log))

    def test_no_terminal_refuses_instead_of_crashing(self) -> None:
        """Run from cron or a pipe, purge must decline — not raise, not guess yes."""
        import builtins

        def no_tty(_prompt: str = "") -> str:
            raise EOFError

        original, builtins.input = builtins.input, no_tty
        try:
            code = self._purge(self._args())
        finally:
            builtins.input = original

        self.assertEqual(code, 1)
        self.assertTrue(list((self.order_dir / "voices" / "main").glob("*.wav")),
                        "an unconfirmed purge must not delete anything")
        self.assertNotIn("PURGED", (self.order_dir / "consent-audit.log").read_text(encoding="utf-8"))

    def test_the_wrong_order_id_aborts(self) -> None:
        import builtins

        original, builtins.input = builtins.input, lambda _p="": "not-the-order"
        try:
            code = self._purge(self._args())
        finally:
            builtins.input = original

        self.assertEqual(code, 1)
        self.assertNotIn("PURGED", (self.order_dir / "consent-audit.log").read_text(encoding="utf-8"))

    def test_yes_skips_the_prompt_and_purges(self) -> None:
        code = self._purge(self._args(yes=True))
        self.assertEqual(code, 0)
        self.assertIn("PURGED", (self.order_dir / "consent-audit.log").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
