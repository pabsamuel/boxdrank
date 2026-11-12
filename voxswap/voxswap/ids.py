"""Stable ID generation and slugging.

Line IDs must be deterministic: re-running a job has to reuse the same IDs so
partial results stay valid and QC reports stay comparable across runs.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timezone

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slug(text: str, max_len: int = 64) -> str:
    """Lowercase ASCII slug. Used for filenames and voice IDs."""
    norm = unicodedata.normalize("NFKD", text)
    norm = norm.encode("ascii", "ignore").decode("ascii").lower()
    norm = _SLUG_STRIP.sub("-", norm).strip("-")
    return norm[:max_len] or "unnamed"


def short_hash(*parts: str, length: int = 10) -> str:
    """Deterministic short hash over the given parts."""
    h = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()
    return h[:length]


def line_id(source_rel_path: str, index: int, start_ms: int) -> str:
    """Deterministic ID for one spoken line.

    Keyed on (file, index within file, start offset) so re-indexing the same
    assets produces identical IDs even if the scan order changes.
    """
    return f"L-{short_hash(source_rel_path, str(index), str(start_ms))}"


def order_id_for(customer_email: str, title: str, when: datetime | None = None) -> str:
    """Suggested order ID. Operators may override; uniqueness is enforced by the
    orders/ directory name, not by this function."""
    when = when or datetime.now(timezone.utc)
    return f"ORD-{when:%Y%m%d}-{short_hash(customer_email, title, length=6).upper()}"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
