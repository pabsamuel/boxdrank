"""The pipeline, in order.

Ordering is deliberate:

  * `plan` runs before `transcribe` so we only ever pay to transcribe clips we
    are actually going to replace;
  * `qc` runs before `package` so a failing build never produces a deliverable;
  * everything local (`master`, `qc`, `package`) sits after everything paid
    (`transcribe`, `translate`, `voice`, `synthesize`), so re-runs are free
    unless you explicitly go back.
"""

from __future__ import annotations

from .base import JobContext, Stage, StageResult  # noqa: F401
from .index import IndexStage
from .intake import IntakeStage
from .master import MasterStage
from .package import PackageStage
from .plan import PlanStage
from .qc import QCStage
from .synthesize import SynthesizeStage
from .transcribe import TranscribeStage
from .translate import TranslateStage
from .voice import VoiceStage

STAGES: list[Stage] = [
    IntakeStage(),
    IndexStage(),
    PlanStage(),
    TranscribeStage(),
    TranslateStage(),
    VoiceStage(),
    SynthesizeStage(),
    MasterStage(),
    QCStage(),
    PackageStage(),
]

STAGE_NAMES = [s.name for s in STAGES]


def stage_by_name(name: str) -> Stage:
    for stage in STAGES:
        if stage.name == name:
            return stage
    from ..errors import StageError

    raise StageError(f"unknown stage {name!r}", f"Stages, in order: {', '.join(STAGE_NAMES)}")


__all__ = ["STAGES", "STAGE_NAMES", "stage_by_name", "Stage", "StageResult", "JobContext"]
