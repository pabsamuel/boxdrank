"""Stage 9 — QC.

Runs before packaging, deliberately: a package that fails QC should never
exist, because the one thing worse than a late delivery is a delivery the
customer has to listen through to discover is broken.

Checks, per line:
  * did we produce a file at all;
  * is it silent (a provider returning 200 OK and a second of nothing is a
    real and common failure);
  * is it clipped;
  * how far is it from its slot.

And per job: how many lines actually made it. The job fails if fewer than
options.qc_min_pass_rate of the planned lines are usable.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from ..audio import peak, read_wav, rms
from ..errors import QualityGateError
from ..ids import utc_now_iso
from .base import JobContext, Stage, StageResult

SILENT_RMS = 0.0015
CLIP_PEAK = 0.999


@dataclass
class Finding:
    line_id: str
    source_rel: str
    kind: str
    detail: str


@dataclass
class QCReport:
    order_id: str
    generated_at: str
    planned: int = 0
    delivered: int = 0
    failed: int = 0
    skipped: int = 0
    pass_rate: float = 0.0
    findings: list[Finding] = field(default_factory=list)
    duration_stats: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "order_id": self.order_id,
            "generated_at": self.generated_at,
            "planned": self.planned,
            "delivered": self.delivered,
            "failed": self.failed,
            "skipped": self.skipped,
            "pass_rate": round(self.pass_rate, 4),
            "duration_stats_ms": self.duration_stats,
            "findings": [f.__dict__ for f in self.findings],
        }


class QCStage(Stage):
    name = "qc"
    title = "Quality check"
    description = "Verify every delivered line before the package is built"

    def run(self, ctx: JobContext) -> StageResult:
        options = ctx.order.options
        planned = [l for l in ctx.lines if l.status != "skipped"]
        report = QCReport(order_id=ctx.order.order_id, generated_at=utc_now_iso())
        report.planned = len(planned)
        report.skipped = sum(1 for l in ctx.lines if l.status == "skipped")

        deltas: list[int] = []
        for line in planned:
            if line.status == "failed" or not line.mastered_rel:
                report.failed += 1
                report.findings.append(Finding(line.line_id, line.source_rel, "failed",
                                               line.note or "no audio was produced"))
                continue
            path = ctx.ws.master_dir / line.mastered_rel
            if not path.exists():
                report.failed += 1
                report.findings.append(Finding(line.line_id, line.source_rel, "missing",
                                               f"expected {path.name} in work/master"))
                continue
            try:
                audio = read_wav(path)
            except Exception as exc:  # noqa: BLE001 - unreadable output is a QC failure, not a crash
                report.failed += 1
                report.findings.append(Finding(line.line_id, line.source_rel, "unreadable", str(exc)))
                continue

            level = rms(audio)
            if level < SILENT_RMS:
                report.failed += 1
                report.findings.append(Finding(line.line_id, line.source_rel, "silent",
                                               f"RMS {level:.5f} — the provider returned no speech"))
                continue
            if peak(audio) >= CLIP_PEAK:
                report.findings.append(Finding(line.line_id, line.source_rel, "clipping",
                                               "peaks at full scale; lower options.target_lufs"))

            slot = line.source_duration_ms or (line.end_ms - line.start_ms)
            if slot:
                delta = audio.duration_ms - slot
                deltas.append(abs(delta))
                if abs(delta) > options.qc_max_duration_delta_ms:
                    report.findings.append(Finding(
                        line.line_id, line.source_rel, "timing",
                        f"{delta:+d} ms against a {slot} ms slot",
                    ))
            report.delivered += 1

        report.pass_rate = (report.delivered / report.planned) if report.planned else 0.0
        if deltas:
            ordered = sorted(deltas)
            report.duration_stats = {
                "median": ordered[len(ordered) // 2],
                "p90": ordered[int(len(ordered) * 0.9)] if len(ordered) > 1 else ordered[0],
                "worst": ordered[-1],
            }

        self._write(ctx, report)

        timing = sum(1 for f in report.findings if f.kind == "timing")
        summary = (f"{report.delivered}/{report.planned} line(s) usable "
                   f"({report.pass_rate * 100:.1f}%), {timing} outside timing tolerance")

        if report.pass_rate < options.qc_min_pass_rate:
            raise QualityGateError(
                f"only {report.pass_rate * 100:.1f}% of lines passed QC "
                f"(need {options.qc_min_pass_rate * 100:.0f}%) — nothing was packaged",
                f"Read {ctx.ws.report_dir / 'qc.md'}, fix the cause, then re-run with "
                f"--from synthesize (or --from master if the takes are fine).",
            )
        return StageResult(summary=summary, metrics=report.to_dict())

    def _write(self, ctx: JobContext, report: QCReport) -> None:
        ctx.ws.report_dir.mkdir(parents=True, exist_ok=True)
        (ctx.ws.report_dir / "qc.json").write_text(
            json.dumps(report.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")

        by_kind: dict[str, list[Finding]] = {}
        for finding in report.findings:
            by_kind.setdefault(finding.kind, []).append(finding)

        rows = [
            f"# QC report — {report.order_id}",
            "",
            f"Generated {report.generated_at}",
            "",
            "| Metric | Value |",
            "| --- | --- |",
            f"| Lines planned | {report.planned} |",
            f"| Lines delivered | {report.delivered} |",
            f"| Lines failed | {report.failed} |",
            f"| Clips left untouched | {report.skipped} |",
            f"| Pass rate | {report.pass_rate * 100:.1f}% |",
        ]
        if report.duration_stats:
            rows += [
                f"| Slot error (median) | {report.duration_stats['median']} ms |",
                f"| Slot error (p90) | {report.duration_stats['p90']} ms |",
                f"| Slot error (worst) | {report.duration_stats['worst']} ms |",
            ]
        rows.append("")

        if not report.findings:
            rows.append("No findings. Every line is within tolerance.")
        for kind, findings in sorted(by_kind.items(), key=lambda kv: -len(kv[1])):
            rows += ["", f"## {kind} ({len(findings)})", ""]
            for finding in findings[:100]:
                rows.append(f"* `{finding.line_id}` — {finding.source_rel} — {finding.detail}")
            if len(findings) > 100:
                rows.append(f"* ... and {len(findings) - 100} more (see qc.json)")
        rows.append("")
        (ctx.ws.report_dir / "qc.md").write_text("\n".join(rows), encoding="utf-8")
