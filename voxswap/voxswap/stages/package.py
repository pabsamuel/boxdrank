"""Stage 10 — package.

Build what the customer actually receives:

    delivery/<order_id>/
        README.md         what this is, in plain language
        INSTALL.md        target-specific, step-by-step
        WARNINGS.md       only when there is something they must know
        manifest.json     every delivered file, its original, and checksums
        qc.md             the same quality report the operator saw
        script.csv        every line, original text and spoken text
        audio/ | dub/     the actual audio

The manifest is the part that makes this reversible: it lists the original
checksum of every file we replace, so a customer can always prove what changed
and restore it.
"""

from __future__ import annotations

import csv
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from ..audio import ffmpeg as ff
from ..audio.mixdown import Cue, build_track
from ..ids import utc_now_iso
from ..models import Line
from .base import JobContext, Stage, StageResult


class PackageStage(Stage):
    name = "package"
    title = "Package"
    description = "Build the delivery folder and ZIP the customer installs"

    def run(self, ctx: JobContext) -> StageResult:
        delivered = [l for l in ctx.lines if l.status == "done" and l.mastered_rel]
        if not delivered:
            from ..errors import StageError

            raise StageError("no finished lines to package", "Check the QC report and re-run synthesis.")

        out = ctx.ws.delivery
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True, exist_ok=True)

        if ctx.order.target.adapter == "video":
            entries, extra = self._package_video(ctx, delivered, out)
        else:
            entries, extra = self._package_clips(ctx, delivered, out)

        self._write_manifest(ctx, out, entries, extra)
        self._write_script(ctx, out, delivered)
        self._write_readme(ctx, out, entries, extra)
        self._copy_reports(ctx, out)
        archive = self._zip(ctx, out)

        size_mb = archive.stat().st_size / (1024 * 1024)
        ctx.state.delivery = {
            "folder": str(out),
            "zip": str(archive),
            "files": len(entries),
            "size_mb": round(size_mb, 2),
            "built_at": utc_now_iso(),
        }
        return StageResult(
            summary=f"{len(entries)} file(s), {size_mb:.1f} MB -> {archive.name}",
            metrics={"files": len(entries), "zip": str(archive), "size_mb": round(size_mb, 2)},
        )

    # -- clip targets ----------------------------------------------------

    def _package_clips(self, ctx: JobContext, lines: list[Line], out: Path) -> tuple[list[dict], dict]:
        audio_dir = out / "audio"
        entries: list[dict] = []
        converted = failed_convert = 0

        for line in lines:
            source = ctx.asset_root / line.source_rel
            master = ctx.ws.master_dir / line.mastered_rel
            rel_target = Path(ctx.target.delivery_path(ctx.order, line))
            dest = audio_dir / rel_target
            dest.parent.mkdir(parents=True, exist_ok=True)

            suffix = source.suffix.lower()
            want_source_format = ctx.order.target.output_format == "source" and suffix not in ("", ".wav")
            note = ""
            if want_source_format and ctx.ffmpeg_ok:
                try:
                    profile = ff.audio_profile(source, ctx.cfg.ffprobe)
                    ff.from_wav(
                        master, dest,
                        codec=profile.get("codec", ""),
                        bit_rate=profile.get("bit_rate", 0),
                        sample_rate=profile.get("sample_rate", 0),
                        channels=profile.get("channels", 0),
                        ffmpeg=ctx.cfg.ffmpeg,
                    )
                    converted += 1
                except Exception as exc:                 # noqa: BLE001 - fall back to WAV, never lose the line
                    dest = dest.with_suffix(".wav")
                    shutil.copyfile(master, dest)
                    note = f"delivered as WAV (re-encode failed: {exc})"
                    failed_convert += 1
            elif want_source_format:
                dest = dest.with_suffix(".wav")
                shutil.copyfile(master, dest)
                note = "delivered as WAV — install ffmpeg to match the original format"
                failed_convert += 1
            else:
                shutil.copyfile(master, dest)

            entries.append({
                "line_id": line.line_id,
                "role": line.role_id,
                "speaker": line.speaker_label,
                "original": line.source_rel,
                "original_sha256": _sha256(source) if source.exists() else "",
                "delivered": str(dest.relative_to(out)).replace("\\", "/"),
                "delivered_sha256": _sha256(dest),
                "duration_ms": line.final_duration_ms,
                "original_duration_ms": line.source_duration_ms,
                "note": (line.note + ("; " + note if note else "")) if line.note else note,
            })

        return entries, {"converted": converted, "delivered_as_wav": failed_convert}

    # -- film ------------------------------------------------------------

    def _package_video(self, ctx: JobContext, lines: list[Line], out: Path) -> tuple[list[dict], dict]:
        dub_dir = out / "dub"
        lines_dir = out / "lines"
        lines_dir.mkdir(parents=True, exist_ok=True)

        source_rel = lines[0].source_rel
        source = ctx.asset_root / source_rel
        stem = Path(source_rel).stem

        entries: list[dict] = []
        cues: list[Cue] = []
        for line in lines:
            master = ctx.ws.master_dir / line.mastered_rel
            take = lines_dir / f"{line.line_id}.wav"
            shutil.copyfile(master, take)
            cues.append(Cue(start_ms=line.start_ms, audio_path=take))
            entries.append({
                "line_id": line.line_id,
                "role": line.role_id,
                "speaker": line.speaker_label,
                "start_ms": line.start_ms,
                "delivered": str(take.relative_to(out)).replace("\\", "/"),
                "delivered_sha256": _sha256(take),
                "duration_ms": line.final_duration_ms,
            })

        total_ms = max((l.end_ms for l in lines), default=0) + 5000
        if ctx.ffmpeg_ok and source.exists():
            try:
                total_ms = max(total_ms, ff.duration_ms(source, ctx.cfg.ffprobe))
            except Exception:                            # noqa: BLE001 - our own estimate will do
                pass

        ctx.log.stage(self.name, f"building a {total_ms // 1000}s dub track from {len(cues)} line(s)")
        track = build_track(
            cues,
            dub_dir / f"{stem}.dub.wav",
            total_ms=total_ms,
            sample_rate=48000,
            channels=1,
            bed=source if source.exists() else None,
            ffmpeg_bin=ctx.cfg.ffmpeg,
            ffprobe_bin=ctx.cfg.ffprobe,
        )
        entries.append({
            "line_id": "",
            "role": "",
            "delivered": str(track.out_path.relative_to(out)).replace("\\", "/"),
            "delivered_sha256": _sha256(track.out_path),
            "duration_ms": track.duration_ms,
            "note": "full-length dub track" + ("" if track.used_original_bed else " (dialogue only — no ffmpeg, so the original mix is not underneath)"),
        })

        srt_path = dub_dir / f"{stem}.dub.srt"
        _write_srt(srt_path, lines)
        entries.append({
            "line_id": "", "role": "",
            "delivered": str(srt_path.relative_to(out)).replace("\\", "/"),
            "delivered_sha256": _sha256(srt_path),
            "duration_ms": 0,
            "note": "subtitles for the dubbed dialogue",
        })

        muxed = ""
        if ctx.ffmpeg_ok and source.exists() and source.suffix.lower() in (".mkv", ".mp4", ".mov", ".webm", ".m4v", ".avi"):
            try:
                target = out / f"{stem}.voxswap.mkv"
                ff.mux_audio(source, track.out_path, target,
                             language=ctx.order.language.target.split("-")[0],
                             title="VoxSwap", ffmpeg=ctx.cfg.ffmpeg)
                muxed = target.name
                entries.append({
                    "line_id": "", "role": "",
                    "delivered": target.name,
                    "delivered_sha256": _sha256(target),
                    "duration_ms": track.duration_ms,
                    "note": "original film with the dub added as a second audio track",
                })
            except Exception as exc:                     # noqa: BLE001 - muxing is a convenience
                ctx.log.warn(f"could not mux the film: {exc}")

        return entries, {
            "dub_track": track.out_path.name,
            "used_original_bed": track.used_original_bed,
            "muxed": muxed,
            "cues_dropped": track.cues_dropped,
        }

    # -- shared artefacts ------------------------------------------------

    def _write_manifest(self, ctx: JobContext, out: Path, entries: list[dict], extra: dict) -> None:
        order = ctx.order
        payload = {
            "order_id": order.order_id,
            "built_at": utc_now_iso(),
            "title": order.target.title,
            "target": {"kind": order.target.kind, "adapter": order.target.adapter,
                       "asset_root": order.target.asset_root, "layout": order.target.delivery_layout},
            "language": {"source": order.language.source, "target": order.language.target},
            "roles": [{"role_id": r.role_id, "display_name": r.display_name,
                       "voice": order.voice(r.voice_id).person_label} for r in order.roles],
            "consent": [{"consent_ref": c.consent_ref, "person": c.person_name, "signed_at": c.signed_at}
                        for c in order.consents],
            "packaging": extra,
            "files": entries,
        }
        (out / "manifest.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def _write_script(self, ctx: JobContext, out: Path, lines: list[Line]) -> None:
        path = out / "script.csv"
        with path.open("w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["line_id", "role", "speaker", "source_file", "start_ms",
                             "original_text", "spoken_text", "emotion", "duration_ms"])
            for line in lines:
                writer.writerow([line.line_id, line.role_id, line.speaker_label, line.source_rel,
                                 line.start_ms, line.text, line.speak_text, line.emotion, line.final_duration_ms])

    def _write_readme(self, ctx: JobContext, out: Path, entries: list[dict], extra: dict) -> None:
        order = ctx.order
        roles = ", ".join(f"{r.display_name} -> {order.voice(r.voice_id).person_label}" for r in order.roles)
        language = (f"{order.language.source} -> {order.language.target}"
                    if order.language.needs_translation else order.language.target)

        (out / "README.md").write_text(
            f"# {order.target.title} — VoxSwap delivery\n\n"
            f"Order `{order.order_id}` · built {utc_now_iso()}\n\n"
            f"* **Voices:** {roles}\n"
            f"* **Language:** {language}\n"
            f"* **Files included:** {len(entries)}\n\n"
            "## What is in this package\n\n"
            "| File | What it is |\n| --- | --- |\n"
            "| `INSTALL.md` | Step-by-step instructions for this specific title |\n"
            "| `manifest.json` | Every file, with the checksum of the original it replaces |\n"
            "| `script.csv` | Every line, as written and as spoken |\n"
            "| `qc.md` | The quality report for this build |\n"
            f"| `{'dub/' if order.target.adapter == 'video' else 'audio/'}` | The audio itself |\n\n"
            "## Before you install\n\n"
            "**Back up the files you are about to replace.** `manifest.json` lists every one of them with "
            "its original checksum, so you can always verify or restore.\n\n"
            "## Terms\n\n"
            "This package was made for your personal use with a copy of the title you already own. "
            "The voices in it were cloned with written consent from the people they belong to. "
            "Please do not redistribute it, and do not upload it as someone else's voice.\n\n"
            "Something wrong? Reply to the email this came from and quote the order ID above — "
            "individual lines can be re-recorded without rebuilding everything.\n",
            encoding="utf-8",
        )
        (out / "INSTALL.md").write_text(
            f"# Installing — {order.target.title}\n\n{ctx.target.install_notes(order)}\n",
            encoding="utf-8",
        )

        warnings = ctx.target.warnings(ctx.assets)
        if ctx.order.target.adapter == "video" and not extra.get("used_original_bed", True):
            warnings.append(
                "This dub track contains dialogue only: the operator's machine had no ffmpeg, so the "
                "original music and effects could not be mixed underneath."
            )
        if extra.get("delivered_as_wav"):
            warnings.append(
                f"{extra['delivered_as_wav']} file(s) were delivered as WAV instead of the original format. "
                "Most engines accept WAV, but if the game refuses them, ask the operator for a re-encode."
            )
        if warnings:
            (out / "WARNINGS.md").write_text(
                "# Please read\n\n" + "\n\n".join(f"* {w}" for w in warnings) + "\n", encoding="utf-8")

    def _copy_reports(self, ctx: JobContext, out: Path) -> None:
        for name in ("qc.md", "qc.json"):
            source = ctx.ws.report_dir / name
            if source.exists():
                shutil.copyfile(source, out / name)

    def _zip(self, ctx: JobContext, out: Path) -> Path:
        archive = ctx.cfg.delivery_dir / f"{ctx.order.order_id}.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        if archive.exists():
            archive.unlink()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for path in sorted(out.rglob("*")):
                if path.is_file():
                    zf.write(path, path.relative_to(out).as_posix())
        return archive


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _timecode(ms: int) -> str:
    ms = max(0, ms)
    hours, ms = divmod(ms, 3600000)
    minutes, ms = divmod(ms, 60000)
    seconds, ms = divmod(ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{ms:03d}"


def _write_srt(path: Path, lines: list[Line]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    blocks = []
    for index, line in enumerate(sorted(lines, key=lambda l: l.start_ms), start=1):
        end = line.start_ms + (line.final_duration_ms or (line.end_ms - line.start_ms) or 2000)
        blocks.append(f"{index}\n{_timecode(line.start_ms)} --> {_timecode(end)}\n{line.speak_text}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")
