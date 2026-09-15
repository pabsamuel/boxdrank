"""Game targets.

The differences between engines are almost entirely about *packaging*, not
about audio: where loose files are allowed, what the mod folder is called, and
which files are locked inside an archive. That is what these adapters encode.
"""

from __future__ import annotations

from pathlib import Path

from ..models import Order
from .base import AssetRef, TargetAdapter


class GenericGame(TargetAdapter):
    name = "generic"
    description = "Loose audio files on disk"

    def install_notes(self, order: Order) -> str:
        return (
            "**Before you start:** copy your whole game audio folder somewhere safe. "
            "Every file we replace is listed in `manifest.json` with its original checksum.\n\n"
            "1. Open `audio/` in this package. The folder structure matches your game's audio folder exactly.\n"
            f"2. Copy everything in `audio/` into `{order.target.asset_root}`, overwriting when asked.\n"
            "3. Start the game and listen to one early line to confirm it worked.\n"
            "4. To undo: restore your backup, or use `manifest.json` to find exactly which files changed.\n"
        )


class UnrealGame(TargetAdapter):
    name = "unreal"
    description = "Unreal Engine title"

    def mod_root(self, order: Order) -> str:
        return "Content/Mods/VoxSwap"

    def speaker_hint(self, rel_path: str) -> str:
        # Unreal VO usually lives at Content/Audio/VO/<Character>/<cue>.uasset|wav
        parts = [p for p in Path(rel_path).parts if p.lower() not in ("content", "audio", "vo", "dialogue", "localization")]
        return parts[-2] if len(parts) > 1 else (parts[0] if parts else "")

    def install_notes(self, order: Order) -> str:
        return (
            "**Unreal Engine titles ship their audio inside `.pak` / `.utoc` / `.ucas` archives.** "
            "Two ways to use this package:\n\n"
            "**A. Loose files (only if the game allows it)**\n"
            "Some Unreal games load loose files when the game's `Engine.ini` does not forbid it. "
            f"Copy `audio/` into `{order.target.asset_root}` and test one line.\n\n"
            "**B. Mod pak (works everywhere)**\n"
            "1. Get a pak tool — Epic's `UnrealPak` (ships with the engine) or `repak`.\n"
            "2. Pack the `audio/` folder so the internal paths match the paths in `manifest.json`.\n"
            "3. Name it with a high load priority, e.g. `pakchunk999-VoxSwap_P.pak`.\n"
            "4. Drop it in the game's `Content/Paks/~mods/` folder (create `~mods` if missing).\n"
            "5. Launch and test. To undo, delete the .pak — the original game files were never touched.\n"
        )


class UnityGame(TargetAdapter):
    name = "unity"
    description = "Unity title"

    def mod_root(self, order: Order) -> str:
        return "StreamingAssets/VoxSwap"

    def install_notes(self, order: Order) -> str:
        return (
            "**Where Unity keeps voice lines decides which route you take.**\n\n"
            "**A. `StreamingAssets` (easy)**\n"
            f"If your lines live under `StreamingAssets`, copy `audio/` into `{order.target.asset_root}` "
            "keeping the structure, and you are done.\n\n"
            "**B. Asset bundles / `resources.assets` (needs a tool)**\n"
            "1. Install AssetRipper or UABEA (Unity Asset Bundle Extractor Avalonia).\n"
            "2. Open the bundle named in `manifest.json` for each line.\n"
            "3. Import the matching WAV from `audio/` over the existing AudioClip, keeping the clip name identical.\n"
            "4. Save the bundle and replace the original (keep your backup).\n\n"
            "If the game uses FMOD (`.bank` files), see the note in `WARNINGS.md`.\n"
        )


class WwiseGame(TargetAdapter):
    name = "wwise"
    description = "Wwise-based title (.bnk / .wem)"

    def mod_root(self, order: Order) -> str:
        return "VoxSwap-wwise"

    def install_notes(self, order: Order) -> str:
        return (
            "**This game uses Wwise. Audio lives in `.bnk` banks and `.wem` streams, which are not "
            "plain audio files.** VoxSwap delivers finished, correctly-timed WAVs plus the mapping you "
            "need to get them in:\n\n"
            "1. `manifest.json` maps every delivered WAV to the original `.wem`/`.bnk` entry and its ID.\n"
            "2. Convert each WAV to `.wem` using the Wwise Authoring tool (free tier is enough) with the "
            "same conversion settings the game uses — usually Vorbis Quality High for dialogue.\n"
            "3. Replace the `.wem` files by ID, or rebuild the bank, using your game's modding toolkit "
            "(for example WolvenKit for REDengine titles, or the game's own mod loader).\n"
            "4. Keep every original file. A wrong `.wem` ID will make a line silent, not crash the game — "
            "restore and retry.\n\n"
            "If you do not want to do this yourself, ask your VoxSwap operator for the **assisted install** "
            "option for this title.\n"
        )

    def warnings(self, assets: list[AssetRef]) -> list[str]:
        return super().warnings(assets) + [
            "Wwise conversion settings must match the game's. Mismatched sample rates play at the wrong "
            "speed, which sounds like a broken mod rather than a bad voice."
        ]
