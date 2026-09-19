"""Stage framework.

A stage takes the job context, does one job, and returns a one-line summary
plus metrics for `state.json`. Stages talk to each other through files
(`lines.json`, `assets.json`, the audio folders), never through memory, which
is what makes `--from <stage>` and crash recovery work.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..audio import ffmpeg as ff
from ..audio import read_wav
from ..config import Config
from ..consent import ConsentCheck
from ..log import Logger
from ..models import Line, Order
from ..state import JobState
from ..targets import AssetRef, TargetAdapter, get_target
from ..workspace import Workspace


@dataclass
class JobContext:
    order: Order
    cfg: Config
    log: Logger
    ws: Workspace
    state: JobState
    lines: list[Line] = field(default_factory=list)
    assets: list[AssetRef] = field(default_factory=list)
    consent_checks: list[ConsentCheck] = field(default_factory=list)
    force: bool = False
    _target: TargetAdapter | None = None
    _providers: dict[str, Any] = field(default_factory=dict)

    # -- helpers ---------------------------------------------------------

    @property
    def target(self) -> TargetAdapter:
        if self._target is None:
            self._target = get_target(self.order.target.adapter)
        return self._target

    @property
    def asset_root(self) -> Path:
        return self.order.resolve(self.order.target.asset_root)

    @property
    def ffmpeg_ok(self) -> bool:
        return ff.available(self.cfg.ffmpeg, self.cfg.ffprobe)

    def provider(self, kind: str) -> Any:
        """Lazily build and cache a provider. Nothing is constructed — and no
        API key is required — until a stage actually needs it."""
        if kind not in self._providers:
            from ..providers import get_asr, get_translation, get_voice

            chooser = {"asr": get_asr, "translation": get_translation, "voice": get_voice}[kind]
            name = getattr(self.order.providers, kind)
            self._providers[kind] = chooser(name)
            self.log.debug(f"provider[{kind}] = {name}")
        return self._providers[kind]

    def ensure_wav(self, source: Path, key: str) -> Path:
        """Return a PCM WAV for `source`, decoding via ffmpeg if needed.

        Decoded copies live in work/raw/ so the customer's files stay read-only
        and a re-run never decodes twice.
        """
        if source.suffix.lower() == ".wav":
            try:
                read_wav(source)                        # readable as-is?
                return source
            except Exception:                            # noqa: BLE001 - float/compressed WAV, needs ffmpeg
                pass
        cached = self.ws.raw_dir / f"{key}.wav"
        if cached.exists():
            return cached
        if not self.ffmpeg_ok:
            from ..errors import AssetError

            raise AssetError(
                f"cannot read {source.name} without ffmpeg",
                "Install ffmpeg (https://ffmpeg.org/download.html) and re-run. "
                "Only plain PCM WAV works without it.",
            )
        return ff.to_wav(source, cached, ffmpeg=self.cfg.ffmpeg)


@dataclass
class StageResult:
    summary: str
    metrics: dict[str, Any] = field(default_factory=dict)
    skipped: bool = False


class Stage:
    name = "stage"
    title = "Stage"
    #: what the operator sees in `voxswap status`
    description = ""

    def run(self, ctx: JobContext) -> StageResult:      # pragma: no cover - interface
        raise NotImplementedError

    # convenience for subclasses
    @staticmethod
    def active_lines(ctx: JobContext) -> list[Line]:
        return [l for l in ctx.lines if l.status not in ("skipped", "failed")]
