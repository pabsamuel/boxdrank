"""VoxSwap error types.

Every failure the operator can actually fix raises one of these with a message
that names the file and the fix. Stack traces are for bugs, not for operators.
"""

from __future__ import annotations


class VoxSwapError(Exception):
    """Base class. Carries an operator-facing hint."""

    def __init__(self, message: str, hint: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint

    def render(self) -> str:
        if self.hint:
            return f"{self.message}\n  -> {self.hint}"
        return self.message


class OrderError(VoxSwapError):
    """order.json is missing, malformed, or internally inconsistent."""


class ConsentError(VoxSwapError):
    """A voice is not backed by valid, verifiable consent. Hard stop."""


class AssetError(VoxSwapError):
    """Customer-supplied audio/script assets are missing or unusable."""


class ProviderError(VoxSwapError):
    """An ASR / translation / voice provider failed or is misconfigured."""


class StageError(VoxSwapError):
    """A pipeline stage could not complete."""


class QualityGateError(VoxSwapError):
    """Output was produced but does not meet the quality bar for delivery."""
