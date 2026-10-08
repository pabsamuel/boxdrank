"""Console + per-job file logging.

Job logs are the first thing to read when a customer says "this sounds wrong",
so every stage writes into the job's own log file as well as the console.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import TextIO

_LEVELS = {"debug": 10, "info": 20, "warn": 30, "error": 40}

_COLORS = {"debug": "\033[90m", "info": "\033[0m", "warn": "\033[33m", "error": "\033[31m", "ok": "\033[32m"}
_RESET = "\033[0m"


class Logger:
    def __init__(self, level: str = "info", file: Path | None = None, stream: TextIO | None = None) -> None:
        self.threshold = _LEVELS.get(level, 20)
        self.stream = stream or sys.stderr
        self._fh = None
        if file is not None:
            file.parent.mkdir(parents=True, exist_ok=True)
            self._fh = file.open("a", encoding="utf-8")
        self.color = getattr(self.stream, "isatty", lambda: False)()

    def _emit(self, level: str, message: str) -> None:
        if _LEVELS.get(level, 20) < self.threshold:
            return
        stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{stamp}] {level.upper():5s} {message}"
        if self._fh:
            self._fh.write(line + "\n")
            self._fh.flush()
        if self.color:
            tint = _COLORS.get(level, "")
            self.stream.write(f"{tint}{line}{_RESET}\n")
        else:
            self.stream.write(line + "\n")
        self.stream.flush()

    def debug(self, msg: str) -> None: self._emit("debug", msg)
    def info(self, msg: str) -> None: self._emit("info", msg)
    def warn(self, msg: str) -> None: self._emit("warn", msg)
    def error(self, msg: str) -> None: self._emit("error", msg)

    def ok(self, msg: str) -> None:
        self._emit("info", f"OK  {msg}")

    def stage(self, name: str, message: str) -> None:
        self._emit("info", f"[{name}] {message}")

    def close(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None
