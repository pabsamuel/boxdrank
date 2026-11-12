"""Reading the customer's script, when there is one.

Three sources of truth for "what does this character say, and when":

  * a subtitle file (.srt/.vtt) — the normal case for films, and for games that
    ship localisation subtitles;
  * a dialogue table (.csv/.json) — the normal case for games that expose their
    string table, and the format we ask customers for;
  * nothing at all — then ASR produces the script (stage `transcribe`).

A supplied script is always better than ASR: correct spellings, correct names,
correct speaker labels, and it costs nothing.
"""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .errors import AssetError

_SRT_TIME = re.compile(
    r"(?P<h>\d{1,2}):(?P<m>\d{2}):(?P<s>\d{2})[,.](?P<ms>\d{1,3})\s*-->\s*"
    r"(?P<h2>\d{1,2}):(?P<m2>\d{2}):(?P<s2>\d{2})[,.](?P<ms2>\d{1,3})"
)
# "JOHN: get down!" or "[JOHN] get down!" — common speaker prefixes in subs
_SPEAKER_PREFIX = re.compile(r"^\s*[\[(<]?([A-Z][A-Z0-9 ._'-]{1,28})[\])>]?\s*[:：]\s*(.+)$")
_TAG = re.compile(r"<[^>]+>")


@dataclass
class ScriptLine:
    text: str
    speaker: str = ""
    start_ms: int = 0
    end_ms: int = 0
    file_hint: str = ""          # which asset this line belongs to, when known
    meta: dict[str, str] = field(default_factory=dict)

    @property
    def duration_ms(self) -> int:
        return max(0, self.end_ms - self.start_ms)


def parse_script(path: Path) -> list[ScriptLine]:
    suffix = path.suffix.lower()
    if not path.exists():
        raise AssetError(f"script file not found: {path}", "Fix target.script_file in order.json, or remove it to use ASR.")
    if suffix == ".srt":
        return parse_srt(path)
    if suffix in (".vtt", ".webvtt"):
        return parse_vtt(path)
    if suffix == ".csv":
        return parse_csv(path)
    if suffix == ".json":
        return parse_json(path)
    raise AssetError(
        f"unsupported script format: {suffix or path.name}",
        "Supported: .srt, .vtt, .csv, .json. See docs/03-ORDER-FORMAT.md.",
    )


# --------------------------------------------------------------------------
# subtitles
# --------------------------------------------------------------------------


def _timestamp_ms(h: str, m: str, s: str, ms: str) -> int:
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms.ljust(3, "0"))


def _clean(text: str) -> tuple[str, str]:
    """Strip markup and split off a speaker prefix if there is one."""
    body = _TAG.sub("", text).strip()
    body = body.replace("‎", "").replace("‏", "")
    match = _SPEAKER_PREFIX.match(body)
    if match:
        return match.group(1).strip().title(), match.group(2).strip()
    return "", body


def _parse_cues(raw: str) -> list[ScriptLine]:
    lines: list[ScriptLine] = []
    block: list[str] = []
    for raw_line in raw.splitlines() + [""]:
        if raw_line.strip():
            block.append(raw_line)
            continue
        if block:
            lines.extend(_cue_from_block(block))
            block = []
    return lines


def _cue_from_block(block: list[str]) -> list[ScriptLine]:
    timing_index = -1
    for i, line in enumerate(block):
        if _SRT_TIME.search(line):
            timing_index = i
            break
    if timing_index < 0:
        return []
    match = _SRT_TIME.search(block[timing_index])
    assert match is not None
    start = _timestamp_ms(match.group("h"), match.group("m"), match.group("s"), match.group("ms"))
    end = _timestamp_ms(match.group("h2"), match.group("m2"), match.group("s2"), match.group("ms2"))

    body_lines = [l for l in block[timing_index + 1 :] if l.strip()]
    if not body_lines:
        return []

    # A cue holding "- A line\n- Another line" is two speakers, not one.
    if len(body_lines) > 1 and all(l.lstrip().startswith("-") for l in body_lines):
        out: list[ScriptLine] = []
        span = max(1, (end - start) // len(body_lines))
        for i, body in enumerate(body_lines):
            speaker, text = _clean(body.lstrip().lstrip("-").strip())
            if text:
                out.append(ScriptLine(text=text, speaker=speaker, start_ms=start + i * span, end_ms=start + (i + 1) * span))
        return out

    speaker, text = _clean(" ".join(l.strip() for l in body_lines))
    if not text:
        return []
    return [ScriptLine(text=text, speaker=speaker, start_ms=start, end_ms=end)]


def parse_srt(path: Path) -> list[ScriptLine]:
    return _parse_cues(path.read_text(encoding="utf-8-sig", errors="replace"))


def parse_vtt(path: Path) -> list[ScriptLine]:
    raw = path.read_text(encoding="utf-8-sig", errors="replace")
    body = raw.split("\n", 1)[1] if raw.lstrip().upper().startswith("WEBVTT") else raw
    return _parse_cues(body)


# --------------------------------------------------------------------------
# dialogue tables
# --------------------------------------------------------------------------

_ALIASES = {
    "text": ("text", "line", "dialogue", "dialog", "subtitle", "content", "string", "utterance"),
    "speaker": ("speaker", "character", "role", "voice", "actor", "who", "npc"),
    "file": ("file", "filename", "path", "asset", "audio", "wav", "clip", "event", "id"),
    "start": ("start", "start_ms", "begin", "in", "timecode_in"),
    "end": ("end", "end_ms", "out", "timecode_out"),
}


def _pick(row: dict[str, str], key: str) -> str:
    for alias in _ALIASES[key]:
        for column, value in row.items():
            if column and column.strip().lower().replace(" ", "_") == alias:
                return (value or "").strip()
    return ""


def _to_ms(value: str) -> int:
    if not value:
        return 0
    value = value.strip()
    if ":" in value:                                    # 00:01:02.500 or 01:02,500
        parts = re.split(r"[:]", value)
        seconds = parts[-1].replace(",", ".")
        total = float(seconds)
        for i, part in enumerate(reversed(parts[:-1]), start=1):
            total += float(part) * (60 ** i)
        return int(round(total * 1000))
    try:
        number = float(value)
    except ValueError:
        return 0
    return int(number) if number > 1000 else int(round(number * 1000))   # seconds vs ms


def _rows_to_lines(rows: list[dict[str, str]], source: Path) -> list[ScriptLine]:
    out: list[ScriptLine] = []
    for row in rows:
        text = _pick(row, "text")
        if not text:
            continue
        out.append(
            ScriptLine(
                text=text,
                speaker=_pick(row, "speaker"),
                start_ms=_to_ms(_pick(row, "start")),
                end_ms=_to_ms(_pick(row, "end")),
                file_hint=_pick(row, "file"),
            )
        )
    if not out:
        raise AssetError(
            f"{source.name} contained no usable lines",
            "Needs at least a text column (text/line/dialogue) — and ideally speaker and file columns.",
        )
    return out


def parse_csv(path: Path) -> list[ScriptLine]:
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(8192)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel                          # plain comma CSV
        return _rows_to_lines(list(csv.DictReader(fh, dialect=dialect)), path)


def parse_json(path: Path) -> list[ScriptLine]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        for key in ("lines", "dialogue", "entries", "rows", "items"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        raise AssetError(
            f"{path.name} must be a JSON array of line objects",
            'Example: [{"file": "v_01.wav", "speaker": "V", "text": "Wake up."}]',
        )
    rows = [{str(k): ("" if v is None else str(v)) for k, v in item.items()} for item in data if isinstance(item, dict)]
    return _rows_to_lines(rows, path)
