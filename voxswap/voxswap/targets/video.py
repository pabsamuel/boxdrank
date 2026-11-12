"""Movie / video target.

A film is easier than a game in one way and harder in another. Easier: the
timeline is fixed, the subtitle file gives us the script and exact timings, and
the deliverable is a single audio track. Harder: there is no "replace one clip"
— we rebuild a full-length track where our dubbed lines sit at their exact
timestamps over the original bed.

The bed matters. Replacing the whole track loses music and effects, so the
default is to duck the original under the dub rather than remove it. A true
dialogue-free M&E track is only available if the customer has one.
"""

from __future__ import annotations

from pathlib import Path

from ..models import Line, Order
from .base import VIDEO_SUFFIXES, AssetRef, TargetAdapter, iter_assets


class VideoTarget(TargetAdapter):
    name = "video"
    description = "Film / video with a rebuilt dialogue track"

    def discover(self, order: Order, root: Path) -> list[AssetRef]:
        """For video we discover the *container*, not individual clips — the
        lines come from the subtitle/script file."""
        found = [
            ref for ref in iter_assets(order, root)
            if Path(ref.rel_path).suffix.lower() in VIDEO_SUFFIXES
        ]
        if found:
            return found
        return list(iter_assets(order, root))            # audio-only jobs (audiobooks, podcasts)

    def delivery_path(self, order: Order, line: Line) -> str:
        # Individual takes are kept for review; the deliverable is the full
        # track the package stage builds from them.
        return str(Path("lines") / f"{line.line_id}.wav")

    def mod_root(self, order: Order) -> str:
        return "VoxSwap"

    def install_notes(self, order: Order) -> str:
        return (
            "This package contains:\n\n"
            "* `dub/<name>.dub.wav` — the full-length dubbed audio track, aligned to the original runtime.\n"
            "* `dub/<name>.dub.srt` — subtitles matching the new dialogue.\n"
            "* `lines/` — every individual line, if you want to review or re-use single takes.\n"
            "* `<name>.voxswap.mkv` — the film with the dub added as an extra audio track "
            "(only present if the operator had ffmpeg available).\n\n"
            "**How to watch it**\n\n"
            "1. *Easiest:* open the `.voxswap.mkv` if it is included — pick the \"VoxSwap\" audio track in "
            "your player. Your original file is untouched.\n"
            "2. *VLC:* open the film, then Audio -> Audio Track -> Open File and choose the `.dub.wav`.\n"
            "3. *Plex / Jellyfin:* put the `.dub.wav` next to the film with a matching name and rescan.\n"
            "4. *Make your own copy:* with ffmpeg installed —\n"
            "   `ffmpeg -i film.mkv -i dub.wav -map 0 -map 1:a -c copy -c:a:1 aac film.voxswap.mkv`\n\n"
            "Nothing here modifies your original file.\n"
        )

    def warnings(self, assets: list[AssetRef]) -> list[str]:
        return [
            "The dub sits over the original mix with the original dialogue ducked underneath. Some of the "
            "original voice may still be faintly audible in loud scenes. A fully clean result needs a "
            "music-and-effects (M&E) track, which retail releases do not include."
        ]
