"""Resumable job state.

A job is a sequence of named stages. Each stage records status, timing, and a
short summary in `work/<order_id>/state.json`. Because state is on disk:

  * a crashed or killed run resumes from the last completed stage,
  * the watcher can tell a new order from one already in flight,
  * `voxswap status` answers "where is this customer's job?" without guessing.

Costly stages (transcription, synthesis) are the reason this exists — never
re-pay for a stage that already succeeded.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .ids import utc_now_iso

PENDING = "pending"
RUNNING = "running"
DONE = "done"
FAILED = "failed"
SKIPPED = "skipped"

TERMINAL_OK = (DONE, SKIPPED)


@dataclass
class StageState:
    name: str
    status: str = PENDING
    started_at: str = ""
    finished_at: str = ""
    duration_s: float = 0.0
    summary: str = ""
    error: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "StageState":
        known = {f for f in StageState.__dataclass_fields__}  # type: ignore[attr-defined]
        return StageState(**{k: v for k, v in d.items() if k in known})


class JobState:
    def __init__(self, path: Path, order_id: str, stage_names: list[str]) -> None:
        self.path = path
        self.order_id = order_id
        self.stages: dict[str, StageState] = {n: StageState(n) for n in stage_names}
        self.created_at = utc_now_iso()
        self.updated_at = self.created_at
        self.delivery: dict[str, Any] = {}
        if path.exists():
            self._load()

    # -- persistence -----------------------------------------------------

    def _load(self) -> None:
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.created_at = data.get("created_at", self.created_at)
        self.updated_at = data.get("updated_at", self.updated_at)
        self.delivery = data.get("delivery", {})
        for name, raw in (data.get("stages") or {}).items():
            if name in self.stages:                       # ignore stages we no longer run
                self.stages[name] = StageState.from_dict({**raw, "name": name})

    def save(self) -> None:
        self.updated_at = utc_now_iso()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "order_id": self.order_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "overall": self.overall_status,
            "stages": {n: s.to_dict() for n, s in self.stages.items()},
            "delivery": self.delivery,
        }
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)                        # atomic: never a half-written state file

    # -- queries ---------------------------------------------------------

    @property
    def overall_status(self) -> str:
        values = [s.status for s in self.stages.values()]
        if any(v == FAILED for v in values):
            return FAILED
        if all(v in TERMINAL_OK for v in values):
            return DONE
        if any(v == RUNNING for v in values):
            return RUNNING
        if all(v == PENDING for v in values):
            return "new"
        return "partial"

    def is_done(self, name: str) -> bool:
        return self.stages[name].status in TERMINAL_OK

    def next_stage(self) -> str | None:
        for name, st in self.stages.items():
            if st.status not in TERMINAL_OK:
                return name
        return None

    # -- mutation --------------------------------------------------------

    def begin(self, name: str) -> float:
        st = self.stages[name]
        st.status = RUNNING
        st.started_at = utc_now_iso()
        st.error = ""
        self.save()
        return time.monotonic()

    def finish(self, name: str, t0: float, summary: str = "", metrics: dict[str, Any] | None = None, *, skipped: bool = False) -> None:
        st = self.stages[name]
        st.status = SKIPPED if skipped else DONE
        st.finished_at = utc_now_iso()
        st.duration_s = round(time.monotonic() - t0, 2)
        st.summary = summary
        if metrics:
            st.metrics = metrics
        self.save()

    def fail(self, name: str, t0: float, error: str) -> None:
        st = self.stages[name]
        st.status = FAILED
        st.finished_at = utc_now_iso()
        st.duration_s = round(time.monotonic() - t0, 2)
        st.error = error
        self.save()

    def reset_from(self, name: str) -> None:
        """Mark `name` and every later stage pending, so --from re-runs them."""
        hit = False
        for stage_name, st in self.stages.items():
            if stage_name == name:
                hit = True
            if hit:
                self.stages[stage_name] = StageState(stage_name)
        self.save()


class JobLock:
    """Directory-based lock so the watcher never runs one order twice.

    A lock older than `stale_after_s` is assumed to belong to a crashed run and
    is taken over — otherwise a hard kill would wedge an order forever.
    """

    def __init__(self, path: Path, stale_after_s: int = 6 * 3600) -> None:
        self.path = path
        self.stale_after_s = stale_after_s
        self.acquired = False

    def acquire(self) -> bool:
        try:
            self.path.mkdir(parents=True, exist_ok=False)
        except FileExistsError:
            age = time.time() - self.path.stat().st_mtime
            if age < self.stale_after_s:
                return False
            (self.path / "takeover").write_text(utc_now_iso(), encoding="utf-8")
        (self.path / "pid").write_text(str(os.getpid()), encoding="utf-8")
        os.utime(self.path, None)
        self.acquired = True
        return True

    def release(self) -> None:
        if not self.acquired:
            return
        for child in self.path.glob("*"):
            child.unlink(missing_ok=True)
        self.path.rmdir()
        self.acquired = False

    def __enter__(self) -> "JobLock":
        if not self.acquire():
            from .errors import StageError

            raise StageError(
                f"order is already being processed (lock: {self.path})",
                "Wait for the running job, or delete the lock directory if the process is gone.",
            )
        return self

    def __exit__(self, *exc: object) -> None:
        self.release()
