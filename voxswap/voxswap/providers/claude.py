"""Claude translation + dubbing-director adapter.

Dubbing translation is not the same job as document translation. A dubbed line
has to:

  * fit a slot (roughly the same spoken length as the original),
  * keep the character's register — a mercenary does not suddenly speak like a
    civil servant,
  * survive being read aloud (no abbreviations, no "(sic)", no footnotes),
  * keep names, callsigns and UI terms identical so the player is not confused.

That is an instruction-following task, so it runs through Claude rather than a
phrase-based MT engine. The same adapter can also label emotion per line, which
the synthesis stage feeds to the voice provider as a style hint.

Uses the official `anthropic` SDK, imported lazily so the rest of VoxSwap keeps
running on a machine with no packages installed at all.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from ..errors import ProviderError
from .base import BaseProvider

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")
_BATCH = 40

_TRANSLATE_SYSTEM = """You translate dialogue for dubbing into the voice of a real actor.

Rules, in priority order:
1. Return ONLY a JSON array of strings, one per input line, in the same order. No prose, no markdown fence, no keys.
2. Preserve meaning and the speaker's register, attitude and level of politeness.
3. Match spoken length. The dub must fit the original line's time slot, so aim within +-10% of the source's syllable count. Prefer a shorter, natural phrasing over a literal, longer one.
4. Keep proper nouns, callsigns, place names, item names and UI terms exactly as given unless the target language has an established form.
5. Write for the mouth, not the page: no abbreviations, no numerals where a word is spoken, no parentheses, no stage directions, no quotation marks around the whole line.
6. Keep profanity and intensity at the same level as the source. Do not soften or escalate.
7. If a line is already in the target language, return it unchanged.
8. Never merge, split, reorder, drop or add lines. len(output) must equal len(input)."""

_EMOTION_SYSTEM = """You label dialogue lines with the delivery a voice actor would use.

Return ONLY a JSON array of strings, one per input line, in the same order.
Use exactly one of: neutral, happy, sad, angry, shouting, whisper, fearful, surprised, tired, flirty, sarcastic, pained.
Judge from the words themselves. When nothing suggests otherwise, use neutral."""


class ClaudeTranslation(BaseProvider):
    name = "claude"

    def __init__(self, model: str = "", effort: str = "", max_tokens: int = 16000) -> None:
        # Opus is the default: a mistranslated line is re-recorded by hand, which
        # costs far more than the tokens saved by a smaller model.
        self.model = model or os.environ.get("VOXSWAP_CLAUDE_MODEL", "claude-opus-5")
        self.effort = effort or os.environ.get("VOXSWAP_CLAUDE_EFFORT", "medium")
        self.max_tokens = max_tokens
        self._client_obj: Any = None

    # -- plumbing --------------------------------------------------------

    def _client(self) -> Any:
        if self._client_obj is not None:
            return self._client_obj
        try:
            import anthropic
        except ImportError as exc:
            raise ProviderError(
                "the anthropic package is not installed, so the claude provider cannot run",
                'Run: pip install anthropic   (or set "translation": "mock" in order.json)',
            ) from exc
        try:
            self._client_obj = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY or an `ant auth login` profile
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

    @staticmethod
    def _parse_array(raw: str, expected: int) -> list[str] | None:
        text = _FENCE.sub("", raw).strip()
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, list) or len(data) != expected:
            return None
        return [str(x) for x in data]

    # -- capability ------------------------------------------------------

    def translate(self, texts: list[str], *, source: str, target: str, context: str = "",
                  length_match: bool = True) -> list[str]:
        if not texts:
            return []
        out: list[str] = []
        for start in range(0, len(texts), _BATCH):
            batch = texts[start : start + _BATCH]
            out.extend(self._translate_batch(batch, source, target, context, length_match))
        return out

    def _translate_batch(self, batch: list[str], source: str, target: str, context: str,
                         length_match: bool) -> list[str]:
        header = [
            f"Source language: {source or 'auto-detect'}",
            f"Target language: {target}",
        ]
        if context:
            header.append(f"Production context: {context}")
        if not length_match:
            header.append("Length matching is not required for this batch; prioritise accuracy.")
        prompt = "\n".join(header) + "\n\nLines:\n" + json.dumps(batch, ensure_ascii=False, indent=1)

        result = self._parse_array(self._ask(_TRANSLATE_SYSTEM, prompt), len(batch))
        if result is None:                               # one strict retry
            result = self._parse_array(
                self._ask(_TRANSLATE_SYSTEM, prompt + f"\n\nReturn exactly {len(batch)} strings in a JSON array. Nothing else."),
                len(batch),
            )
        if result is None:                               # last resort: one call per line, slow but correct
            result = []
            for text in batch:
                single = self._parse_array(
                    self._ask(_TRANSLATE_SYSTEM, "\n".join(header) + "\n\nLines:\n" + json.dumps([text], ensure_ascii=False)),
                    1,
                )
                result.append(single[0] if single else text)
        return result

    def annotate_emotions(self, texts: list[str]) -> list[str]:
        """Optional extra: per-line delivery labels for the voice provider.

        The plan stage calls this only if the adapter has it, so providers
        without the capability are simply skipped.
        """
        if not texts:
            return []
        out: list[str] = []
        for start in range(0, len(texts), _BATCH):
            batch = texts[start : start + _BATCH]
            labels = self._parse_array(
                self._ask(_EMOTION_SYSTEM, json.dumps(batch, ensure_ascii=False, indent=1)),
                len(batch),
            )
            out.extend(labels or ["neutral"] * len(batch))
        return out
