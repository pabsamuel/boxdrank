#!/usr/bin/env python3
"""Swap the voices inside a Unity game's audio bundles.

    pip install UnityPy fmod_toolkit          # tools only — the core stays stdlib

    python3 tools/games/unity_voice.py list    kim.bundle
    python3 tools/games/unity_voice.py extract kim.bundle work/kim/original
    python3 tools/games/unity_voice.py convert work/kim/original work/kim/converted \\
            --voice voices/kim-new.wav --vc http://127.0.0.1:8124/vc
    python3 tools/games/unity_voice.py rebuild kim.bundle work/kim/converted out/kim.bundle
    python3 tools/games/unity_voice.py verify  out/kim.bundle work/kim/converted

Unity keeps every AudioClip as an FMOD sound bank (FSB5) inside the bundle's
`.resource` stream, usually Vorbis-compressed. Reading one is easy — FMOD
decodes it. Writing one back is the part no open tool does: there is no free
FSB5 *Vorbis* encoder, and the official one needs the Unity editor of the
game's exact version.

So the rebuilt clips are written as **PCM** FSB5, which is simple enough to
write by hand and which FMOD — the same library the game plays them with —
reads natively. The clip's `m_CompressionFormat` is switched to PCM to match.
The cost is size (uncompressed audio); the gain is that no proprietary tool
or editor install is involved, and `verify` proves the result decodes through
FMOD before anything goes near the game.

Only `AudioClip` objects named in the replacement folder are touched. Every
other object in the bundle, and every clip without a replacement, is written
back byte for byte.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import wave
from pathlib import Path

# FSB5 stores the sample rate as a 4-bit index when it is one of these.
_FSB_RATES = {8000: 1, 11000: 2, 11025: 3, 16000: 4, 22050: 5, 24000: 6, 32000: 7, 44100: 8, 48000: 9}
_FSB_MODE_PCM16 = 2
_UNITY_PCM = 0          # AudioCompressionFormat.PCM


def _need_unitypy():
    try:
        import UnityPy  # noqa: F401
    except ImportError as exc:
        raise SystemExit("error: this tool needs UnityPy and fmod_toolkit:\n"
                         "  pip install UnityPy fmod_toolkit") from exc
    import UnityPy
    return UnityPy


# ---------------------------------------------------------------- FSB5 writer

def fsb5_pcm16(pcm: bytes, rate: int, channels: int) -> bytes:
    """One-sample FSB5 bank holding 16-bit PCM.

    Layout (FSB5 v1): a 60-byte header, one 8-byte sample header (plus optional
    chunks), no name table, then the sample data. The sample header packs:
    bit 0 "more chunks follow", bits 1-4 rate index, bit 5 stereo, bits 6-33
    data offset / 16, bits 34-63 length in sample frames.
    """
    if channels < 1 or channels > 2:
        raise ValueError(f"only mono or stereo is supported, got {channels} channels")
    frames = len(pcm) // (2 * channels)
    chunks = b""
    rate_index = _FSB_RATES.get(rate, 0)
    if rate_index == 0:
        # Any other rate travels in a FREQUENCY chunk: 1 bit "more", 24 bits
        # size, 7 bits type (2 = frequency), then the value.
        chunks += struct.pack("<I", (4 << 1) | (2 << 25)) + struct.pack("<I", rate)
    word = (1 if chunks else 0) | (rate_index << 1) | ((channels == 2) << 5) | (0 << 6) | (frames << 34)
    sample_header = struct.pack("<Q", word) + chunks
    data = pcm + b"\0" * (-len(pcm) % 32)
    header = (b"FSB5" + struct.pack("<IIIIII", 1, 1, len(sample_header), 0, len(data), _FSB_MODE_PCM16)
              + b"\0" * 8 + b"\0" * 16 + b"\0" * 8)
    return header + sample_header + data


def read_wav_pcm16(path: Path) -> tuple[bytes, int, int]:
    with wave.open(str(path)) as w:
        if w.getsampwidth() != 2:
            raise ValueError(f"{path.name}: needs 16-bit PCM WAV, got {8 * w.getsampwidth()}-bit")
        return w.readframes(w.getnframes()), w.getframerate(), w.getnchannels()


# ------------------------------------------------------------------ bundles

def _clips(env):
    for obj in env.objects:
        if obj.type.name == "AudioClip":
            yield obj


def list_clips(bundle: Path) -> list[dict]:
    UnityPy = _need_unitypy()
    env = UnityPy.load(str(bundle))
    out = []
    for obj in _clips(env):
        t = obj.read_typetree()
        out.append({
            "name": t["m_Name"], "path_id": obj.path_id, "seconds": round(t["m_Length"], 3),
            "rate": t["m_Frequency"], "channels": t["m_Channels"],
            "format": t["m_CompressionFormat"], "load_type": t["m_LoadType"],
            "bytes": t["m_Resource"]["m_Size"],
        })
    return out


def extract(bundle: Path, out_dir: Path) -> int:
    """Decode every clip to WAV through FMOD, plus a manifest."""
    UnityPy = _need_unitypy()
    env = UnityPy.load(str(bundle))
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest, n = [], 0
    for obj in _clips(env):
        clip = obj.parse_as_object()
        samples = clip.samples
        if not samples:
            print(f"  skipped {clip.m_Name}: FMOD returned nothing", file=sys.stderr)
            continue
        wav = next(iter(samples.values()))       # one subsound per clip in practice
        (out_dir / f"{clip.m_Name}.wav").write_bytes(wav)
        manifest.append({"name": clip.m_Name, "path_id": obj.path_id, "seconds": round(clip.m_Length, 3)})
        n += 1
    (out_dir / "manifest.json").write_text(json.dumps({"bundle": bundle.name, "clips": manifest}, indent=1),
                                           encoding="utf-8")
    return n


def rebuild(bundle: Path, replacements: Path, out: Path, packer: str = "lz4") -> dict:
    """Write a copy of `bundle` whose clips named in `replacements/` carry the new audio."""
    UnityPy = _need_unitypy()
    from UnityPy.streams import EndianBinaryReader

    env = UnityPy.load(str(bundle))
    new_audio = {p.stem: p for p in replacements.glob("*.wav")}
    bundle_file = env.file
    # Clips point into the bundle's resource stream by name; collect them per stream.
    edits: dict[str, list] = {}
    for obj in _clips(env):
        tree = obj.read_typetree()
        if tree["m_Name"] not in new_audio:
            continue
        source = tree["m_Resource"]["m_Source"]
        edits.setdefault(source.rsplit("/", 1)[-1], []).append((obj, tree))

    replaced = 0
    for res_name, items in edits.items():
        if res_name not in bundle_file.files:
            raise SystemExit(f"error: clip data lives in {res_name}, which is not inside this bundle")
        old = bundle_file.files[res_name]
        data = bytearray(old.bytes)
        # Appended, not rewritten in place: every byte an untouched object
        # points at stays where it was. The old audio becomes dead weight,
        # which is the price of not having to know who else reads the stream.
        for obj, tree in items:
            pcm, rate, channels = read_wav_pcm16(new_audio[tree["m_Name"]])
            bank = fsb5_pcm16(pcm, rate, channels)
            data += b"\0" * (-len(data) % 32)
            offset = len(data)
            data += bank
            tree["m_Resource"]["m_Offset"] = offset
            tree["m_Resource"]["m_Size"] = len(bank)
            tree["m_CompressionFormat"] = _UNITY_PCM
            tree["m_Frequency"] = rate
            tree["m_Channels"] = channels
            tree["m_BitsPerSample"] = 16
            tree["m_Length"] = (len(pcm) // (2 * channels)) / rate
            obj.save_typetree(tree)
            replaced += 1
        new_reader = EndianBinaryReader(bytes(data))
        new_reader.flags = old.flags
        bundle_file.files[res_name] = new_reader

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(bundle_file.save(packer=packer))
    return {"replaced": replaced, "kept": sum(1 for _ in _clips(env)) - replaced, "bytes": out.stat().st_size}


def verify(bundle: Path, replacements: Path) -> dict:
    """Re-open the rebuilt bundle and decode every replaced clip through FMOD.

    The check that matters: the game plays these with FMOD, so a clip FMOD
    decodes to the same samples we wrote is a clip the game can play.
    """
    UnityPy = _need_unitypy()
    import io

    env = UnityPy.load(str(bundle))
    want = {p.stem: p for p in replacements.glob("*.wav")}
    checked, worst = 0, 0.0
    problems = []
    for obj in _clips(env):
        clip = obj.parse_as_object()
        if clip.m_Name not in want:
            continue
        got = next(iter(clip.samples.values()))
        with wave.open(io.BytesIO(got)) as w:
            got_frames, got_rate = w.getnframes(), w.getframerate()
            got_pcm = w.readframes(got_frames)
        exp_pcm, exp_rate, exp_ch = read_wav_pcm16(want[clip.m_Name])
        exp_frames = len(exp_pcm) // (2 * exp_ch)
        if got_rate != exp_rate or abs(got_frames - exp_frames) > 1:
            problems.append(f"{clip.m_Name}: {got_frames}@{got_rate} decoded, {exp_frames}@{exp_rate} written")
            continue
        # Same samples back? Compare as 16-bit ints (FMOD may hand back float->int16).
        n = min(len(got_pcm), len(exp_pcm)) // 2
        a = struct.unpack(f"<{n}h", got_pcm[:2 * n])
        b = struct.unpack(f"<{n}h", exp_pcm[:2 * n])
        diff = max((abs(x - y) for x, y in zip(a, b)), default=0)
        worst = max(worst, diff)
        if diff > 2:
            problems.append(f"{clip.m_Name}: samples differ by up to {diff}")
        checked += 1
    return {"checked": checked, "worst_sample_diff": worst, "problems": problems}


# --------------------------------------------------------------- conversion

def convert(src_dir: Path, out_dir: Path, voice: Path, vc_url: str, rate: int = 0) -> int:
    """Send every WAV in `src_dir` through the voice-conversion server.

    The converted clip is cut or padded to the original's exact length and its
    loudness matched to the original's, so it sits in the game's mix where
    the actor's did.
    """
    import urllib.request

    out_dir.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # localhost: no proxy
    done = 0
    for src in sorted(src_dir.glob("*.wav")):
        dst = out_dir / src.name
        if dst.exists():
            done += 1
            continue
        body = json.dumps({"source_wav": str(src.resolve()), "speaker_wav": str(voice.resolve())}).encode()
        req = urllib.request.Request(vc_url, data=body, headers={"Content-Type": "application/json"})
        raw = opener.open(req, timeout=600).read()
        tmp = dst.with_suffix(".raw.wav")
        tmp.write_bytes(raw)
        _fit_to(tmp, src, dst, rate)
        tmp.unlink()
        done += 1
        if done % 25 == 0:
            print(f"  converted {done}", flush=True)
    return done


def _fit_to(converted: Path, original: Path, dst: Path, rate: int) -> None:
    """Same length and loudness as the original; mono 16-bit at `rate` (or the converted rate)."""
    import array
    import math

    with wave.open(str(original)) as w:
        o_rate, o_frames, o_ch = w.getframerate(), w.getnframes(), w.getnchannels()
        o = array.array("h", w.readframes(o_frames))
    with wave.open(str(converted)) as w:
        c_rate, c_ch = w.getframerate(), w.getnchannels()
        c = array.array("h", w.readframes(w.getnframes()))
    if c_ch != 1:
        c = array.array("h", c[::c_ch])
    out_rate = rate or c_rate
    if out_rate != c_rate:
        c = _resample(c, c_rate, out_rate)
    target = round(o_frames * out_rate / o_rate)
    if len(c) >= target:
        c = c[:target]
    else:
        c.extend([0] * (target - len(c)))

    def rms(x):
        return math.sqrt(sum(v * v for v in x) / max(1, len(x)))

    gain = rms(o[::o_ch]) / max(1.0, rms(c))
    peak = max((abs(v) for v in c), default=1)
    gain = min(gain, 32000 / max(1, peak))            # never clip to hit a loudness number
    c = array.array("h", (max(-32768, min(32767, int(v * gain))) for v in c))
    with wave.open(str(dst), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(out_rate)
        w.writeframes(c.tobytes())


def _resample(x, src: int, dst: int):
    """Linear resampling — only used when asked for a rate the model did not produce."""
    import array

    n = round(len(x) * dst / src)
    out = array.array("h", [0] * n)
    for i in range(n):
        pos = i * src / dst
        j = int(pos)
        f = pos - j
        a = x[j] if j < len(x) else 0
        b = x[j + 1] if j + 1 < len(x) else a
        out[i] = int(a + (b - a) * f)
    return out


# --------------------------------------------------------------------- CLI

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list"); p.add_argument("bundle", type=Path)
    p = sub.add_parser("extract"); p.add_argument("bundle", type=Path); p.add_argument("out", type=Path)
    p = sub.add_parser("convert"); p.add_argument("src", type=Path); p.add_argument("out", type=Path)
    p.add_argument("--voice", type=Path, required=True, help="reference WAV of the new voice")
    p.add_argument("--vc", default="http://127.0.0.1:8124/vc")
    p.add_argument("--rate", type=int, default=0, help="output sample rate (default: the model's)")
    p = sub.add_parser("rebuild"); p.add_argument("bundle", type=Path); p.add_argument("replacements", type=Path)
    p.add_argument("out", type=Path)
    p = sub.add_parser("verify"); p.add_argument("bundle", type=Path); p.add_argument("replacements", type=Path)
    a = ap.parse_args(argv)

    if a.cmd == "list":
        clips = list_clips(a.bundle)
        for c in clips:
            print(f"{c['seconds']:7.2f}s  {c['rate']:>5} Hz  fmt={c['format']}  {c['name']}")
        print(f"{len(clips)} clip(s), {sum(c['seconds'] for c in clips) / 60:.1f} min")
    elif a.cmd == "extract":
        print(f"{extract(a.bundle, a.out)} clip(s) -> {a.out}")
    elif a.cmd == "convert":
        print(f"{convert(a.src, a.out, a.voice, a.vc, a.rate)} clip(s) -> {a.out}")
    elif a.cmd == "rebuild":
        print(json.dumps(rebuild(a.bundle, a.replacements, a.out)))
    elif a.cmd == "verify":
        r = verify(a.bundle, a.replacements)
        print(json.dumps(r, indent=1))
        return 1 if r["problems"] or not r["checked"] else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
