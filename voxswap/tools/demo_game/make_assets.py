#!/usr/bin/env python3
"""Station Four's voice-over and a stand-in customer, from voices we may sell next to.

    python3 tools/demo_game/make_assets.py --model ~/models/piper/en_US-libritts-high.onnx

Writes a small game and a ready order into `demo-game/` (gitignored):

    demo-game/assets/vo/hero/h1.wav … h8.wav   the hero, as the game ships it
    demo-game/order/                           order.json, script, consent, and
                                               the customer's eleven samples

Both voices come from Piper's LibriTTS model, which is trained on LibriTTS
(CC BY 4.0), so the result can sit on a page that sells something, with
attribution. The first build of this demo used Piper's "Ryan" voice, whose
dataset is CC BY-NC-SA: fine for a private test, not for a shop window.

Nobody real is on these recordings. That is the point: the public demo must not
need anyone's consent, because it has nobody's voice in it.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent

ACTOR = "47"       # deepest, darkest of the speakers measured: the hero as shipped
CUSTOMER = "110"   # higher and noticeably brighter: easy to tell apart by ear

LINES = [
    ("h1", "Anyone out there? This is station four. Repeat — station four."),
    ("h2", "The lights just went out. All of them."),
    ("h3", "I am not going down there alone."),
    ("h4", "Okay. Okay. Breathe. Think."),
    ("h5", "Whatever you are, I can hear you."),
    ("h6", "Get away from that door!"),
    ("h7", "The signal is up. Somebody has to hear it now."),
    ("h8", "If anyone finds this recording, it was worth it."),
]
REFERENCE = [
    "My name is Jordan and this is a recording of my own voice.",
    "I am reading a few sentences so the studio has enough to work with.",
    "The weather today is cold and bright and the streets are empty.",
    "A question sounds different, does it not? And a shout is different again.",
    "Numbers, for variety: one, two, three, four, five, six, seven, eight.",
    "I usually play in the evening, after work, with the lights turned down.",
    "Speaking slowly here, and now a little faster, to give some range.",
    "That should be more than enough for a clean reference. Thank you.",
    "Some mornings I walk to the shop before anyone else is awake.",
    "It is a strange thing, hearing your own voice played back to you.",
    "The train was late again, so I read another chapter on the platform.",
]


def say(model: Path, text: str, out: Path, speaker: str) -> float:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "-m", "piper", "--model", str(model), "--speaker", speaker,
                    "--output_file", str(out)], input=text.encode(), check=True, capture_output=True)
    with wave.open(str(out)) as w:
        return w.getnframes() / w.getframerate()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--model", required=True, type=Path, help="Piper LibriTTS .onnx (its .onnx.json beside it)")
    ap.add_argument("--root", type=Path, default=Path("demo-game"), help="where to build (default: demo-game/)")
    args = ap.parse_args()
    root = args.root.resolve()

    # The order's paperwork is fixed text kept in the repo; only the audio is
    # generated. A stale provider_voice_id from an earlier build would point at
    # a reference made from different samples, so the copy always starts clean.
    shutil.copytree(HERE / "order", root / "order", dirs_exist_ok=True)

    vo = root / "assets/vo/hero"
    total = 0.0
    for name, line in LINES:
        total += say(args.model, line, vo / f"{name}.wav", ACTOR)
        (vo / f"{name}.txt").write_text(line, encoding="utf-8")
    samples = root / "order/voices/customer"
    ref = sum(say(args.model, t, samples / f"sample_{i:02d}.wav", CUSTOMER) for i, t in enumerate(REFERENCE, 1))
    print(f"game: {len(LINES)} lines, {total:.1f}s (speaker {ACTOR})")
    print(f"customer reference: {len(REFERENCE)} files, {ref:.1f}s (speaker {CUSTOMER})")
    print(f"\nnext:\n  VOXSWAP_ORDERS_DIR={root} VOXSWAP_WORK_DIR={root}/work "
          f"VOXSWAP_DELIVERY_DIR={root}/delivery VOXSWAP_LOCAL_VOICE_DIR={root}/.voices \\\n"
          f"  VOXSWAP_LOCAL_VC_URL=http://127.0.0.1:8124/vc python3 -m voxswap run order\n"
          f"  python3 tools/demo_game/build_page.py --root {root}")


if __name__ == "__main__":
    main()
