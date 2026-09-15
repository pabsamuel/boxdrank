"""Stage 7 — synthesize.

The expensive stage. Two rules protect the budget:

  * a take that already exists on disk is never re-generated (delete the file,
    or pass --force, to redo one line);
  * failures are per line — one bad line does not throw away the other 4,000.

Takes land in work/<order>/synth/ exactly as the provider returned them. All
fitting, levelling and format matching happens in the next stage, so a re-master
never costs another synthesis call.
"""

from __future__ import annotations

from pathlib import Path

from ..models import Line, save_lines
from ..parallel import map_workers
from ..providers.base import SynthesisRequest
from .base import JobContext, Stage, StageResult


class SynthesizeStage(Stage):
    name = "synthesize"
    title = "Synthesise"
    description = "Generate every line in the customer's voice"

    def run(self, ctx: JobContext) -> StageResult:
        todo = [l for l in ctx.lines if l.status not in ("skipped", "failed") and l.speak_text.strip()]
        if not todo:
            return StageResult(summary="no lines to synthesise", skipped=True)

        provider = ctx.provider("voice")
        role_style = {r.role_id: r.style for r in ctx.order.roles}
        role_voice = {r.role_id: r.voice_id for r in ctx.order.roles}
        language = ctx.order.language.target

        reused = 0
        pending: list[Line] = []
        for line in todo:
            out_path = ctx.ws.synth_dir / f"{line.line_id}.wav"
            if out_path.exists() and not ctx.force:
                line.rendered_rel = out_path.name
                reused += 1
                continue
            pending.append(line)

        if reused:
            ctx.log.stage(self.name, f"reusing {reused} take(s) already on disk")
        if not pending:
            save_lines(ctx.ws.lines_file, ctx.lines)
            return StageResult(summary=f"all {reused} take(s) already existed", metrics={"reused": reused})

        ctx.log.stage(self.name, f"synthesising {len(pending)} line(s) with {ctx.order.providers.voice}")

        def work(line: Line) -> Path:
            voice = ctx.order.voice(role_voice[line.role_id])
            if not voice.provider_voice_id:
                raise RuntimeError(f"voice {voice.voice_id!r} has no clone — run the voice stage first")
            rate, channels = _source_format(ctx, line)
            request = SynthesisRequest(
                text=line.speak_text,
                provider_voice_id=voice.provider_voice_id,
                language=language,
                style=role_style.get(line.role_id, "neutral"),
                emotion=line.emotion,
                target_duration_ms=line.source_duration_ms,
                sample_rate=rate,
                channels=channels,
            )
            return provider.synthesize(request, ctx.ws.synth_dir / f"{line.line_id}.wav")

        def done(line: Line, path: Path) -> None:
            line.rendered_rel = path.name
            line.status = "pending"                      # mastering will mark it done

        def error(line: Line, exc: Exception) -> None:
            line.status = "failed"
            line.note = f"synthesis failed: {exc}"
            ctx.log.error(f"{line.line_id}: {exc}")

        ok, failed = map_workers(
            pending, work,
            workers=ctx.order.options.max_parallel,
            on_done=done,
            on_error=error,
            progress=lambda n, t: ctx.log.info(f"  synthesised {n}/{t}") if n % 25 == 0 or n == t else None,
        )
        save_lines(ctx.ws.lines_file, ctx.lines)

        characters = sum(len(l.speak_text) for l in pending)
        return StageResult(
            summary=f"{ok} take(s) generated, {reused} reused, {failed} failed ({characters} characters)",
            metrics={"generated": ok, "reused": reused, "failed": failed, "characters": characters},
        )


def _source_format(ctx: JobContext, line: Line) -> tuple[int, int]:
    """Ask the provider for audio shaped like the clip we are replacing.

    Getting this right here means the master stage rarely has to resample, and
    resampling is the step most likely to add artefacts.
    """
    source = ctx.asset_root / line.source_rel
    if source.suffix.lower() == ".wav":
        try:
            from ..audio import probe_wav

            _, rate, channels = probe_wav(source)
            if rate:
                return rate, min(channels or 1, 2)
        except Exception:                                # noqa: BLE001 - fall back to defaults
            pass
    return 48000, 1
