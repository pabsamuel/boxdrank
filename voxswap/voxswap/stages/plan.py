"""Stage 3 — plan.

Turn "files + script" into "lines we are going to replace, and who says them".

Role assignment is where a job silently goes wrong: match too loosely and you
re-voice the whole cast, too tightly and you re-voice nothing. So this stage is
deliberately explicit about what it matched, writes the decision onto every
line, and reports the counts. A human should read that report before paying for
synthesis — `--only plan` exists for exactly that.
"""

from __future__ import annotations

import fnmatch
import json
import re
from collections import Counter
from pathlib import Path

from ..errors import AssetError
from ..ids import line_id
from ..models import Line, save_lines
from ..scripts import ScriptLine
from .base import JobContext, Stage, StageResult

_SHOUT = re.compile(r"[!?]{2,}|\b[A-Z]{3,}\b")
_TRAIL = re.compile(r"\.{3}\s*$")


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


class PlanStage(Stage):
    name = "plan"
    title = "Plan lines"
    description = "Assign characters to clips and attach the script text"

    def run(self, ctx: JobContext) -> StageResult:
        data = json.loads(ctx.ws.assets_file.read_text(encoding="utf-8"))
        assets = data["assets"]
        script = [ScriptLine(**{k: v for k, v in s.items()}) for s in data.get("script", [])]

        lines = (
            self._plan_video(ctx, assets, script)
            if ctx.order.target.adapter == "video"
            else self._plan_clips(ctx, assets, script)
        )
        if not any(l.status != "skipped" for l in lines):
            raise AssetError(
                f"none of the {len(lines)} clip(s) matched any role",
                "Check roles[].match patterns against the paths in work/<order>/assets.json. "
                'Patterns are globs on the relative path, e.g. "vo/v_male/*.wav".',
            )

        self._annotate_emotions(ctx, lines)

        matched = [l for l in lines if l.status != "skipped"]
        per_role = Counter(l.role_id for l in matched)
        ctx.lines = lines
        save_lines(ctx.ws.lines_file, lines)

        for role_id, count in per_role.most_common():
            ctx.log.stage(self.name, f"role {role_id}: {count} line(s)")
        skipped = len(lines) - len(matched)
        if skipped:
            ctx.log.stage(self.name, f"{skipped} clip(s) matched no role and will be left untouched")

        limit = ctx.order.options.dry_run_limit
        if limit:
            kept = 0
            for line in lines:
                if line.status == "skipped":
                    continue
                kept += 1
                if kept > limit:
                    line.status = "skipped"
                    line.note = "beyond options.dry_run_limit"
            save_lines(ctx.ws.lines_file, lines)
            ctx.log.warn(f"dry_run_limit={limit}: only {min(limit, len(matched))} line(s) will be produced")

        return StageResult(
            summary=f"{len(matched)} line(s) across {len(per_role)} role(s), {skipped} untouched",
            metrics={"matched": len(matched), "skipped": skipped, "per_role": dict(per_role),
                     "with_text": sum(1 for l in matched if l.text)},
        )

    # -- clip-per-line targets (games) -----------------------------------

    def _plan_clips(self, ctx: JobContext, assets: list[dict], script: list[ScriptLine]) -> list[Line]:
        by_hint: dict[str, list[ScriptLine]] = {}
        for entry in script:
            if entry.file_hint:
                by_hint.setdefault(_norm(entry.file_hint), []).append(entry)

        lines: list[Line] = []
        for asset in assets:
            rel = asset["rel_path"]
            stem = _norm(Path(rel).stem)
            matches = by_hint.get(stem) or by_hint.get(_norm(rel)) or []
            speaker = (matches[0].speaker if matches else "") or ctx.target.speaker_hint(rel)

            role = self._match_role(ctx, rel, speaker)
            duration = self._duration_ms(ctx, rel)

            if not matches:
                lines.append(
                    self._make_line(ctx, rel, 0, 0, duration, role, speaker, "", duration)
                )
                continue
            for index, entry in enumerate(matches):     # a clip may hold several scripted lines
                slot = entry.duration_ms or duration
                lines.append(
                    self._make_line(ctx, rel, index, entry.start_ms, entry.end_ms or slot, role,
                                    entry.speaker or speaker, entry.text, slot or duration)
                )
        return lines

    # -- timeline targets (film) -----------------------------------------

    def _plan_video(self, ctx: JobContext, assets: list[dict], script: list[ScriptLine]) -> list[Line]:
        if not script:
            raise AssetError(
                "a movie target needs a script/subtitle file",
                'Set target.script_file to the .srt/.vtt for the film — it gives us the lines and their timings.',
            )
        rel = assets[0]["rel_path"]
        lines: list[Line] = []
        for index, entry in enumerate(script):
            role = self._match_role(ctx, rel, entry.speaker)
            lines.append(
                self._make_line(ctx, rel, index, entry.start_ms, entry.end_ms, role,
                                entry.speaker, entry.text, entry.duration_ms)
            )
        return lines

    # -- shared ----------------------------------------------------------

    def _make_line(self, ctx: JobContext, rel: str, index: int, start_ms: int, end_ms: int,
                   role_id: str, speaker: str, text: str, slot_ms: int) -> Line:
        line = Line(
            line_id=line_id(rel, index, start_ms),
            source_rel=rel,
            role_id=role_id or "",
            index=index,
            start_ms=start_ms,
            end_ms=end_ms,
            speaker_label=speaker,
            text=text,
            source_duration_ms=slot_ms,
            emotion=_guess_emotion(text),
        )
        if not role_id:
            line.status = "skipped"
            line.note = "no role matched this clip"
        return line

    def _match_role(self, ctx: JobContext, rel: str, speaker: str) -> str:
        """First role whose pattern matches wins, so order in roles[] is priority."""
        rel_l = rel.lower()
        name_l = Path(rel).name.lower()
        speaker_n = _norm(speaker)
        for role in ctx.order.roles:
            for pattern in role.match_speakers:
                if speaker_n and _norm(pattern) and _norm(pattern) in speaker_n:
                    return role.role_id
            for pattern in role.match:
                p = pattern.lower()
                if fnmatch.fnmatch(rel_l, p) or fnmatch.fnmatch(name_l, p) or p.strip("*") in rel_l:
                    return role.role_id
        # A single role with no patterns at all means "everything is this character".
        if len(ctx.order.roles) == 1 and not ctx.order.roles[0].match and not ctx.order.roles[0].match_speakers:
            return ctx.order.roles[0].role_id
        return ""

    def _duration_ms(self, ctx: JobContext, rel: str) -> int:
        path = ctx.asset_root / rel
        if path.suffix.lower() == ".wav":
            try:
                from ..audio import probe_wav

                return probe_wav(path)[0]
            except Exception:                            # noqa: BLE001 - fall through to ffprobe
                pass
        if ctx.ffmpeg_ok:
            from ..audio import ffmpeg as ff

            try:
                return ff.duration_ms(path, ctx.cfg.ffprobe)
            except Exception:                            # noqa: BLE001 - unknown duration is survivable
                return 0
        return 0

    def _annotate_emotions(self, ctx: JobContext, lines: list[Line]) -> None:
        """Ask the translation provider for delivery labels, if it can do that.

        Optional by design: the heuristic labels set in `_make_line` are already
        usable, and this must never be the reason a job fails.
        """
        if not ctx.order.options.emotion_transfer:
            return
        candidates = [l for l in lines if l.status != "skipped" and l.text]
        if not candidates:
            return
        provider = ctx.provider("translation")
        annotate = getattr(provider, "annotate_emotions", None)
        if annotate is None:
            return
        try:
            labels = annotate([l.text for l in candidates])
        except Exception as exc:                         # noqa: BLE001 - never fail a job over a style hint
            ctx.log.warn(f"emotion annotation skipped: {exc}")
            return
        for line, label in zip(candidates, labels):
            if label:
                line.emotion = label


def _guess_emotion(text: str) -> str:
    """Cheap heuristic used when no model labels the line."""
    if not text:
        return "neutral"
    if _SHOUT.search(text):
        return "shouting"
    if _TRAIL.search(text):
        return "tired"
    if text.rstrip().endswith("?"):
        return "neutral"
    return "neutral"
