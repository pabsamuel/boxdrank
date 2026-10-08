"""Stage 5 — translate.

Skipped entirely when source and target language are the same (the common case:
"my own voice, same English script").

When it does run, it translates in file order rather than shuffling lines into
one big batch, because neighbouring lines are usually the same conversation and
context is what keeps a dub coherent.
"""

from __future__ import annotations

from ..models import save_lines
from .base import JobContext, Stage, StageResult

_BATCH = 40


class TranslateStage(Stage):
    name = "translate"
    title = "Translate"
    description = "Rewrite the script into the target language, length-matched for dubbing"

    def run(self, ctx: JobContext) -> StageResult:
        language = ctx.order.language
        if not language.needs_translation:
            return StageResult(summary=f"source and target are both {language.target} — no translation needed", skipped=True)

        todo = [l for l in ctx.lines if l.status != "skipped" and l.text.strip() and not l.translated_text.strip()]
        if not todo:
            return StageResult(summary="nothing left to translate", skipped=True)

        provider = ctx.provider("translation")
        context = (
            f"{ctx.order.target.kind} '{ctx.order.target.title}'. "
            f"Characters being re-voiced: {', '.join(r.display_name for r in ctx.order.roles)}."
        )
        ctx.log.stage(self.name, f"translating {len(todo)} line(s) {language.source} -> {language.target}")

        done = 0
        for start in range(0, len(todo), _BATCH):
            batch = todo[start : start + _BATCH]
            results = provider.translate(
                [l.text for l in batch],
                source=language.source,
                target=language.target,
                context=context,
                length_match=ctx.order.options.preserve_timing,
            )
            for line, text in zip(batch, results):
                line.translated_text = text.strip()
            done += len(batch)
            save_lines(ctx.ws.lines_file, ctx.lines)     # checkpoint: a crash never re-pays for finished batches
            ctx.log.debug(f"translated {done}/{len(todo)}")

        missing = sum(1 for l in todo if not l.translated_text.strip())
        for line in todo:
            if not line.translated_text.strip():
                line.translated_text = line.text         # fall back to the original rather than dropping the line
                line.note = (line.note + "; " if line.note else "") + "translation empty, kept source text"
        save_lines(ctx.ws.lines_file, ctx.lines)

        return StageResult(
            summary=f"{len(todo)} line(s) translated to {language.target}" + (f", {missing} fell back to source" if missing else ""),
            metrics={"translated": len(todo), "fallback": missing, "provider": ctx.order.providers.translation},
        )
