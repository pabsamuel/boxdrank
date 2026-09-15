"""Loudness matching.

The single biggest giveaway of a swapped voice is level: the cloned line is
louder or quieter than everything around it, so the player hears "a mod"
instead of "the character". We fix that two ways:

  1. ffmpeg `loudnorm` (real EBU R128) when ffmpeg is installed — preferred.
  2. The estimator below when it is not: a K-weighting approximation plus a
     gated mean-square, accurate to roughly ±1.5 LU on speech. Good enough to
     sit a line in a mix; not good enough to certify a broadcast master.

We also match the *neighbourhood*, not a fixed number, when the original clip
is available: copying the original clip's loudness is always more convincing
than hitting a spec value.
"""

from __future__ import annotations

import math

from .wavio import Audio, gain, peak

_ABS_GATE_LUFS = -70.0
_REL_GATE_LU = -10.0
_BLOCK_MS = 400
_HOP_MS = 100


def _k_weight(audio: Audio) -> list[float]:
    """Cheap stand-in for ITU-R BS.1770 K-weighting: a high-pass to kill rumble
    and a high-shelf to lift presence, both one-pole. Mono-summed."""
    n = audio.frame_count
    ch = audio.channels
    if n == 0:
        return []
    mono = [0.0] * n
    for i in range(n):
        total = 0
        for c in range(ch):
            total += audio.samples[i * ch + c]
        mono[i] = total / (ch * 32768.0)

    sr = audio.sample_rate or 48000
    # one-pole high-pass at ~60 Hz
    rc = 1.0 / (2 * math.pi * 60.0)
    a = rc / (rc + 1.0 / sr)
    hp = [0.0] * n
    prev_in = mono[0]
    prev_out = 0.0
    for i in range(n):
        prev_out = a * (prev_out + mono[i] - prev_in)
        prev_in = mono[i]
        hp[i] = prev_out
    # +4 dB high-shelf approximation: mix in the first difference
    out = [0.0] * n
    for i in range(1, n):
        out[i] = hp[i] + 0.58 * (hp[i] - hp[i - 1])
    out[0] = hp[0]
    return out


def estimate_lufs(audio: Audio) -> float:
    """Gated loudness estimate in LUFS. Returns -inf-ish (-99) for silence."""
    signal = _k_weight(audio)
    if not signal:
        return -99.0
    sr = audio.sample_rate or 48000
    block = max(1, int(sr * _BLOCK_MS / 1000))
    hop = max(1, int(sr * _HOP_MS / 1000))
    if len(signal) < block:
        block, hop = len(signal), len(signal)

    loudness: list[float] = []
    for start in range(0, max(1, len(signal) - block + 1), hop):
        chunk = signal[start : start + block]
        mean_sq = sum(v * v for v in chunk) / len(chunk)
        if mean_sq <= 0:
            continue
        loudness.append(-0.691 + 10 * math.log10(mean_sq))

    gated = [l for l in loudness if l > _ABS_GATE_LUFS]
    if not gated:
        return -99.0
    # relative gate: drop blocks more than 10 LU below the ungated mean
    mean_energy = sum(10 ** (l / 10) for l in gated) / len(gated)
    relative = -0.691 + 10 * math.log10(mean_energy) + _REL_GATE_LU
    kept = [l for l in gated if l > relative]
    if not kept:
        kept = gated
    energy = sum(10 ** (l / 10) for l in kept) / len(kept)
    return round(-0.691 + 10 * math.log10(energy), 2)


def normalize_to(audio: Audio, target_lufs: float, *, max_true_peak_db: float = -1.5) -> tuple[Audio, float, float]:
    """Gain the clip to `target_lufs`, backing off if that would clip.

    Returns (audio, measured_lufs_before, applied_gain_db).
    """
    measured = estimate_lufs(audio)
    if measured <= -98.0:
        return audio, measured, 0.0

    gain_db = target_lufs - measured
    factor = 10 ** (gain_db / 20)

    current_peak = peak(audio)
    if current_peak > 0:
        ceiling = 10 ** (max_true_peak_db / 20)
        max_factor = ceiling / current_peak
        if factor > max_factor:                      # never clip to hit a number
            factor = max_factor
            gain_db = 20 * math.log10(factor) if factor > 0 else 0.0
    return gain(audio, factor), measured, round(gain_db, 2)


def match_loudness(audio: Audio, reference: Audio, *, fallback_lufs: float = -18.0) -> tuple[Audio, float]:
    """Match `audio` to the loudness of the original clip it replaces."""
    ref = estimate_lufs(reference)
    target = ref if ref > -98.0 else fallback_lufs
    out, _, applied = normalize_to(audio, target)
    return out, applied
