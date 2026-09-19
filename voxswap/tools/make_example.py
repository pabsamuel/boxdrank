#!/usr/bin/env python3
"""Build the synthetic demo order so you can watch the pipeline run.

Creates `orders/EXAMPLE-GAME/` with fake game audio, fake voice samples and a
fake consent recording. The audio is a synthesised buzz, not speech — the point
is to exercise the whole pipeline (matching, timing, loudness, packaging, QC)
offline, in seconds, for free.

    python3 tools/make_example.py
    python3 -m voxswap run EXAMPLE-GAME

Nothing here touches a real provider: the demo order uses the `mock` providers.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from voxswap.audio import tone, write_wav  # noqa: E402

ORDER_ID = "EXAMPLE-GAME"
RATE = 8000          # low rate on purpose: the demo files stay tiny

# Slot lengths are ~380 ms per word, the pace real dialogue is recorded at.
# That matters: it is what makes the demo exercise the time-fitting code the
# way a real title does, instead of every line trivially overflowing.
MS_PER_WORD = 380


def _slot(text: str) -> int:
    return max(400, len(text.split()) * MS_PER_WORD)


HERO_LINES = [
    ("hero_01", "Wake up. We are moving out in five.", 118.0),
    ("hero_02", "I said get down!", 132.0),
    ("hero_03", "There is nothing left for us in this city.", 112.0),
    ("hero_04", "Cover me. I am going in.", 126.0),
]
NPC_LINES = [
    ("guard_01", "Halt. Papers.", 96.0),
    ("guard_02", "Move along, citizen.", 92.0),
]


def build() -> Path:
    order_dir = ROOT / "orders" / ORDER_ID
    assets = order_dir / "assets" / "vo"
    voices = order_dir / "voices" / "main"
    consent = order_dir / "consent"
    for d in (assets / "hero", assets / "npc", voices, consent):
        d.mkdir(parents=True, exist_ok=True)

    # 1. "game" dialogue
    for name, text, freq in HERO_LINES:
        write_wav(assets / "hero" / f"{name}.wav", tone(_slot(text), freq=freq, sample_rate=RATE))
        # A sidecar transcript lets the mock ASR recover text for lines the
        # script.csv does not cover — exercising the transcription path.
        (assets / "hero" / f"{name}.txt").write_text(text, encoding="utf-8")
    for name, text, freq in NPC_LINES:
        write_wav(assets / "npc" / f"{name}.wav", tone(_slot(text), freq=freq, sample_rate=RATE))
        (assets / "npc" / f"{name}.txt").write_text(text, encoding="utf-8")

    # 2. the customer's voice samples
    for index, freq in enumerate((150.0, 162.0), start=1):
        write_wav(voices / f"sample_{index:02d}.wav", tone(3000, freq=freq, sample_rate=RATE))

    # 3. the spoken consent phrase
    write_wav(consent / "C-1-phrase.wav", tone(9000, freq=150.0, sample_rate=RATE))
    (consent / "C-1-signed.md").write_text(
        "# EXAMPLE — signed consent placeholder\n\n"
        "In a real order this is the scan or PDF of templates/consent-form.md, signed by the\n"
        "person whose voice is being cloned. The pipeline refuses to run without a file here.\n",
        encoding="utf-8",
    )

    # 4. a dialogue table covering three of the four hero lines; the fourth is
    #    left out so the transcribe stage has something to do.
    script = order_dir / "script.csv"
    rows = ["file,speaker,text"]
    for name, text, _ in HERO_LINES[:3]:
        rows.append(f"{name},Hero,\"{text}\"")
    script.write_text("\n".join(rows) + "\n", encoding="utf-8")

    # 5. the order itself
    order = json.loads((ROOT / "templates" / "order.template.json").read_text(encoding="utf-8"))
    order["order_id"] = ORDER_ID
    order["created_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    order["customer"] = {"name": "Demo Customer", "email": "demo@example.com",
                         "contact_locale": "en", "notes": "Synthetic demo order."}
    order["target"] = {
        "kind": "game",
        "title": "Example Game",
        "adapter": "generic",
        "asset_root": "assets",
        "include": ["**/*.wav"],
        "exclude": [],
        "script_file": "script.csv",
        "delivery_layout": "mirror",
        "output_format": "source",
    }
    order["language"] = {"source": "en", "target": "en"}
    order["voices"] = [{
        "voice_id": "main", "person_label": "Demo Customer",
        "samples_dir": "voices/main", "consent_ref": "C-1",
        "gender_hint": "", "accent_hint": "",
    }]
    order["roles"] = [{
        "role_id": "HERO", "display_name": "Hero", "voice_id": "main",
        "match": ["vo/hero/*.wav"], "match_speakers": ["hero"], "style": "neutral",
    }]
    order["consents"] = [{
        "consent_ref": "C-1", "person_name": "Demo Customer", "person_email": "demo@example.com",
        "is_self": True, "signed_at": date.today().isoformat(),
        "signature_file": "consent/C-1-signed.md", "phrase_audio": "consent/C-1-phrase.wav",
        "scope": ["voice_clone", "personal_use"], "expires_at": "", "revoked": False,
    }]
    order["options"]["max_stretch"] = 1.2      # a take may be pulled 20% either way to fit its slot
    order["providers"] = {"asr": "mock", "translation": "mock", "voice": "mock"}
    (order_dir / "order.json").write_text(json.dumps(order, indent=2, ensure_ascii=False), encoding="utf-8")
    return order_dir


if __name__ == "__main__":
    path = build()
    print(f"Created {path}")
    print("\nNow run:\n  python3 -m voxswap validate EXAMPLE-GAME\n  python3 -m voxswap run EXAMPLE-GAME")
