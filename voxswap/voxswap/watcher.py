"""The inbox watcher.

This is the "it starts by itself" part. Drop a finished order folder into
`orders/` and the watcher picks it up, runs it end to end, and leaves a ZIP in
`delivery/`. The operator's job shrinks to: check the QC report, send the file.

Deliberate behaviours:

  * only *new* and *partly finished* orders are started. A failed order is never
    retried automatically — silently re-running something that already failed
    burns money and hides the problem.
  * a folder containing `.hold` is ignored, so you can stage an upload without
    it starting mid-copy.
  * a folder whose `order.json` is younger than `settle_seconds` is left alone,
    which stops the watcher from grabbing an order while files are still
    uploading.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .errors import VoxSwapError
from .log import Logger
from .pipeline import RunResult, run_order
from .stages import STAGE_NAMES
from .state import FAILED, JobState
from .workspace import Workspace

SETTLE_SECONDS = 20


@dataclass
class WatchDecision:
    order_dir: Path
    order_id: str
    action: str          # run | wait | hold | skip
    reason: str = ""


def scan(cfg: Config, *, settle_seconds: int = SETTLE_SECONDS) -> list[WatchDecision]:
    out: list[WatchDecision] = []
    if not cfg.orders_dir.exists():
        return out
    for order_dir in sorted(p for p in cfg.orders_dir.iterdir() if p.is_dir()):
        order_file = order_dir / "order.json"
        if not order_file.exists():
            continue
        order_id = order_dir.name
        if (order_dir / ".hold").exists():
            out.append(WatchDecision(order_dir, order_id, "hold", "a .hold file is present"))
            continue
        age = time.time() - order_file.stat().st_mtime
        if age < settle_seconds:
            out.append(WatchDecision(order_dir, order_id, "wait", f"order.json changed {age:.0f}s ago"))
            continue

        ws = Workspace.for_order(cfg, order_id)
        state = JobState(ws.state_file, order_id, STAGE_NAMES)
        status = state.overall_status
        if status in ("new", "partial"):
            out.append(WatchDecision(order_dir, order_id, "run", f"status={status}"))
        elif status == FAILED:
            failed = [n for n, s in state.stages.items() if s.status == FAILED]
            out.append(WatchDecision(order_dir, order_id, "skip",
                                     f"failed at {', '.join(failed)} — needs a human, then `run --from <stage>`"))
        else:
            out.append(WatchDecision(order_dir, order_id, "skip", f"status={status}"))
    return out


def watch(cfg: Config, *, once: bool = False, interval: int | None = None,
          settle_seconds: int = SETTLE_SECONDS, log: Logger | None = None) -> list[RunResult]:
    """Poll the inbox until interrupted. Returns the results of this session."""
    log = log or Logger(cfg.log_level)
    cfg.ensure_dirs()
    interval = interval or cfg.watch_interval_s
    results: list[RunResult] = []

    log.info(f"watching {cfg.orders_dir} every {interval}s — Ctrl+C to stop")
    try:
        while True:
            for decision in scan(cfg, settle_seconds=settle_seconds):
                if decision.action != "run":
                    log.debug(f"{decision.order_id}: {decision.action} ({decision.reason})")
                    continue
                log.info(f"picking up {decision.order_id} ({decision.reason})")
                try:
                    result = run_order(cfg, str(decision.order_dir), log=log)
                except VoxSwapError as exc:
                    log.error(f"{decision.order_id}: {exc.render()}")
                    continue
                results.append(result)
                if result.ok:
                    zip_path = (result.delivery or {}).get("zip", "")
                    log.ok(f"{decision.order_id} ready to send: {zip_path}")
                else:
                    log.warn(f"{decision.order_id} stopped at {result.failed_stage}: {result.error}")
            if once:
                break
            time.sleep(interval)
    except KeyboardInterrupt:
        log.info("watcher stopped")
    return results
