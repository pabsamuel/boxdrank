"""Audio toolkit: stdlib-only core, ffmpeg as an optional upgrade."""

from .wavio import (  # noqa: F401
    Audio,
    concat,
    duck,
    gain,
    overlay,
    pad_to,
    peak,
    probe_wav,
    read_wav,
    resample,
    rms,
    silence,
    slice_ms,
    to_channels,
    tone,
    trim_silence,
    write_wav,
)
from .loudness import estimate_lufs, match_loudness, normalize_to  # noqa: F401
from .timefit import FitResult, fit_to_slot, ola_stretch, stretch  # noqa: F401

__all__ = [
    "Audio", "read_wav", "write_wav", "probe_wav", "silence", "tone", "slice_ms",
    "concat", "pad_to", "trim_silence", "to_channels", "resample", "peak", "rms", "gain",
    "overlay", "duck",
    "estimate_lufs", "normalize_to", "match_loudness",
    "FitResult", "fit_to_slot", "stretch", "ola_stretch",
]
