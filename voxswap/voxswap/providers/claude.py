"""Claude translation adapter.

The dubbing rules, batching and parsing live in `dubbing.py` and are shared with
every other translation provider. All this file supplies is the transport.

Uses the official `anthropic` SDK, imported lazily so the rest of VoxSwap keeps
running on a machine with no packages installed at all.
"""

from __future__ import annotations

import os
from typing import Any

from ..errors import ProviderError
from .dubbing import DubbingTranslator


class ClaudeTranslation(DubbingTranslator):
    name = "claude"
    batch_size = 40

    def __init__(self, model: str = "", effort: str = "", max_tokens: int = 16000) -> None:
        # Opus is the default: a mistranslated line gets re-recorded by hand,
        # which costs far more than the tokens saved by a smaller model.
        self.model = model or os.environ.get("VOXSWAP_CLAUDE_MODEL", "claude-opus-5")
        self.effort = effort or os.environ.get("VOXSWAP_CLAUDE_EFFORT", "medium")
        self.max_tokens = max_tokens
        self._client_obj: Any = None

    def _client(self) -> Any:
        if self._client_obj is not None:
            return self._client_obj
        try:
            import anthropic
        except ImportError as exc:
            raise ProviderError(
                "the anthropic package is not installed, so the claude provider cannot run",
                'Run: pip install anthropic   (or use "translation": "local_llm" to stay offline)',
            ) from exc
        try:
            self._client_obj = anthropic.Anthropic()   # ANTHROPIC_API_KEY or an `ant auth login` profile
        except Exception as exc:                        # noqa: BLE001 - surfaced as an operator hint
            raise ProviderError(
                f"could not create the Anthropic client: {exc}",
                "Set ANTHROPIC_API_KEY in voxswap/.env, or run `ant auth login`.",
            ) from exc
        return self._client_obj

    def _ask(self, system: str, user: str) -> str:
        import anthropic

        client = self._client()
        try:
            response = client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=system,
                output_config={"effort": self.effort},
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.NotFoundError as exc:
            raise ProviderError(
                f"model {self.model!r} is not available to this account",
                "Set VOXSWAP_CLAUDE_MODEL to a model you have access to.",
            ) from exc
        except anthropic.RateLimitError as exc:
            raise ProviderError(
                "Claude rate limit hit while translating",
                "Lower options.max_parallel in order.json, then resume with --from translate.",
            ) from exc
        except anthropic.APIConnectionError as exc:
            raise ProviderError("could not reach the Claude API", "Check network/proxy settings and retry.") from exc
        except anthropic.APIStatusError as exc:
            raise ProviderError(f"Claude API error {exc.status_code}", str(getattr(exc, "message", exc))) from exc

        if response.stop_reason == "refusal":
            detail = getattr(response.stop_details, "explanation", "") or ""
            raise ProviderError(
                "Claude declined to translate this batch",
                f"{detail} Review the source lines; translate that batch manually if it is legitimate.",
            )
        return "".join(block.text for block in response.content if block.type == "text").strip()
