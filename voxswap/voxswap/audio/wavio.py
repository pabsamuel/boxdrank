"""WAV reading/writing with nothing but the standard library.

Why bother when ffmpeg exists? Because the pipeline must run on a machine that
has no ffmpeg, no numpy and no build tools — a fresh laptop, a cheap VPS, CI.
ffmpeg is an *upgrade* (real time-stretch, non-WAV formats), never a
requirement. See audio/ffmpeg.py.

Everything is normalised to signed 16-bit PCM internally. That is what game
engines and voice providers want anyway, and it keeps the arithmetic trivial.
"""

from __future__ import annotations

import math
import struct
import wave
from array import array
from dataclasses import dataclass
from pathlib import Path

from ..errors import AssetError


@dataclass
class Audio:
    """Signed 16-bit PCM, interleaved."""

    samples: array          # array('h')
    sample_rate: int
    channels: int

    @property
    def frame_count(self) -> int:
        return len(self.samples) // self.channels if self.channels else 0

    @property
    def duration_ms(self) -> int:
        if not self.sample_rate:
            return 0
        return int(round(self.frame_count * 1000.0 / self.sample_rate))

    def copy(self) -> "Audio":
        return Audio(array("h", self.samples), self.sample_rate, self.channels)


# --------------------------------------------------------------------------
# read / write
# --------------------------------------------------------------------------


def read_wav(path: Path) -> Audio:
    try:
        with wave.open(str(path), "rb") as wf:
            channels = wf.getnchannels()
            width = wf.getsampwidth()
            rate = wf.getframerate()
            raw = wf.readframes(wf.getnframes())
    except wave.Error as exc:
        raise AssetError(
            f"{path.name} is a WAV file Python cannot read directly ({exc})",
            "This is usually 32-bit float or a compressed WAV. Install ffmpeg and re-run; "
            "VoxSwap will convert it automatically.",
        ) from exc
    except FileNotFoundError as exc:
        raise AssetError(f"missing audio file: {path}", "Check target.asset_root in order.json.") from exc

    return Audio(_to_int16(raw, width), rate, channels)


def write_wav(path: Path, audio: Audio) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(audio.channels)
        wf.setsampwidth(2)
        wf.setframerate(audio.sample_rate)
        wf.writeframes(audio.samples.tobytes())


def probe_wav(path: Path) -> tuple[int, int, int]:
    """(duration_ms, sample_rate, channels) without loading the audio body."""
    with wave.open(str(path), "rb") as wf:
        frames, rate, channels = wf.getnframes(), wf.getframerate(), wf.getnchannels()
    return int(round(frames * 1000.0 / rate)) if rate else 0, rate, channels


def _to_int16(raw: bytes, width: int) -> array:
    if width == 2:
        out = array("h")
        out.frombytes(raw[: len(raw) - (len(raw) % 2)])
        return out
    if width == 1:                                   # 8-bit WAV is unsigned
        return array("h", ((b - 128) * 256 for b in raw))
    if width == 3:
        out = array("h")
        for i in range(0, len(raw) - 2, 3):
            value = int.from_bytes(raw[i : i + 3], "little", signed=True)
            out.append(_clip(value >> 8))
        return out
    if width == 4:
        count = len(raw) // 4
        return array("h", (_clip(v >> 16) for v in struct.unpack(f"<{count}i", raw[: count * 4])))
    raise AssetError(f"unsupported WAV sample width: {width * 8}-bit", "Install ffmpeg so VoxSwap can convert it.")


def _clip(value: int) -> int:
    return -32768 if value < -32768 else (32767 if value > 32767 else value)


# --------------------------------------------------------------------------
# generation (used by the mock provider and for padding)
# --------------------------------------------------------------------------


def silence(duration_ms: int, sample_rate: int = 48000, channels: int = 1) -> Audio:
    n = max(0, int(sample_rate * duration_ms / 1000.0)) * channels
    return Audio(array("h", bytes(n * 2)), sample_rate, channels)


def tone(
    duration_ms: int,
    freq: float = 140.0,
    sample_rate: int = 48000,
    channels: int = 1,
    amplitude: float = 0.22,
    vibrato: float = 4.0,
) -> Audio:
    """A voice-ish buzz: fundamental + two harmonics, gentle vibrato, fade in/out.

    Only the mock provider uses this. It exists so the whole pipeline — timing,
    loudness, packaging, QC — can be exercised offline and in CI without
    spending a cent on a real voice API.
    """
    total = max(1, int(sample_rate * duration_ms / 1000.0))
    fade = max(1, int(sample_rate * 0.012))
    out = array("h", bytes(total * channels * 2))
    for i in range(total):
        t = i / sample_rate
        f = freq * (1.0 + 0.01 * math.sin(2 * math.pi * vibrato * t))
        value = (
            math.sin(2 * math.pi * f * t)
            + 0.34 * math.sin(4 * math.pi * f * t)
            + 0.16 * math.sin(6 * math.pi * f * t)
        ) / 1.5
        env = min(1.0, i / fade, (total - i) / fade)
        s = _clip(int(value * env * amplitude * 32767))
        for c in range(channels):
            out[i * channels + c] = s
    return Audio(out, sample_rate, channels)


# --------------------------------------------------------------------------
# edit primitives
# --------------------------------------------------------------------------


def slice_ms(audio: Audio, start_ms: int, end_ms: int) -> Audio:
    a = max(0, int(audio.sample_rate * start_ms / 1000.0)) * audio.channels
    b = max(a, int(audio.sample_rate * end_ms / 1000.0) * audio.channels)
    return Audio(array("h", audio.samples[a:b]), audio.sample_rate, audio.channels)


def concat(first: Audio, second: Audio) -> Audio:
    if (first.sample_rate, first.channels) != (second.sample_rate, second.channels):
        second = resample(to_channels(second, first.channels), first.sample_rate)
    out = array("h", first.samples)
    out.extend(second.samples)
    return Audio(out, first.sample_rate, first.channels)


def pad_to(audio: Audio, duration_ms: int, *, where: str = "end") -> Audio:
    """Pad with silence up to duration_ms. Splitting the pad ('both') keeps a
    line centred in its slot, which sounds better in cutscenes than trailing
    silence."""
    missing = duration_ms - audio.duration_ms
    if missing <= 0:
        return audio
    if where == "both":
        head = silence(missing // 2, audio.sample_rate, audio.channels)
        tail = silence(missing - missing // 2, audio.sample_rate, audio.channels)
        return concat(concat(head, audio), tail)
    tail = silence(missing, audio.sample_rate, audio.channels)
    return concat(audio, tail) if where == "end" else concat(tail, audio)


def trim_silence(audio: Audio, threshold: float = 0.004, keep_ms: int = 40) -> Audio:
    """Strip leading/trailing near-silence, keeping a small cushion.

    TTS output routinely carries 100-300 ms of dead air at both ends. Left in
    place it wrecks lip-sync and pushes lines past their slot.
    """
    limit = int(threshold * 32767)
    ch = audio.channels
    n = audio.frame_count
    first, last = 0, n - 1
    while first < n and max(abs(audio.samples[first * ch + c]) for c in range(ch)) < limit:
        first += 1
    while last > first and max(abs(audio.samples[last * ch + c]) for c in range(ch)) < limit:
        last -= 1
    if first >= last:
        return audio
    cushion = int(audio.sample_rate * keep_ms / 1000.0)
    a = max(0, first - cushion) * ch
    b = min(n, last + 1 + cushion) * ch
    return Audio(array("h", audio.samples[a:b]), audio.sample_rate, ch)


def to_channels(audio: Audio, channels: int) -> Audio:
    if audio.channels == channels:
        return audio
    if audio.channels == 1:
        out = array("h", bytes(audio.frame_count * channels * 2))
        for i, s in enumerate(audio.samples):
            for c in range(channels):
                out[i * channels + c] = s
        return Audio(out, audio.sample_rate, channels)
    frames = audio.frame_count
    mono = array("h", bytes(frames * 2))
    for i in range(frames):
        total = sum(audio.samples[i * audio.channels + c] for c in range(audio.channels))
        mono[i] = _clip(total // audio.channels)
    return to_channels(Audio(mono, audio.sample_rate, 1), channels)


def resample(audio: Audio, sample_rate: int) -> Audio:
    """Linear resample. Fine for the rate conversions we do (48k <-> 44.1k <->
    24k between provider output and game assets); ffmpeg is used when
    available because its filter is better."""
    if audio.sample_rate == sample_rate or audio.frame_count == 0:
        return Audio(array("h", audio.samples), sample_rate, audio.channels)
    ch = audio.channels
    src_frames = audio.frame_count
    dst_frames = max(1, int(round(src_frames * sample_rate / audio.sample_rate)))
    out = array("h", bytes(dst_frames * ch * 2))
    ratio = (src_frames - 1) / dst_frames if dst_frames else 0
    for i in range(dst_frames):
        pos = i * ratio
        j = int(pos)
        frac = pos - j
        k = min(j + 1, src_frames - 1)
        for c in range(ch):
            a = audio.samples[j * ch + c]
            b = audio.samples[k * ch + c]
            out[i * ch + c] = _clip(int(a + (b - a) * frac))
    return Audio(out, sample_rate, ch)


def overlay(base: Audio, clip: Audio, at_ms: int, *, clip_gain: float = 1.0) -> Audio:
    """Mix `clip` into `base` starting at `at_ms`, extending `base` if needed.

    Used to lay dubbed lines onto a film's timeline.
    """
    clip = resample(to_channels(clip, base.channels), base.sample_rate)
    ch = base.channels
    start = max(0, int(base.sample_rate * at_ms / 1000.0)) * ch
    needed = start + len(clip.samples)
    out = array("h", base.samples)
    if needed > len(out):
        out.extend(array("h", bytes((needed - len(out)) * 2)))
    for i, s in enumerate(clip.samples):
        out[start + i] = _clip(out[start + i] + int(s * clip_gain))
    return Audio(out, base.sample_rate, ch)


def duck(audio: Audio, start_ms: int, end_ms: int, *, factor: float = 0.18, fade_ms: int = 120) -> Audio:
    """Attenuate a span, fading in and out so the drop is not audible as a click.

    This is how the original dialogue is pushed under a dub when no clean
    music-and-effects track exists.
    """
    ch = audio.channels
    sr = audio.sample_rate or 48000
    total = audio.frame_count
    a = max(0, int(sr * start_ms / 1000.0))
    b = min(total, int(sr * end_ms / 1000.0))
    if b <= a:
        return audio
    fade = max(1, int(sr * fade_ms / 1000.0))
    out = array("h", audio.samples)
    for i in range(max(0, a - fade), min(total, b + fade)):
        if i < a:
            ramp = (a - i) / fade                        # fading down into the span
            level = factor + (1.0 - factor) * ramp
        elif i > b:
            ramp = (i - b) / fade
            level = factor + (1.0 - factor) * ramp
        else:
            level = factor
        for c in range(ch):
            out[i * ch + c] = _clip(int(out[i * ch + c] * level))
    return Audio(out, sr, ch)


def peak(audio: Audio) -> float:
    return (max((abs(s) for s in audio.samples), default=0)) / 32767.0


def rms(audio: Audio) -> float:
    if not len(audio.samples):
        return 0.0
    total = 0
    for s in audio.samples:
        total += s * s
    return math.sqrt(total / len(audio.samples)) / 32767.0


def gain(audio: Audio, factor: float) -> Audio:
    out = array("h", ((_clip(int(s * factor))) for s in audio.samples))
    return Audio(out, audio.sample_rate, audio.channels)
