#!/usr/bin/env python3
"""A tiny TTS server so a local model is loaded once, not once per line.

The problem this solves: VoxSwap's `local` voice provider can call a command per
line, which for a local model means loading several gigabytes of weights for
every single utterance. On a 3,000-line game that is days of model loading and
minutes of speech.

Run this once, point VoxSwap at it, and the model stays resident:

    pip install TTS                       # for the bundled XTTS engine
    python3 tools/local/tts_server.py --engine xtts --port 8123

    # then, in voxswap/.env
    VOXSWAP_LOCAL_TTS_URL=http://127.0.0.1:8123/tts

Protocol — POST JSON, get a WAV back:

    {"text": "...", "speaker_wav": "/path/ref.wav", "language": "tr", "emotion": "angry"}
    -> 200, audio/wav bytes            (or 4xx/5xx with a JSON {"error": "..."})

**Adding another engine is one file.** Drop a module in `tools/local/engines/`
exposing:

    def load(**options) -> object                       # called once, returns your handle
    def synthesize(handle, text, speaker_wav, language, emotion, out_path) -> None

then run with `--engine yourmodule`. See `engines/xtts.py` for the reference
implementation. This is deliberately not a plugin framework: local TTS changes
every few months and a thin seam ages better than an abstraction.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent / "engines"

_lock = threading.Lock()        # most local TTS models are not thread-safe
_engine = None
_handle = None


def load_engine(name: str, options: dict) -> None:
    global _engine, _handle
    sys.path.insert(0, str(ENGINE_DIR.parent))
    try:
        _engine = importlib.import_module(f"engines.{name}") if "." not in name else importlib.import_module(name)
    except ImportError as exc:
        available = ", ".join(sorted(p.stem for p in ENGINE_DIR.glob("*.py") if not p.stem.startswith("_")))
        raise SystemExit(f"error: no engine {name!r} ({exc}). Available: {available or 'none'}")
    print(f"loading engine {name}...", flush=True)
    _handle = _engine.load(**options)
    print("ready", flush=True)


class Handler(BaseHTTPRequestHandler):
    server_version = "VoxSwapTTS/1.0"

    def do_POST(self) -> None:                           # noqa: N802 - stdlib naming
        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length) or "{}")
        except (ValueError, json.JSONDecodeError) as exc:
            return self._error(400, f"could not read the request: {exc}")

        text = (request.get("text") or "").strip()
        if not text:
            return self._error(400, "no text given")
        speaker = request.get("speaker_wav") or ""
        if speaker and not Path(speaker).exists():
            return self._error(400, f"speaker_wav does not exist: {speaker}")

        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "out.wav"
            try:
                with _lock:                               # one generation at a time
                    _engine.synthesize(                   # type: ignore[union-attr]
                        _handle, text, speaker,
                        request.get("language") or "en",
                        request.get("emotion") or "neutral",
                        out_path,
                    )
            except Exception as exc:                      # noqa: BLE001 - reported to the caller
                return self._error(500, f"{type(exc).__name__}: {exc}")
            if not out_path.exists():
                return self._error(500, "the engine produced no audio")
            body = out_path.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:                             # noqa: N802 - health check
        body = json.dumps({"status": "ready" if _handle is not None else "loading"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code: int, message: str) -> None:
        body = json.dumps({"error": message}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
        print(f"error {code}: {message}", file=sys.stderr, flush=True)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"  {fmt % args}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", default="xtts", help="engine module in tools/local/engines/ (default: xtts)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8123)
    parser.add_argument("--option", action="append", default=[], metavar="KEY=VALUE",
                        help="passed to the engine's load(), repeatable (e.g. --option device=cuda)")
    args = parser.parse_args()

    options = {}
    for item in args.option:
        key, _, value = item.partition("=")
        options[key.strip()] = value.strip()

    load_engine(args.engine, options)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"listening on http://{args.host}:{args.port}/tts\n"
          f"set VOXSWAP_LOCAL_TTS_URL=http://{args.host}:{args.port}/tts", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
