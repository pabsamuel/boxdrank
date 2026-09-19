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

It also speaks voice **conversion**, which is a different job: instead of
reading a line out, it rewrites an existing recording in someone else's voice,
keeping the original timing and performance. That is `/vc`, and it is what
`providers/local_vc.py` talks to:

    {"source_wav": "/orders/X/assets/vo/hero_01.wav", "speaker_wav": "/ref.wav"}
    -> 200, audio/wav bytes

**Adding another engine is one file.** Drop a module in `tools/local/engines/`
exposing either or both of:

    def load(**options) -> object                       # called once, returns your handle
    def synthesize(handle, text, speaker_wav, language, emotion, out_path) -> None
    def convert(handle, source_wav, speaker_wav, out_path) -> None

then run with `--engine yourmodule`. An engine that implements only one of them
answers 400 on the other endpoint rather than pretending. See `engines/xtts.py`
for speech and `engines/freevc.py` for conversion. This is deliberately not a
plugin framework: local models change every few months and a thin seam ages
better than an abstraction.
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
from urllib.parse import urlparse

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

        route = urlparse(self.path).path.rstrip("/") or "/tts"
        if route.endswith("/vc"):
            return self._convert(request)
        return self._speak(request)

    def _speak(self, request: dict) -> None:
        if not hasattr(_engine, "synthesize"):
            return self._error(400, f"engine {_engine.__name__.split('.')[-1]!r} does not speak text; "
                                    "POST to /vc to convert an existing recording")
        text = (request.get("text") or "").strip()
        if not text:
            return self._error(400, "no text given")
        speaker = request.get("speaker_wav") or ""
        if speaker and not Path(speaker).exists():
            return self._error(400, f"speaker_wav does not exist: {speaker}")

        self._run(lambda out: _engine.synthesize(        # type: ignore[union-attr]
            _handle, text, speaker,
            request.get("language") or "en",
            request.get("emotion") or "neutral",
            out,
        ))

    def _convert(self, request: dict) -> None:
        if not hasattr(_engine, "convert"):
            return self._error(400, f"engine {_engine.__name__.split('.')[-1]!r} cannot convert audio; "
                                    "run the server with --engine freevc, or POST to /tts")
        source = request.get("source_wav") or ""
        speaker = request.get("speaker_wav") or ""
        # Both files are read by the model, so a missing one has to be a 400
        # here: further in it becomes an unreadable stack trace in a log the
        # operator never sees.
        for label, path in (("source_wav", source), ("speaker_wav", speaker)):
            if not path:
                return self._error(400, f"no {label} given")
            if not Path(path).exists():
                return self._error(400, f"{label} does not exist: {path}")

        self._run(lambda out: _engine.convert(_handle, source, speaker, out))   # type: ignore[union-attr]

    def _run(self, call) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_path = Path(tmp) / "out.wav"
            try:
                with _lock:                               # one generation at a time
                    call(out_path)
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
    base = f"http://{args.host}:{args.port}"
    if hasattr(_engine, "convert"):
        print(f"listening on {base}/vc\nset VOXSWAP_LOCAL_VC_URL={base}/vc", flush=True)
    if hasattr(_engine, "synthesize"):
        print(f"listening on {base}/tts\nset VOXSWAP_LOCAL_TTS_URL={base}/tts", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
