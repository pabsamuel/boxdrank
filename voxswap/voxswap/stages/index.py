"""Stage 2 — index.

Walk the customer's assets and read their script, if they sent one. Nothing is
decoded and nothing is transcribed here: this stage exists so the operator can
see *what we found* before anything expensive happens.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from ..errors import AssetError
from ..scripts import parse_script
from .base import JobContext, Stage, StageResult


class IndexStage(Stage):
    name = "index"
    title = "Index assets"
    description = "Find replaceable audio and read the supplied script"

    def run(self, ctx: JobContext) -> StageResult:
        root = ctx.asset_root
        assets = ctx.target.discover(ctx.order, root)
        if not assets:
            raise AssetError(
                f"no files under {root} matched target.include {ctx.order.target.include}",
                "Check the include patterns — they are matched against paths relative to asset_root, "
                'e.g. "**/*.wav" or "vo/en/**/*.ogg".',
            )
        ctx.assets = assets

        script_lines = []
        if ctx.order.target.script_file:
            script_lines = parse_script(ctx.order.resolve(ctx.order.target.script_file))
            ctx.log.stage(self.name, f"script: {len(script_lines)} lines from {Path(ctx.order.target.script_file).name}")

        by_ext = Counter(Path(a.rel_path).suffix.lower() or "(none)" for a in assets)
        warnings = ctx.target.warnings(assets)
        for warning in warnings:
            ctx.log.warn(warning)

        payload = {
            "root": str(root),
            "count": len(assets),
            "by_extension": dict(by_ext),
            "warnings": warnings,
            "assets": [{"rel_path": a.rel_path, "speaker_hint": a.speaker_hint, "note": a.note} for a in assets],
            "script": [
                {
                    "text": l.text, "speaker": l.speaker, "start_ms": l.start_ms,
                    "end_ms": l.end_ms, "file_hint": l.file_hint,
                }
                for l in script_lines
            ],
        }
        ctx.ws.assets_file.parent.mkdir(parents=True, exist_ok=True)
        ctx.ws.assets_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

        ext_summary = ", ".join(f"{n}x {e}" for e, n in by_ext.most_common(4))
        return StageResult(
            summary=f"{len(assets)} asset(s) [{ext_summary}], {len(script_lines)} script line(s)",
            metrics={"assets": len(assets), "script_lines": len(script_lines), "by_extension": dict(by_ext)},
        )
