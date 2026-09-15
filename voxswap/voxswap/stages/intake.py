"""Stage 1 — intake.

Validate everything that can be validated before a single cent is spent:
the order parses, the consent holds, the assets exist, the providers named in
the order are real. Failing here is cheap; failing in synthesis is not.
"""

from __future__ import annotations

from ..consent import verify_order
from ..errors import AssetError, OrderError
from ..providers import catalogue
from .base import JobContext, Stage, StageResult


class IntakeStage(Stage):
    name = "intake"
    title = "Intake & consent"
    description = "Validate the order, the paperwork and the assets"

    def run(self, ctx: JobContext) -> StageResult:
        order = ctx.order

        # 1. consent first — everything else is moot without it
        checks = verify_order(order)
        ctx.consent_checks = checks
        for check in checks:
            ctx.log.stage(self.name, f"consent OK: {check.person_name} ({check.voice_id}), {check.sample_seconds}s of samples")
            for warning in check.warnings:
                ctx.log.warn(f"  {warning}")

        # 2. assets
        root = ctx.asset_root
        if not root.exists():
            raise AssetError(
                f"target.asset_root does not exist: {root}",
                "Point it at the folder holding the game/film audio, relative to the order folder.",
            )
        if not any(root.rglob("*")):
            raise AssetError(f"target.asset_root is empty: {root}", "Did the customer's upload finish?")

        # 3. script file, if one was promised
        if order.target.script_file:
            script = order.resolve(order.target.script_file)
            if not script.exists():
                raise AssetError(
                    f"target.script_file does not exist: {script}",
                    "Remove the field to fall back to automatic transcription, or fix the path.",
                )

        # 4. providers exist (a typo here would otherwise surface hours later)
        available = catalogue()
        for kind in ("asr", "translation", "voice"):
            name = getattr(order.providers, kind)
            if name not in available[kind]:
                raise OrderError(
                    f"providers.{kind} = {name!r} is not a known provider",
                    f"Available {kind} providers: {', '.join(available[kind])}.",
                )

        # 5. sanity: roles must be bound to distinct characters we can find later
        role_ids = [r.role_id for r in order.roles]
        if len(set(role_ids)) != len(role_ids):
            raise OrderError("duplicate role_id in roles[]", "Each role_id must be unique within an order.")
        unmatched = [r.role_id for r in order.roles if not r.match and not r.match_speakers]
        if unmatched and len(order.roles) > 1:
            raise OrderError(
                f"roles {unmatched} have no match patterns, but the order has several roles",
                "With more than one role, every role needs match/match_speakers so lines can be assigned. "
                "A single role with no patterns means 'replace everything'.",
            )

        ctx.ws.ensure()
        target_note = f"{order.target.kind}/{order.target.adapter}"
        return StageResult(
            summary=f"{len(checks)} voice(s) cleared, target {target_note}, assets at {root.name}/",
            metrics={
                "voices": len(checks),
                "sample_seconds": {c.voice_id: c.sample_seconds for c in checks},
                "warnings": [w for c in checks for w in c.warnings],
                "ffmpeg": ctx.ffmpeg_ok,
            },
        )
