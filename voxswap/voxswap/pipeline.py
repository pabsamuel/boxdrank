"""The job runner.

Loads an order, walks the stages, and keeps `state.json` honest so any run can
be resumed. The rules it enforces:

  * one job per order at a time (a lock directory, with stale-lock takeover);
  * a completed stage is never re-run unless asked (`--from`, `--only`, `--force`);
  * a failure stops the pipeline and is written to state with its message, so
    `voxswap status` can tell the operator what to do next;
  * every stage's output is on disk before the next one starts.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Config
from .errors import VoxSwapError
from .log import Logger
from .models import Order, load_lines
from .stages import STAGE_NAMES, STAGES, JobContext, stage_by_name
from .state import DONE, FAILED, JobLock, JobState
from .workspace import Workspace


@dataclass
class RunResult:
    order_id: str
    status: str
    completed: list[str]
    failed_stage: str = ""
    error: str = ""
    delivery: dict | None = None

    @property
    def ok(self) -> bool:
        return self.status == DONE


def load_order(cfg: Config, order_ref: str) -> Order:
    """Accept an order ID, a folder name, or a path to an order folder."""
    candidates = [Path(order_ref), cfg.orders_dir / order_ref]
    for candidate in candidates:
        if (candidate / "order.json").exists():
            return Order.load(candidate.resolve())
    from .errors import OrderError

    raise OrderError(
        f"could not find an order called {order_ref!r}",
        f"Looked in {cfg.orders_dir}. Run `python3 -m voxswap list` to see known orders.",
    )


def run_order(
    cfg: Config,
    order_ref: str,
    *,
    from_stage: str = "",
    only_stage: str = "",
    force: bool = False,
    log: Logger | None = None,
) -> RunResult:
    order = load_order(cfg, order_ref)
    ws = Workspace.for_order(cfg, order.order_id).ensure()
    log = log or Logger(cfg.log_level, file=ws.log_file)

    state = JobState(ws.state_file, order.order_id, STAGE_NAMES)
    if from_stage:
        stage_by_name(from_stage)                        # validate the name before mutating anything
        state.reset_from(from_stage)
    if force and not from_stage and not only_stage:
        state.reset_from(STAGE_NAMES[0])

    ctx = JobContext(order=order, cfg=cfg, log=log, ws=ws, state=state, force=force)
    ctx.lines = load_lines(ws.lines_file)

    selected = [stage_by_name(only_stage)] if only_stage else STAGES
    completed: list[str] = []

    log.info(f"order {order.order_id} — {order.target.title} ({order.target.kind}/{order.target.adapter})")
    if not ctx.ffmpeg_ok:
        log.warn("ffmpeg not found: only PCM WAV input works, and time-stretching uses the built-in method")

    with JobLock(ws.lock_dir):
        for stage in selected:
            if not only_stage and state.is_done(stage.name) and not force:
                log.debug(f"[{stage.name}] already done — skipping")
                continue

            log.info(f"[{stage.name}] {stage.title}...")
            started = state.begin(stage.name)
            try:
                result = stage.run(ctx)
            except VoxSwapError as exc:
                state.fail(stage.name, started, exc.render())
                log.error(f"[{stage.name}] {exc.render()}")
                return RunResult(order.order_id, FAILED, completed, stage.name, exc.render())
            except Exception as exc:                     # noqa: BLE001 - unexpected, but must land in state
                state.fail(stage.name, started, f"{type(exc).__name__}: {exc}")
                log.error(f"[{stage.name}] unexpected error: {type(exc).__name__}: {exc}")
                return RunResult(order.order_id, FAILED, completed, stage.name, f"{type(exc).__name__}: {exc}")

            state.finish(stage.name, started, result.summary, result.metrics, skipped=result.skipped)
            completed.append(stage.name)
            log.ok(f"[{stage.name}] {result.summary}")

            # Keep lines in memory in step with what the stage wrote.
            if ws.lines_file.exists():
                ctx.lines = load_lines(ws.lines_file)

    state.save()
    status = state.overall_status
    if status == DONE:
        log.ok(f"order {order.order_id} complete -> {state.delivery.get('zip', ws.delivery)}")
    return RunResult(order.order_id, status, completed, delivery=state.delivery or None)


def job_status(cfg: Config, order_ref: str) -> dict:
    order = load_order(cfg, order_ref)
    ws = Workspace.for_order(cfg, order.order_id)
    state = JobState(ws.state_file, order.order_id, STAGE_NAMES)
    return {
        "order_id": order.order_id,
        "title": order.target.title,
        "customer": order.customer.name,
        "status": state.overall_status,
        "next_stage": state.next_stage(),
        "updated_at": state.updated_at,
        "delivery": state.delivery,
        "stages": [
            {
                "name": name,
                "status": st.status,
                "summary": st.summary,
                "error": st.error,
                "duration_s": st.duration_s,
            }
            for name, st in state.stages.items()
        ],
    }
