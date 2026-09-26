"""Target adapters: where the lines are, and where the replacements go.

A target adapter answers three questions for one kind of destination:

  1. discover()      — which files under asset_root are replaceable dialogue?
  2. delivery_path() — what should the replacement file be called, and where
                       does it sit in the folder we hand back?
  3. install_notes() — what does the customer physically do with the ZIP?

Question 3 is the one that decides whether a customer succeeds or emails you at
midnight, so every adapter writes real, specific instructions.
"""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass
from pathlib import Path

from ..models import Line, Order

AUDIO_SUFFIXES = {".wav", ".ogg", ".mp3", ".flac", ".m4a", ".opus", ".aiff", ".aif", ".wem", ".xwm", ".bnk"}
VIDEO_SUFFIXES = {".mkv", ".mp4", ".mov", ".avi", ".webm", ".m4v"}
# Formats no open tool can safely rewrite in place. We still deliver clean WAVs
# plus instructions rather than pretending the swap happened.
OPAQUE_SUFFIXES = {".wem", ".bnk", ".xwm", ".fsb", ".pck"}


@dataclass
class AssetRef:
    rel_path: str
    speaker_hint: str = ""
    note: str = ""


class TargetAdapter:
    name = "base"
    #: shown in the delivery README so the customer knows what they received
    description = "Generic audio replacement"

    # -- discovery -------------------------------------------------------

    def discover(self, order: Order, root: Path) -> list[AssetRef]:
        return list(iter_assets(order, root))

    def speaker_hint(self, rel_path: str) -> str:
        """Guess a character from the path. Folder names are usually the best
        signal in shipped games (`vo/en/v_male/...`)."""
        parts = Path(rel_path).parts
        return parts[-2] if len(parts) > 1 else ""

    # -- delivery --------------------------------------------------------

    def delivery_path(self, order: Order, line: Line) -> str:
        layout = order.target.delivery_layout
        rel = Path(line.source_rel)
        if layout == "flat":
            return rel.name
        if layout == "mod":
            return str(Path(self.mod_root(order)) / rel)
        return str(rel)                                  # mirror

    def mod_root(self, order: Order) -> str:
        return "VoxSwap"

    # -- customer-facing -------------------------------------------------

    def install_notes(self, order: Order) -> str:
        return (
            "1. Back up the original files listed in `manifest.json` before copying anything.\n"
            f"2. Copy the contents of `audio/` over `{order.target.asset_root}` in your installation, "
            "keeping the folder structure exactly as it is.\n"
            "3. Launch the game or player and check one line first.\n"
            "4. To undo, restore your backup — nothing else was modified.\n"
        )

    def warnings(self, assets: list[AssetRef]) -> list[str]:
        opaque = sorted({Path(a.rel_path).suffix.lower() for a in assets if Path(a.rel_path).suffix.lower() in OPAQUE_SUFFIXES})
        if not opaque:
            return []
        return [
            f"This target contains packed audio ({', '.join(opaque)}) that cannot be rewritten directly. "
            "VoxSwap delivers ready-to-import WAVs and a mapping file; importing them needs the game's own "
            "tooling (Wwise/FMOD/modding tools)."
        ]


def iter_assets(order: Order, root: Path):
    """Walk asset_root applying the order's include/exclude globs.

    Patterns are matched against the POSIX-style relative path, so the same
    order.json behaves identically on Windows and Linux.
    """
    include = order.target.include or ["**/*"]
    exclude = order.target.exclude or []
    seen: set[str] = set()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        if rel in seen:
            continue
        if not any(fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(path.name, pattern) for pattern in include):
            continue
        if any(fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(path.name, pattern) for pattern in exclude):
            continue
        seen.add(rel)
        yield AssetRef(rel_path=rel)
