"""Stage 8 — master.

Takes raw provider output and makes it sit in the game or film as if it had
always been there. Four things, in this order:

  1. trim the dead air TTS leaves at both ends;
  2. fit the line to its slot (pad, or pitch-preserving stretch within
     options.max_stretch) — see audio/timefit.py;
  3. match loudness to the clip it replaces, not to a fixed number, so it sits
     in the same mix;
  4. match sample rate and channel count to the original file.

Everything here is local and free, so mastering can be re-run as often as you
like without touching the provider bill:  `--from master`.
"""

from __future__ import annotations

from pathlib import Path

from ..audio import Audio, fit_to_slot, normalize_to, read_wav, resample, to_channels, write_wav
from ..audio import ffmpeg as ff
from ..audio.loudness import match_loudness
from ..models import Line, save_lines
from .base import JobContext, Stage, StageResult


class MasterStage(Stage):
    name = "master"
    title = "Master"
    description = "Fit timing, match loudness and match format to the original"

    def run(self, ctx: JobContext) -> StageResult:
        todo = [l for l in ctx.lines if l.status not in ("skipped", "failed") and l.rendered_rel]
        if not todo:
            return StageResult(summary="nothing to master", skipped=True)

        options = ctx.order.options
        strategies: dict[str, int] = {}
        overflow: list[str] = []
        deltas: list[int] = []
        done = 0

        for line in todo:
            take_path = ctx.ws.synth_dir / line.rendered_rel
            if not take_path.exists():
                line.status = "failed"
                line.note = "take missing from work/synth — re-run synthesize"
                continue
            try:
                audio = self._load(ctx, take_path, line)
                reference = self._reference(ctx, line)

                slot = line.source_duration_ms or (line.end_ms - line.start_ms)
                fit = fit_to_slot(
                    audio,
                    slot,
                    max_stretch=options.max_stretch,
                    preserve_timing=options.preserve_timing and slot > 0,
                    pad_where="both" if ctx.order.target.adapter == "video" else "end",
                    tmp_dir=ctx.ws.tmp_dir,
                    ffmpeg_bin=ctx.cfg.ffmpeg,
                    ffprobe_bin=ctx.cfg.ffprobe,
                )
                out = fit.audio

                if reference is not None:
                    out, applied = match_loudness(out, reference, fallback_lufs=options.target_lufs)
                else:
                    out, _, applied = normalize_to(out, options.target_lufs)

                if reference is not None:
                    out = to_channels(out, reference.channels)
                    out = resample(out, reference.sample_rate)

                target = ctx.ws.master_dir / f"{line.line_id}.wav"
                write_wav(target, out)

                line.mastered_rel = target.name
                line.final_duration_ms = out.duration_ms
                line.status = "done"
                strategies[fit.strategy] = strategies.get(fit.strategy, 0) + 1
                deltas.append(abs(fit.delta_ms))
                if fit.strategy == "overflow":
                    overflow.append(line.line_id)
                    line.note = (line.note + "; " if line.note else "") + fit.note
                ctx.log.debug(f"{line.line_id}: {fit.strategy} {fit.stretch:.2f}x, {applied:+.1f} dB, {out.duration_ms} ms")
                done += 1
            except Exception as exc:  # noqa: BLE001 - one bad line must not kill the batch
                line.status = "failed"
                line.note = f"mastering failed: {exc}"
                ctx.log.error(f"{line.line_id}: {exc}")

        save_lines(ctx.ws.lines_file, ctx.lines)
        ctx.ws.clean_tmp()

        median = sorted(deltas)[len(deltas) // 2] if deltas else 0
        summary = f"{done} line(s) mastered, median slot error {median} ms"
        if overflow:
            summary += f", {len(overflow)} over slot"
        return StageResult(
            summary=summary,
            metrics={"mastered": done, "strategies": strategies, "median_delta_ms": median,
                     "overflow": overflow[:20], "overflow_count": len(overflow)},
        )

    # -- helpers ---------------------------------------------------------

    def _load(self, ctx: JobContext, path: Path, line: Line) -> Audio:
        """Read a take, decoding first if the provider returned mp3/opus."""
        if path.suffix.lower() != ".wav":
            if not ctx.ffmpeg_ok:
                raise RuntimeError(
                    f"take is {path.suffix} and ffmpeg is not installed; "
                    "set VOXSWAP_ELEVEN_OUTPUT_FORMAT to a pcm_* value or install ffmpeg"
                )
            path = ff.to_wav(path, ctx.ws.tmp_dir / f"{line.line_id}.decoded.wav", ffmpeg=ctx.cfg.ffmpeg)
        return read_wav(path)

    def _reference(self, ctx: JobContext, line: Line) -> Audio | None:
        """The original clip, used as the loudness and format target.

        For film we deliberately do not use the whole film as a reference — the
        slot is a few seconds of a two-hour mix — so those lines fall back to
        options.target_lufs.
        """
        if ctx.order.target.adapter == "video":
            return None
        source = ctx.asset_root / line.source_rel
        if not source.exists():
            return None
        try:
            wav = ctx.ensure_wav(source, line.line_id)
            return read_wav(wav)
        except Exception:  # noqa: BLE001 - reference is an optimisation, not a requirement
            return None
