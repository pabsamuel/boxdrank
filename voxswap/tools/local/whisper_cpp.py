#!/usr/bin/env python3
"""whisper.cpp wrapper matching VoxSwap's local ASR contract.

whisper.cpp gives you accurate, offline transcription from a quantised GGML/GGUF
model with no Python ML stack at all. This script is the ~50 lines of glue
between its JSON and ours, so you do not have to write them.

    # one-off setup
    git clone https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && make
    ./models/download-ggml-model.sh large-v3-turbo

    # then, in voxswap/.env
    VOXSWAP_WHISPER_BIN=/path/to/whisper.cpp/build/bin/whisper-cli
    VOXSWAP_WHISPER_MODEL=/path/to/whisper.cpp/models/ggml-large-v3-turbo.bin
    VOXSWAP_LOCAL_ASR_CMD=python3 tools/local/whisper_cpp.py --in {input} --out {output} --lang {language}

**If you are transcribing a lot, run whisper.cpp's server instead** and point
`"asr": "openai"` at it with `VOXSWAP_OPENAI_BASE` — same reason the TTS server
exists: this script reloads the model on every call.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

WHISPER_RATE = 16000        # whisper.cpp only accepts 16 kHz mono WAV


def _needs_conversion(path: Path) -> bool:
    try:
        with wave.open(str(path), "rb") as wf:
            return wf.getframerate() != WHISPER_RATE or wf.getnchannels() != 1
    except Exception:       # noqa: BLE001 - anything unreadable here gets handed to ffmpeg
        return True


def _to_whisper_wav(src: Path, dst: Path) -> Path:
    ffmpeg = os.environ.get("VOXSWAP_FFMPEG", "ffmpeg")
    if not shutil.which(ffmpeg):
        raise SystemExit(
            f"error: {src.name} is not 16 kHz mono WAV and ffmpeg is not installed.\n"
            "  Install ffmpeg, or pre-convert with: ffmpeg -i in.wav -ar 16000 -ac 1 out.wav"
        )
    subprocess.run(
        [ffmpeg, "-y", "-v", "error", "-i", str(src), "-ar", str(WHISPER_RATE), "-ac", "1",
         "-c:a", "pcm_s16le", str(dst)],
        check=True, capture_output=True,
    )
    return dst


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--in", dest="source", required=True)
    parser.add_argument("--out", dest="output", required=True)
    parser.add_argument("--lang", default="auto")
    parser.add_argument("--binary", default=os.environ.get("VOXSWAP_WHISPER_BIN", "whisper-cli"))
    parser.add_argument("--model", default=os.environ.get("VOXSWAP_WHISPER_MODEL", ""))
    parser.add_argument("--threads", default=os.environ.get("VOXSWAP_WHISPER_THREADS", ""))
    args = parser.parse_args()

    if not args.model:
        raise SystemExit("error: set VOXSWAP_WHISPER_MODEL to a ggml model file (or pass --model)")
    if not Path(args.model).exists():
        raise SystemExit(f"error: model not found: {args.model}")
    if not shutil.which(args.binary) and not Path(args.binary).exists():
        raise SystemExit(f"error: whisper binary not found: {args.binary}\n"
                         "  Set VOXSWAP_WHISPER_BIN to whisper.cpp's whisper-cli.")

    source = Path(args.source)
    with tempfile.TemporaryDirectory() as tmp:
        audio = source
        if _needs_conversion(source):
            audio = _to_whisper_wav(source, Path(tmp) / "16k.wav")

        base = Path(tmp) / "result"
        command = [args.binary, "-m", args.model, "-f", str(audio), "-oj", "-of", str(base), "-np"]
        if args.lang and args.lang != "auto":
            command += ["-l", args.lang]
        if args.threads:
            command += ["-t", str(args.threads)]

        proc = subprocess.run(command, capture_output=True)
        if proc.returncode != 0:
            tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-5:]
            raise SystemExit("error: whisper.cpp failed\n  " + "\n  ".join(tail))

        produced = base.with_suffix(".json")
        if not produced.exists():
            raise SystemExit(f"error: whisper.cpp wrote no JSON at {produced}")
        raw = json.loads(produced.read_text(encoding="utf-8"))

    # whisper.cpp -> VoxSwap's contract. Its offsets are milliseconds; ours are
    # seconds, which is the one conversion that actually matters here.
    segments = []
    for item in raw.get("transcription") or []:
        offsets = item.get("offsets") or {}
        text = (item.get("text") or "").strip()
        if not text:
            continue
        segments.append({
            "start": float(offsets.get("from", 0)) / 1000.0,
            "end": float(offsets.get("to", 0)) / 1000.0,
            "text": text,
        })

    Path(args.output).write_text(json.dumps({
        "text": " ".join(s["text"] for s in segments).strip(),
        "language": (raw.get("result") or {}).get("language", "") or args.lang,
        "segments": segments,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
