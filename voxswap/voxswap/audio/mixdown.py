"""Streaming mixdown for film-length timelines.

A two-hour 48 kHz stereo track is ~1.4 GB as 16-bit samples. Loading that into
a Python array to drop dialogue onto it would take the operator's laptop down,
so the film path streams instead:

    ffmpeg decodes the original audio -> we read it in small blocks ->
    each block is ducked where a dubbed line sits over it, the line is mixed in,
    and the block is written straight out to the WAV.

Memory stays flat regardless of runtime. Only the handful of dubbed lines that
overlap the current block are held in memory.

Without ffmpeg there is nothing to stream from, so the bed is silence and the
result is a dialogue-only track — still useful, and the package says so.
"""

from __future__ import annotations

import subprocess
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path

from . import ffmpeg as ff
from .wavio import Audio, read_wav, resample, to_channels

BLOCK_FRAMES = 1 << 15          # ~0.7 s at 48 kHz: small enough to stay flat, big enough to be fast


@dataclass
class Cue:
    start_ms: int
    audio_path: Path
    gain: float = 1.0


@dataclass
class MixResult:
    out_path: Path
    duration_ms: int
    cues_placed: int
    cues_dropped: int
    used_original_bed: bool


def _clip(value: int) -> int:
    return -32768 if value < -32768 else (32767 if value > 32767 else value)


def _bed_stream(video: Path, sample_rate: int, channels: int, ffmpeg_bin: str):
    """Yield raw PCM blocks of the original audio."""
    args = [
        ffmpeg_bin, "-v", "error", "-i", str(video), "-vn",
        "-f", "s16le", "-acodec", "pcm_s16le",
        "-ar", str(sample_rate), "-ac", str(channels), "-",
    ]
    # stderr goes to DEVNULL rather than a pipe nobody drains: a pipe we never
    # read leaks a descriptor per file, and a film job streams a lot of files.
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    assert proc.stdout is not None
    block_bytes = BLOCK_FRAMES * channels * 2
    try:
        while True:
            chunk = proc.stdout.read(block_bytes)
            if not chunk:
                break
            yield chunk
    finally:
        # The caller usually stops early (the timeline ends before the bed
        # does), so closing stdout is what tells ffmpeg to stop. Kill it if it
        # does not take the hint, and always reap it.
        proc.stdout.close()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)


def build_track(
    cues: list[Cue],
    out_path: Path,
    *,
    total_ms: int,
    sample_rate: int = 48000,
    channels: int = 1,
    bed: Path | None = None,
    duck_factor: float = 0.18,
    fade_ms: int = 150,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
) -> MixResult:
    """Lay `cues` onto a timeline of `total_ms`, ducking the bed underneath."""
    use_bed = bed is not None and ff.available(ffmpeg_bin, ffprobe_bin)
    ordered = sorted(cues, key=lambda c: c.start_ms)

    # Pre-load each cue's length so ducking spans are known before mixing.
    loaded: list[tuple[Cue, Audio]] = []
    dropped = 0
    for cue in ordered:
        try:
            audio = to_channels(resample(read_wav(cue.audio_path), sample_rate), channels)
        except Exception:                                # noqa: BLE001 - a bad take must not stop the film
            dropped += 1
            continue
        loaded.append((cue, audio))

    spans = [(c.start_ms, c.start_ms + a.duration_ms) for c, a in loaded]
    fade_frames = max(1, int(sample_rate * fade_ms / 1000.0))
    total_frames = max(
        int(sample_rate * total_ms / 1000.0),
        max((int(sample_rate * end / 1000.0) for _, end in spans), default=0),
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_path), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)

        stream = _bed_stream(bed, sample_rate, channels, ffmpeg_bin) if use_bed and bed else None
        position = 0                                      # in frames
        cue_index = 0
        active: list[tuple[int, Audio]] = []               # (start_frame, audio)

        while position < total_frames:
            frames = min(BLOCK_FRAMES, total_frames - position)
            if stream is not None:
                chunk = next(stream, b"")
                block = array("h")
                block.frombytes(chunk[: frames * channels * 2])
                if len(block) < frames * channels:         # bed ended before the last cue
                    block.extend(array("h", bytes((frames * channels - len(block)) * 2)))
            else:
                block = array("h", bytes(frames * channels * 2))

            _duck_block(block, position, frames, channels, sample_rate, spans, duck_factor, fade_frames)

            while cue_index < len(loaded):
                start_frame = int(sample_rate * loaded[cue_index][0].start_ms / 1000.0)
                if start_frame >= position + frames:
                    break
                active.append((start_frame, loaded[cue_index][1]))
                cue_index += 1

            still_active: list[tuple[int, Audio]] = []
            for start_frame, audio in active:
                end_frame = start_frame + audio.frame_count
                if end_frame <= position:
                    continue
                _mix_block(block, position, frames, channels, start_frame, audio)
                if end_frame > position + frames:
                    still_active.append((start_frame, audio))
            active = still_active

            wf.writeframes(block.tobytes())
            position += frames

        if stream is not None:
            stream.close()

    return MixResult(
        out_path=out_path,
        duration_ms=int(round(total_frames * 1000.0 / sample_rate)),
        cues_placed=len(loaded),
        cues_dropped=dropped,
        used_original_bed=bool(use_bed),
    )


def _duck_block(block: array, position: int, frames: int, channels: int, sample_rate: int,
                spans: list[tuple[int, int]], factor: float, fade_frames: int) -> None:
    if factor >= 1.0 or not spans:
        return
    for i in range(frames):
        frame = position + i
        ms = frame * 1000.0 / sample_rate
        level = 1.0
        for start_ms, end_ms in spans:                   # spans are short; the early-exit keeps this cheap
            if ms < start_ms - fade_frames * 1000.0 / sample_rate:
                break
            if ms > end_ms + fade_frames * 1000.0 / sample_rate:
                continue
            if start_ms <= ms <= end_ms:
                level = min(level, factor)
            elif ms < start_ms:
                ramp = (start_ms - ms) * sample_rate / 1000.0 / fade_frames
                level = min(level, factor + (1.0 - factor) * min(1.0, ramp))
            else:
                ramp = (ms - end_ms) * sample_rate / 1000.0 / fade_frames
                level = min(level, factor + (1.0 - factor) * min(1.0, ramp))
        if level < 1.0:
            for c in range(channels):
                idx = i * channels + c
                block[idx] = _clip(int(block[idx] * level))


def _mix_block(block: array, position: int, frames: int, channels: int,
               start_frame: int, audio: Audio) -> None:
    first = max(position, start_frame)
    last = min(position + frames, start_frame + audio.frame_count)
    for frame in range(first, last):
        dst = (frame - position) * channels
        src = (frame - start_frame) * channels
        for c in range(channels):
            block[dst + c] = _clip(block[dst + c] + audio.samples[src + c])
