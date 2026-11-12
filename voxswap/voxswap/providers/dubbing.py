"""Shared dubbing-translation logic.

Dubbing translation is not document translation. A dubbed line has to fit a
slot, keep the character's register, survive being read aloud, and leave names
and UI terms alone. Those instructions are the valuable part of this project's
translation step — so they live here once, and every translation provider uses
the identical ones. A prompt improvement then helps Claude and a local GGUF
model equally, and two providers cannot silently drift apart.

What a provider has to supply is one method: `_ask(system, user) -> str`.
Everything else — batching, checkpointing, parsing, the retry, and the
one-line-at-a-time fallback — is here.
"""

from __future__ import annotations

import json
import re

from .base import BaseProvider

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$")

TRANSLATE_SYSTEM = """You translate dialogue for dubbing into the voice of a real actor.

Rules, in priority order:
1. Return ONLY a JSON array of strings, one per input line, in the same order. No prose, no markdown fence, no keys.
2. Preserve meaning and the speaker's register, attitude and level of politeness.
3. Match spoken length. The dub must fit the original line's time slot, so aim within +-10% of the source's syllable count. Prefer a shorter, natural phrasing over a literal, longer one.
4. Keep proper nouns, callsigns, place names, item names and UI terms exactly as given unless the target language has an established form.
5. Write for the mouth, not the page: no abbreviations, no numerals where a word is spoken, no parentheses, no stage directions, no quotation marks around the whole line.
6. Keep profanity and intensity at the same level as the source. Do not soften or escalate.
7. If a line is already in the target language, return it unchanged.
8. Never merge, split, reorder, drop or add lines. len(output) must equal len(input)."""

EMOTION_SYSTEM = """You label dialogue lines with the delivery a voice actor would use.

Return ONLY a JSON array of strings, one per input line, in the same order.
Use exactly one of: neutral, happy, sad, angry, shouting, whisper, fearful, surprised, tired, flirty, sarcastic, pained.
Judge from the words themselves. When nothing suggests otherwise, use neutral."""


def parse_string_array(raw: str, expected: int) -> list[str] | None:
    """Pull a JSON array of `expected` strings out of a model response.

    Returns None rather than raising: the caller retries, then falls back to one
    line at a time. Smaller local models in particular like to wrap their answer
    in a markdown fence or add a sentence of commentary.
    """
    text = _FENCE.sub("", raw).strip()
    if not text.startswith("["):                    # commentary before the array
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end <= start:
            return None
        text = text[start : end + 1]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, list) or len(data) != expected:
        return None
    return [str(x) for x in data]


class DubbingTranslator(BaseProvider):
    """Batching translator. Subclasses implement `_ask` and set `batch_size`."""

    name = "dubbing"
    #: how many lines to send at once. Large models hold 40 happily; small local
    #: ones lose count well before that, which is why this is per-provider.
    batch_size = 40

    def _ask(self, system: str, user: str) -> str:      # pragma: no cover - interface
        raise NotImplementedError

    # -- capability ------------------------------------------------------

    def translate(self, texts: list[str], *, source: str, target: str, context: str = "",
                  length_match: bool = True) -> list[str]:
        if not texts:
            return []
        out: list[str] = []
        for start in range(0, len(texts), self.batch_size):
            out.extend(self._translate_batch(texts[start : start + self.batch_size],
                                             source, target, context, length_match))
        return out

    def _header(self, source: str, target: str, context: str, length_match: bool) -> list[str]:
        header = [f"Source language: {source or 'auto-detect'}", f"Target language: {target}"]
        if context:
            header.append(f"Production context: {context}")
        if not length_match:
            header.append("Length matching is not required for this batch; prioritise accuracy.")
        return header

    def _translate_batch(self, batch: list[str], source: str, target: str, context: str,
                         length_match: bool) -> list[str]:
        header = self._header(source, target, context, length_match)
        prompt = "\n".join(header) + "\n\nLines:\n" + json.dumps(batch, ensure_ascii=False, indent=1)

        result = parse_string_array(self._ask(TRANSLATE_SYSTEM, prompt), len(batch))
        if result is None:                              # one stricter retry
            result = parse_string_array(
                self._ask(TRANSLATE_SYSTEM,
                          prompt + f"\n\nReturn exactly {len(batch)} strings in a JSON array. Nothing else."),
                len(batch),
            )
        if result is None:                              # last resort: one call per line
            result = []
            for text in batch:
                single = parse_string_array(
                    self._ask(TRANSLATE_SYSTEM,
                              "\n".join(header) + "\n\nLines:\n" + json.dumps([text], ensure_ascii=False)),
                    1,
                )
                # Keeping the source text beats dropping the line: the operator
                # sees it untranslated in script.csv and can fix that one line.
                result.append(single[0] if single else text)
        return result

    def annotate_emotions(self, texts: list[str]) -> list[str]:
        """Per-line delivery labels for the voice provider.

        Optional: the `plan` stage only calls this if the provider has it, and
        never fails a job over a style hint.
        """
        if not texts:
            return []
        out: list[str] = []
        for start in range(0, len(texts), self.batch_size):
            batch = texts[start : start + self.batch_size]
            labels = parse_string_array(
                self._ask(EMOTION_SYSTEM, json.dumps(batch, ensure_ascii=False, indent=1)),
                len(batch),
            )
            out.extend(labels or ["neutral"] * len(batch))
        return out
