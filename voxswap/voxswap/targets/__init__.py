"""Target adapters, selected by `target.adapter` in order.json."""

from __future__ import annotations

from ..errors import OrderError
from .base import AssetRef, TargetAdapter, iter_assets  # noqa: F401
from .game import GenericGame, UnityGame, UnrealGame, WwiseGame
from .video import VideoTarget

_ADAPTERS = {
    "generic": GenericGame,
    "unreal": UnrealGame,
    "unity": UnityGame,
    "wwise": WwiseGame,
    "video": VideoTarget,
}


def get_target(name: str) -> TargetAdapter:
    adapter = _ADAPTERS.get(name)
    if adapter is None:
        raise OrderError(
            f"unknown target adapter {name!r}",
            f"Available: {', '.join(sorted(_ADAPTERS))}. Set target.adapter in order.json.",
        )
    return adapter()


__all__ = ["get_target", "TargetAdapter", "AssetRef", "iter_assets"]
