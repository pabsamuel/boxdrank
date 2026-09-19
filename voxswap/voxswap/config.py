"""Runtime configuration.

Order-level choices live in `order.json`. Machine-level secrets and paths live
in the environment (or a `.env` file next to this project). Nothing secret is
ever written into an order folder or a delivery ZIP.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path | None = None) -> None:
    """Minimal .env loader. Real env vars always win over the file."""
    path = path or PROJECT_ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


@dataclass
class Config:
    orders_dir: Path
    work_dir: Path
    delivery_dir: Path
    archive_dir: Path
    watch_interval_s: int
    ffmpeg: str
    ffprobe: str
    log_level: str

    @staticmethod
    def from_env() -> "Config":
        load_dotenv()
        base = Path(os.environ.get("VOXSWAP_HOME", str(PROJECT_ROOT))).resolve()
        return Config(
            orders_dir=Path(os.environ.get("VOXSWAP_ORDERS_DIR", str(base / "orders"))).resolve(),
            work_dir=Path(os.environ.get("VOXSWAP_WORK_DIR", str(base / "work"))).resolve(),
            delivery_dir=Path(os.environ.get("VOXSWAP_DELIVERY_DIR", str(base / "delivery"))).resolve(),
            archive_dir=Path(os.environ.get("VOXSWAP_ARCHIVE_DIR", str(base / "archive"))).resolve(),
            watch_interval_s=int(os.environ.get("VOXSWAP_WATCH_INTERVAL", "10")),
            ffmpeg=os.environ.get("VOXSWAP_FFMPEG", "ffmpeg"),
            ffprobe=os.environ.get("VOXSWAP_FFPROBE", "ffprobe"),
            log_level=os.environ.get("VOXSWAP_LOG_LEVEL", "info"),
        )

    def ensure_dirs(self) -> None:
        for d in (self.orders_dir, self.work_dir, self.delivery_dir, self.archive_dir):
            d.mkdir(parents=True, exist_ok=True)


def secret(name: str, *, required: bool = False, provider: str = "") -> str:
    """Read an API key from the environment."""
    load_dotenv()
    value = os.environ.get(name, "")
    if required and not value:
        from .errors import ProviderError

        raise ProviderError(
            f"{name} is not set, so the {provider or name} provider cannot run",
            f"Add {name}=... to voxswap/.env (copy .env.example), or switch that provider to \"mock\" in order.json.",
        )
    return value
