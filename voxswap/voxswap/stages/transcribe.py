"""Stage 4 — transcribe.

Fills in text for lines the script did not cover. Two rules keep this cheap:

  * only lines that were matched to a role are transcribed — never transcribe
    audio you are not going to replace;
  * lines that already have script text are skipped entirely.

On a game with a supplied dialogue table, this stage usually does nothing at
all, which is the point.
"""

from __future__ import annotations

from ..models import Line, save_lines
from ..parallel import map_workers
from .base import JobContext, Stage, StageResult


class TranscribeStage(Stage):
    name = "transcribe"
    title = "Transcribe"
    description = "Recover text for lines the customer's script did not cover"

    def run(self, ctx: JobContext) -> StageResult:
        todo = [l for l in ctx.lines if l.status != "skipped" and not l.text.strip()]
        if not todo:
            return StageResult(summary="every line already had text — nothing to transcribe", skipped=True)

        provider = ctx.provider("asr")
        language = ctx.order.language.source
        total = len(todo)
        ctx.log.stage(self.name, f"transcribing {total} line(s) with {ctx.order.providers.asr}")

        def work(line: Line) -> str:
            source = ctx.asset_root / line.source_rel
            wav = ctx.ensure_wav(source, line.line_id)
            transcript = provider.transcribe(wav, language=language)
            if line.end_ms > line.start_ms and transcript.segments:
                # A slice of a longer file: keep only the segments inside the slot.
                inside = [s.text for s in transcript.segments
                          if s.start_ms >= line.start_ms - 250 and s.end_ms <= line.end_ms + 250]
                if inside:
                    return " ".join(t.strip() for t in inside).strip()
            return transcript.text.strip()

        def done(line: Line, text: str) -> None:
            line.text = text
            if not text:
                line.status = "skipped"
                line.note = "no speech detected"

        def error(line: Line, exc: Exception) -> None:
            line.status = "failed"
            line.note = f"transcription failed: {exc}"
            ctx.log.error(f"{line.line_id} ({line.source_rel}): {exc}")

        ok, failed = map_workers(
            todo, work,
            workers=ctx.order.options.max_parallel,
            on_done=done,
            on_error=error,
            progress=lambda n, t: ctx.log.debug(f"transcribed {n}/{t}"),
        )
        save_lines(ctx.ws.lines_file, ctx.lines)

        empty = sum(1 for l in todo if l.status == "skipped" and l.note == "no speech detected")
        return StageResult(
            summary=f"{ok} transcribed, {failed} failed, {empty} had no speech",
            metrics={"transcribed": ok, "failed": failed, "empty": empty},
        )
