#!/usr/bin/env python3
"""Bundle Station Four into one HTML file, with both casts embedded.

    python3 tools/demo_game/build_page.py --root demo-game

Run it after `make_assets.py` and after the order has gone through the
pipeline. It writes `web/demo.html` and the three clips the landing page plays
(`web/audio/<line>-original.mp3` / `-swapped.mp3`).

Two takes of every line — the voice the game ships with, and the same line
after VoxSwap put the customer's voice in its place — so the swap can be heard
mid-sentence rather than described.

MP3 rather than WAV because the whole thing has to be one file: 16 seconds of
dialogue twice over is 2.8 MB as PCM and 260 KB at 64 kbit, and nobody can hear
the difference on a phone speaker.
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parent.parent / "web"

# The lines the landing page's player cycles through, shortest first so the
# first press pays off immediately.
LANDING = ("h6", "h1", "h4")

SCENES = [
    {"id": "h1", "place": "RELAY STATION FOUR — 03:12",
     "prose": "The console hums. Outside, nothing but snow and the dark line of the ridge. "
              "You press the transmit key for the ninth time tonight.",
     "choices": [["Keep calling", "h2"]]},
    {"id": "h2", "place": "RELAY STATION FOUR — 03:14",
     "prose": "Every lamp in the room dies at once. The hum stops. In the silence you can "
              "hear the building settling, and under that, something else.",
     "choices": [["Check the breaker downstairs", "h3"], ["Stay at the desk", "h4"]]},
    {"id": "h3", "place": "THE STAIRWELL",
     "prose": "The stairwell swallows your torchlight three steps down. Cold comes up it "
              "like a draught from an open door.",
     "choices": [["Go back up", "h4"]]},
    {"id": "h4", "place": "RELAY STATION FOUR — 03:16",
     "prose": "You sit. Hands flat on the desk. The emergency battery clicks on and gives "
              "you one green light, and that is enough to think by.",
     "choices": [["Listen", "h5"]]},
    {"id": "h5", "place": "RELAY STATION FOUR — 03:19",
     "prose": "A sound moves along the corridor. Not footsteps. Something heavier, "
              "dragging, unhurried, and it stops outside the door.",
     "choices": [["Shout", "h6"], ["Go for the transmitter", "h7"]]},
    {"id": "h6", "place": "THE DOOR",
     "prose": "Your voice cracks off the concrete walls. Whatever is out there does not "
              "answer, but the dragging starts again — moving away.",
     "choices": [["Go for the transmitter", "h7"]]},
    {"id": "h7", "place": "THE TRANSMITTER",
     "prose": "You patch the battery straight into the mast. The needle climbs. Somewhere "
              "far south of here, a light comes on in a room you will never see.",
     "choices": [["Record a message", "h8"]]},
    {"id": "h8", "place": "THE LAST MESSAGE",
     "prose": "The tape spools. You say your name, the station number, and the time, and "
              "then you say the thing you actually came here to say.",
     "choices": [["Start again", "h1"]]},
]


def frames_at_22k(path: Path) -> int:
    import wave
    with wave.open(str(path)) as w:
        return round(w.getnframes() * 22050 / w.getframerate())


def mp3(path: Path, frames: int, out: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(path), "-af", f"aresample=22050,apad,atrim=end_sample={frames}", "-ac", "1",
         "-c:a", "libmp3lame", "-b:a", "64k", str(out)],
        check=True, capture_output=True,
    )


def encode(path: Path, frames: int) -> str:
    """WAV in, base64 MP3 out, exactly `frames` long.

    Conversion keeps a line's length to a fraction of a millisecond, but MP3
    rounds every clip up to a whole frame (52 ms here), so two takes 0.1 ms
    apart can land a frame apart. Padding both to the original's sample count
    keeps the page's "same length" true of the files it actually plays.
    """
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        out = Path(tmp.name)
    mp3(path, frames, out)
    data = base64.b64encode(out.read_bytes()).decode("ascii")
    out.unlink()
    return "data:audio/mpeg;base64," + data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, default=Path("demo-game"), help="the folder make_assets.py built")
    ap.add_argument("--web", type=Path, default=WEB, help="the site folder to write into")
    args = ap.parse_args()
    root = args.root.resolve()
    ORIGINAL = root / "assets/vo/hero"
    SWAPPED = root / "delivery/GAME-DEMO/audio/vo/hero"
    OUT = args.web / "demo.html"

    lines = {}
    total_original = total_swapped = 0
    for scene in SCENES:
        name = scene["id"] + ".wav"
        original, swapped = ORIGINAL / name, SWAPPED / name
        if not swapped.exists():
            raise SystemExit(f"error: no swapped take for {name} — run the order first")
        lines[scene["id"]] = {
            "text": (ORIGINAL / (scene["id"] + ".txt")).read_text(encoding="utf-8").strip(),
            "original": encode(original, frames_at_22k(original)),
            "swapped": encode(swapped, frames_at_22k(original)),
        }
        total_original += original.stat().st_size
        total_swapped += swapped.stat().st_size
        print(f"  {scene['id']}  embedded")

    html = (HERE / "template.html").read_text(encoding="utf-8")
    html = html.replace("/*__SCENES__*/null", json.dumps(SCENES, ensure_ascii=False))
    html = html.replace("/*__LINES__*/null", json.dumps(lines, ensure_ascii=False))
    OUT.write_text(html, encoding="utf-8")
    print(f"\n{OUT}  {OUT.stat().st_size / 1024:.0f} KB")
    print(f"(source audio was {(total_original + total_swapped) / 1024:.0f} KB as WAV)")

    audio = args.web / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    for line in LANDING:
        frames = frames_at_22k(ORIGINAL / f"{line}.wav")
        mp3(ORIGINAL / f"{line}.wav", frames, audio / f"{line}-original.mp3")
        mp3(SWAPPED / f"{line}.wav", frames, audio / f"{line}-swapped.mp3")
    print(f"{audio}/  {len(LANDING) * 2} clips for the landing page")


if __name__ == "__main__":
    main()
