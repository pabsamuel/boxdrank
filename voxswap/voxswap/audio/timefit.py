"""Making a generated line fit the slot it has to live in.

A game or film expects a line of a given length. Turkish is ~15% longer than
English; an excited read is faster than a flat one. So the synthesised take is
almost never exactly the right length, and the difference has to go somewhere.

Order of preference, cheapest and least damaging first:

  1. Trim the dead air TTS leaves at both ends.            (free, always good)
  2. Accept it, if we are inside tolerance.                (free)
  3. Pad with silence, if the take is short.               (free, invisible)
  4. Time-stretch, pitch preserved, within `max_stretch`.  (mildly audible)
  5. Give up gracefully: keep the best take, flag it for QC and for the human.

Never: speed up by resampling (turns the customer into a chipmunk), and never
hard-cut a line mid-word to make the numbers work.
"""

from __future__ import annotations

import math
from array import array
from dataclasses import dataclass
from pathlib import Path

from . import ffmpeg as ff
from .wavio import Audio, pad_to, read_wav, trim_silence, write_wav

_FRAME_MS = 30


@dataclass
class FitResult:
    audio: Audio
    strategy: str
    stretch: float
    delta_ms: int
    note: str = ""


def ola_stretch(audio: Audio, factor: float) -> Audio:
    """Overlap-add time-scale modification, pure Python.

    factor > 1 shortens, factor < 1 lengthens; pitch is preserved. This is the
    no-ffmpeg path. It is clean for the 0.85-1.20 range we actually use and
    gets phasey beyond that, which is exactly why `max_stretch` exists.
    """
    if abs(factor - 1.0) < 1e-4 or audio.frame_count == 0:
        return audio.copy()

    ch = audio.channels
    sr = audio.sample_rate or 48000
    n = audio.frame_count
    frame = max(64, int(sr * _FRAME_MS / 1000))
    syn_hop = frame // 2
    ana_hop = max(1, int(round(syn_hop * factor)))
    window = [0.5 - 0.5 * math.cos(2 * math.pi * i / max(1, frame - 1)) for i in range(frame)]

    out_frames = max(1, int(round(n / factor)))
    acc = [[0.0] * (out_frames + frame) for _ in range(ch)]
    norm = [0.0] * (out_frames + frame)

    k = 0
    while True:
        ana = k * ana_hop
        syn = k * syn_hop
        if ana + frame > n or syn >= out_frames:
            break
        for i in range(frame):
            w = window[i]
            norm[syn + i] += w
            base_in = (ana + i) * ch
            for c in range(ch):
                acc[c][syn + i] += audio.samples[base_in + c] * w
        k += 1

    out = array("h", bytes(out_frames * ch * 2))
    for i in range(out_frames):
        w = norm[i]
        if w < 1e-6:
            continue
        for c in range(ch):
            v = int(acc[c][i] / w)
            out[i * ch + c] = -32768 if v < -32768 else (32767 if v > 32767 else v)
    return Audio(out, sr, ch)


def stretch(audio: Audio, factor: float, *, tmp_dir: Path | None = None, ffmpeg_bin: str = "ffmpeg", ffprobe_bin: str = "ffprobe") -> Audio:
    """Time-stretch using ffmpeg when available, OLA otherwise."""
    if abs(factor - 1.0) < 1e-4:
        return audio.copy()
    if tmp_dir is not None and ff.available(ffmpeg_bin, ffprobe_bin):
        tmp_dir.mkdir(parents=True, exist_ok=True)
        src = tmp_dir / "_stretch_in.wav"
        dst = tmp_dir / "_stretch_out.wav"
        write_wav(src, audio)
        ff.atempo(src, dst, factor, ffmpeg=ffmpeg_bin)
        result = read_wav(dst)
        src.unlink(missing_ok=True)
        dst.unlink(missing_ok=True)
        return result
    return ola_stretch(audio, factor)


def fit_to_slot(
    audio: Audio,
    slot_ms: int,
    *,
    max_stretch: float = 1.15,
    tolerance_ms: int = 120,
    preserve_timing: bool = True,
    pad_where: str = "end",
    expand_threshold: float = 1.25,
    tmp_dir: Path | None = None,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
) -> FitResult:
    """Fit a synthesised take into a slot of `slot_ms`."""
    work = trim_silence(audio)
    if not preserve_timing or slot_ms <= 0:
        return FitResult(work, "as-is", 1.0, work.duration_ms - slot_ms)

    current = work.duration_ms
    delta = current - slot_ms
    if abs(delta) <= tolerance_ms:
        out = pad_to(work, slot_ms, where=pad_where) if delta < 0 else work
        return FitResult(out, "as-is", 1.0, out.duration_ms - slot_ms)

    if delta > 0:                                       # too long -> compress
        needed = current / slot_ms
        factor = min(needed, max_stretch)
        out = stretch(work, factor, tmp_dir=tmp_dir, ffmpeg_bin=ffmpeg_bin, ffprobe_bin=ffprobe_bin)
        residual = out.duration_ms - slot_ms
        if needed > max_stretch:
            return FitResult(
                out, "overflow", factor, residual,
                f"line is {residual} ms longer than its slot even after {factor:.2f}x compression; "
                "shorten the translated text or raise options.max_stretch",
            )
        return FitResult(out, "compressed", factor, residual)

    # too short: padding is invisible, slowing speech down is not - only
    # expand when the gap is big enough that silence would read as a bug.
    gap_ratio = slot_ms / max(1, current)
    if gap_ratio >= expand_threshold:
        factor = max(1.0 / max_stretch, 1.0 / gap_ratio)
        out = stretch(work, factor, tmp_dir=tmp_dir, ffmpeg_bin=ffmpeg_bin, ffprobe_bin=ffprobe_bin)
        out = pad_to(out, slot_ms, where=pad_where)
        return FitResult(out, "expanded", factor, out.duration_ms - slot_ms)

    out = pad_to(work, slot_ms, where=pad_where)
    return FitResult(out, "padded", 1.0, out.duration_ms - slot_ms)
