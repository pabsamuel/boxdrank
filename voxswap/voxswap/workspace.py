"""Where a job's files live.

One place that owns every path, so no stage invents its own layout:

    work/<order_id>/
        state.json       stage-by-stage progress (resumable)
        job.log          everything the stages printed
        lines.json       the line manifest, rewritten as stages enrich it
        raw/             originals decoded to WAV (never the customer's files)
        voices/          reference clips built from the customer's samples
        synth/           raw TTS takes, before any fitting
        master/          fitted, loudness-matched, format-matched takes
        tmp/             scratch; safe to delete at any time
        report/          QC report and delivery manifest

    delivery/<order_id>/ what the customer actually receives (+ the .zip)

Nothing is ever written back into the order folder except state the operator
should see. The customer's source assets are read-only, always.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from .config import Config


@dataclass
class Workspace:
    order_id: str
    root: Path
    delivery: Path

    @staticmethod
    def for_order(cfg: Config, order_id: str) -> "Workspace":
        return Workspace(
            order_id=order_id,
            root=cfg.work_dir / order_id,
            delivery=cfg.delivery_dir / order_id,
        )

    # -- files -----------------------------------------------------------

    @property
    def state_file(self) -> Path: return self.root / "state.json"

    @property
    def log_file(self) -> Path: return self.root / "job.log"

    @property
    def lines_file(self) -> Path: return self.root / "lines.json"

    @property
    def assets_file(self) -> Path: return self.root / "assets.json"

    # -- directories -----------------------------------------------------

    @property
    def raw_dir(self) -> Path: return self.root / "raw"

    @property
    def voices_dir(self) -> Path: return self.root / "voices"

    @property
    def synth_dir(self) -> Path: return self.root / "synth"

    @property
    def master_dir(self) -> Path: return self.root / "master"

    @property
    def tmp_dir(self) -> Path: return self.root / "tmp"

    @property
    def report_dir(self) -> Path: return self.root / "report"

    @property
    def lock_dir(self) -> Path: return self.root / ".lock"

    def ensure(self) -> "Workspace":
        for d in (self.root, self.raw_dir, self.voices_dir, self.synth_dir,
                  self.master_dir, self.tmp_dir, self.report_dir):
            d.mkdir(parents=True, exist_ok=True)
        return self

    def clean_tmp(self) -> None:
        if self.tmp_dir.exists():
            shutil.rmtree(self.tmp_dir, ignore_errors=True)
        self.tmp_dir.mkdir(parents=True, exist_ok=True)

    def wipe(self) -> None:
        """Delete all intermediate work. Used by `voxswap purge` when consent is
        withdrawn — the delivery folder is removed separately and deliberately."""
        if self.root.exists():
            shutil.rmtree(self.root, ignore_errors=True)
