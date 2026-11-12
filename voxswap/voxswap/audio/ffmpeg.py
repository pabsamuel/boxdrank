"""Optional ffmpeg integration.

VoxSwap runs without ffmpeg (see wavio.py). With ffmpeg it gets:

  * every input format, not just PCM WAV (ogg, mp3, flac, m4a, movie files)
  * proper pitch-preserving time-stretch (`atempo`) instead of our own OLA
  * real EBU R128 loudness normalisation (`loudnorm`) instead of an estimate
  * audio extraction from / muxing back into video containers

Call `available()` before anything else and fall back rather than fail.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

from ..errors import AssetError

_TIMEOUT = 600


@lru_cache(maxsize=4)
def available(ffmpeg: str = "ffmpeg", ffprobe: str = "ffprobe") -> bool:
    return bool(shutil.which(ffmpeg)) and bool(shutil.which(ffprobe))


def _run(args: list[str], what: str) -> subprocess.CompletedProcess[bytes]:
    try:
        proc = subprocess.run(args, capture_output=True, timeout=_TIMEOUT, check=False)
    except FileNotFoundError as exc:
        raise AssetError(f"{args[0]} not found while trying to {what}", "Install ffmpeg or unset VOXSWAP_FFMPEG.") from exc
    except subprocess.TimeoutExpired as exc:
        raise AssetError(f"ffmpeg timed out while trying to {what}", "The file may be huge or corrupt.") from exc
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-4:]
        raise AssetError(f"ffmpeg failed while trying to {what}", " / ".join(tail) or "no stderr")
    return proc


def probe(path: Path, ffprobe: str = "ffprobe") -> dict:
    proc = _run(
        [ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        f"probe {path.name}",
    )
    return json.loads(proc.stdout.decode("utf-8", "replace"))


def duration_ms(path: Path, ffprobe: str = "ffprobe") -> int:
    info = probe(path, ffprobe)
    try:
        return int(round(float(info["format"]["duration"]) * 1000))
    except (KeyError, ValueError, TypeError):
        return 0


def audio_profile(path: Path, ffprobe: str = "ffprobe") -> dict:
    """Codec/rate/channels/bitrate of the first audio stream — what we need to
    hand identical-looking files back to the game."""
    for stream in probe(path, ffprobe).get("streams", []):
        if stream.get("codec_type") == "audio":
            return {
                "codec": stream.get("codec_name", ""),
                "sample_rate": int(stream.get("sample_rate") or 0),
                "channels": int(stream.get("channels") or 0),
                "bit_rate": int(stream.get("bit_rate") or 0),
                "sample_fmt": stream.get("sample_fmt", ""),
            }
    return {}


def to_wav(src: Path, dst: Path, *, sample_rate: int = 0, channels: int = 0, ffmpeg: str = "ffmpeg") -> Path:
    """Decode anything into 16-bit PCM WAV."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    args = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-vn", "-c:a", "pcm_s16le"]
    if sample_rate:
        args += ["-ar", str(sample_rate)]
    if channels:
        args += ["-ac", str(channels)]
    _run(args + [str(dst)], f"decode {src.name}")
    return dst


def from_wav(src: Path, dst: Path, *, codec: str = "", bit_rate: int = 0, sample_rate: int = 0, channels: int = 0, ffmpeg: str = "ffmpeg") -> Path:
    """Encode our WAV back into the container/codec the game shipped."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    args = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src)]
    if codec:
        args += ["-c:a", codec]
    if bit_rate:
        args += ["-b:a", str(bit_rate)]
    if sample_rate:
        args += ["-ar", str(sample_rate)]
    if channels:
        args += ["-ac", str(channels)]
    _run(args + [str(dst)], f"encode {dst.name}")
    return dst


def atempo(src: Path, dst: Path, factor: float, *, ffmpeg: str = "ffmpeg") -> Path:
    """Pitch-preserving time-stretch. factor > 1 = faster/shorter.

    atempo only accepts 0.5–2.0 per instance, so large factors are chained.
    """
    if abs(factor - 1.0) < 1e-4:
        shutil.copyfile(src, dst)
        return dst
    chain, remaining = [], factor
    while remaining > 2.0:
        chain.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        chain.append(0.5)
        remaining /= 0.5
    chain.append(remaining)
    filt = ",".join(f"atempo={f:.6f}" for f in chain)
    _run([ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-filter:a", filt, str(dst)], f"time-stretch {src.name}")
    return dst


def loudnorm(src: Path, dst: Path, target_lufs: float, *, true_peak: float = -1.5,
             ffmpeg: str = "ffmpeg", ffprobe: str = "ffprobe") -> Path:
    """Single-pass EBU R128 normalisation. Two-pass is more accurate but doubles
    the cost per line; single pass is within ~1 LU, which is inaudible here.

    The explicit `-ar`/`-ac` are not optional: the loudnorm filter resamples to
    192 kHz internally, and ffmpeg then writes a WAVE_FORMAT_EXTENSIBLE header
    for it. Forcing the input's own shape keeps the output a plain PCM WAV —
    which is what the rest of the pipeline, and the game, expect back.
    """
    profile = audio_profile(src, ffprobe)
    args = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src),
            "-filter:a", f"loudnorm=I={target_lufs}:TP={true_peak}:LRA=11:print_format=summary",
            "-c:a", "pcm_s16le"]
    if profile.get("sample_rate"):
        args += ["-ar", str(profile["sample_rate"])]
    if profile.get("channels"):
        args += ["-ac", str(profile["channels"])]
    _run(args + [str(dst)], f"normalise {src.name}")
    return dst


def extract_audio(video: Path, dst_wav: Path, *, track: int = 0, ffmpeg: str = "ffmpeg") -> Path:
    dst_wav.parent.mkdir(parents=True, exist_ok=True)
    _run([ffmpeg, "-y", "-loglevel", "error", "-i", str(video), "-map", f"0:a:{track}", "-c:a", "pcm_s16le", str(dst_wav)],
         f"extract audio track {track} from {video.name}")
    return dst_wav


def mux_audio(video: Path, audio: Path, dst: Path, *, language: str = "und", title: str = "VoxSwap", ffmpeg: str = "ffmpeg") -> Path:
    """Add our dub as an extra audio track, keeping video and original audio
    untouched. Never re-encode the picture: it is slow, lossy and pointless."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    _run(
        [
            ffmpeg, "-y", "-loglevel", "error", "-i", str(video), "-i", str(audio),
            "-map", "0", "-map", "1:a", "-c", "copy", "-c:a:1", "aac", "-b:a:1", "256k",
            f"-metadata:s:a:1", f"language={language}", f"-metadata:s:a:1", f"title={title}",
            "-disposition:a:1", "default", str(dst),
        ],
        f"mux dub into {video.name}",
    )
    return dst
