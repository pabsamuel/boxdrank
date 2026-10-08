"""Builders for throwaway orders used by the tests."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from voxswap.audio import tone, write_wav
from voxswap.config import Config

RATE = 8000
MS_PER_WORD = 380


def slot_for(text: str) -> int:
    return max(400, len(text.split()) * MS_PER_WORD)


def make_config(tmp: Path) -> Config:
    return Config(
        orders_dir=tmp / "orders",
        work_dir=tmp / "work",
        delivery_dir=tmp / "delivery",
        archive_dir=tmp / "archive",
        watch_interval_s=1,
        ffmpeg="ffmpeg-not-here",       # force the stdlib path in tests
        ffprobe="ffprobe-not-here",
        log_level="error",
    )


def base_order(order_id: str) -> dict:
    return {
        "order_id": order_id,
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "customer": {"name": "Test Customer", "email": "customer@example.com"},
        "target": {
            "kind": "game", "title": "Test Game", "adapter": "generic",
            "asset_root": "assets", "include": ["**/*.wav"], "exclude": [],
            "script_file": "", "delivery_layout": "mirror", "output_format": "source",
        },
        "language": {"source": "en", "target": "en"},
        "voices": [{"voice_id": "main", "person_label": "Test Customer",
                    "samples_dir": "voices/main", "consent_ref": "C-1"}],
        "roles": [{"role_id": "HERO", "display_name": "Hero", "voice_id": "main",
                   "match": ["vo/hero/*.wav"], "match_speakers": ["hero"]}],
        "consents": [consent_record()],
        "options": {"max_stretch": 1.2, "max_parallel": 2},
        "providers": {"asr": "mock", "translation": "mock", "voice": "mock"},
    }


def consent_record(**overrides) -> dict:
    record = {
        "consent_ref": "C-1",
        "person_name": "Test Customer",
        "person_email": "customer@example.com",
        "is_self": True,
        "signed_at": date.today().isoformat(),
        "signature_file": "consent/C-1-signed.md",
        "phrase_audio": "consent/C-1-phrase.wav",
        "scope": ["voice_clone", "personal_use"],
        "expires_at": "",
        "revoked": False,
    }
    record.update(overrides)
    return record


def write_voice_and_consent(order_dir: Path, *, phrase_ms: int = 9000, samples: int = 2) -> None:
    (order_dir / "voices" / "main").mkdir(parents=True, exist_ok=True)
    (order_dir / "consent").mkdir(parents=True, exist_ok=True)
    for i in range(samples):
        write_wav(order_dir / "voices" / "main" / f"s{i}.wav", tone(3000, freq=150 + i * 10, sample_rate=RATE))
    if phrase_ms:
        write_wav(order_dir / "consent" / "C-1-phrase.wav", tone(phrase_ms, freq=150, sample_rate=RATE))
    (order_dir / "consent" / "C-1-signed.md").write_text("signed", encoding="utf-8")


HERO_LINES = [
    ("hero_01", "Wake up. We are moving out."),
    ("hero_02", "I said get down!"),
    ("hero_03", "There is nothing left for us here."),
]
NPC_LINES = [("guard_01", "Halt. Papers.")]


def make_game_order(cfg: Config, order_id: str = "TEST-GAME", **order_overrides) -> Path:
    order_dir = cfg.orders_dir / order_id
    hero = order_dir / "assets" / "vo" / "hero"
    npc = order_dir / "assets" / "vo" / "npc"
    hero.mkdir(parents=True, exist_ok=True)
    npc.mkdir(parents=True, exist_ok=True)

    for name, text in HERO_LINES:
        write_wav(hero / f"{name}.wav", tone(slot_for(text), freq=120, sample_rate=RATE))
        (hero / f"{name}.txt").write_text(text, encoding="utf-8")
    for name, text in NPC_LINES:
        write_wav(npc / f"{name}.wav", tone(slot_for(text), freq=95, sample_rate=RATE))
        (npc / f"{name}.txt").write_text(text, encoding="utf-8")

    write_voice_and_consent(order_dir)

    order = base_order(order_id)
    for key, value in order_overrides.items():
        if isinstance(value, dict) and isinstance(order.get(key), dict):
            order[key].update(value)
        else:
            order[key] = value
    (order_dir / "order.json").write_text(json.dumps(order, indent=2), encoding="utf-8")
    return order_dir


def make_movie_order(cfg: Config, order_id: str = "TEST-MOVIE") -> Path:
    order_dir = cfg.orders_dir / order_id
    assets = order_dir / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    # Stands in for the film: without ffmpeg the bed is silence anyway, and the
    # timeline comes from the subtitles.
    write_wav(assets / "film.wav", tone(20000, freq=80, sample_rate=RATE, amplitude=0.05))
    (assets / "film.srt").write_text(
        "1\n00:00:01,000 --> 00:00:03,200\nHERO: We should not be here.\n\n"
        "2\n00:00:04,000 --> 00:00:06,000\nGUARD: Then leave.\n\n"
        "3\n00:00:08,000 --> 00:00:11,000\nHERO: Not without her.\n",
        encoding="utf-8",
    )
    write_voice_and_consent(order_dir)

    order = base_order(order_id)
    order["target"].update({
        "kind": "movie", "title": "Test Movie", "adapter": "video",
        "include": ["*.wav"], "script_file": "assets/film.srt",
    })
    order["roles"] = [{"role_id": "HERO", "display_name": "Hero", "voice_id": "main",
                       "match": [], "match_speakers": ["hero"]}]
    (order_dir / "order.json").write_text(json.dumps(order, indent=2), encoding="utf-8")
    return order_dir


def days_from_now(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
