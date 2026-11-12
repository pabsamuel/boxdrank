"""Order and work-unit data model.

Everything the pipeline needs about one customer job lives in `order.json`.
This module parses it into typed objects with operator-readable error messages,
and defines the `Line` work unit that flows through every stage.

Stdlib only, on purpose: an operator must be able to run this on a fresh
machine with nothing but Python installed.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .errors import OrderError

# --------------------------------------------------------------------------
# parsing helpers
# --------------------------------------------------------------------------


def _get(d: dict[str, Any], key: str, where: str, *, default: Any = ..., kind: type | tuple[type, ...] | None = None) -> Any:
    if key not in d or d[key] is None:
        if default is ...:
            raise OrderError(
                f"{where}.{key} is missing",
                f"Add \"{key}\" to {where} in order.json. See docs/03-ORDER-FORMAT.md.",
            )
        return default
    value = d[key]
    if kind is not None and not isinstance(value, kind):
        names = kind.__name__ if isinstance(kind, type) else "/".join(k.__name__ for k in kind)
        raise OrderError(
            f"{where}.{key} must be {names}, got {type(value).__name__}",
            "Fix the type in order.json.",
        )
    return value


def _enum(d: dict[str, Any], key: str, where: str, allowed: tuple[str, ...], *, default: str | None = None) -> str:
    raw = _get(d, key, where, default=default if default is not None else ..., kind=str)
    if raw not in allowed:
        raise OrderError(
            f"{where}.{key} = {raw!r} is not supported",
            f"Use one of: {', '.join(allowed)}.",
        )
    return raw


# --------------------------------------------------------------------------
# order pieces
# --------------------------------------------------------------------------

DELIVERY_LAYOUTS = ("mirror", "flat", "mod")
TARGET_KINDS = ("game", "movie")
TARGET_ADAPTERS = ("generic", "unreal", "unity", "wwise", "video")


@dataclass
class Customer:
    name: str
    email: str
    contact_locale: str = "en"
    notes: str = ""

    @staticmethod
    def parse(d: dict[str, Any]) -> "Customer":
        return Customer(
            name=_get(d, "name", "customer", kind=str),
            email=_get(d, "email", "customer", kind=str),
            contact_locale=_get(d, "contact_locale", "customer", default="en", kind=str),
            notes=_get(d, "notes", "customer", default="", kind=str),
        )


@dataclass
class Target:
    """What we are re-voicing: a game install, or a movie + subtitle track."""

    kind: str
    title: str
    adapter: str
    asset_root: str
    include: list[str]
    exclude: list[str] = field(default_factory=list)
    script_file: str = ""          # optional subtitle/CSV/JSON line list
    delivery_layout: str = "mirror"
    output_format: str = "source"  # "source" keeps the input container/codec

    @staticmethod
    def parse(d: dict[str, Any]) -> "Target":
        kind = _enum(d, "kind", "target", TARGET_KINDS)
        return Target(
            kind=kind,
            title=_get(d, "title", "target", kind=str),
            adapter=_enum(d, "adapter", "target", TARGET_ADAPTERS, default="video" if kind == "movie" else "generic"),
            asset_root=_get(d, "asset_root", "target", kind=str),
            include=list(_get(d, "include", "target", default=["**/*.wav"], kind=list)),
            exclude=list(_get(d, "exclude", "target", default=[], kind=list)),
            script_file=_get(d, "script_file", "target", default="", kind=str),
            delivery_layout=_enum(d, "delivery_layout", "target", DELIVERY_LAYOUTS, default="mirror"),
            output_format=_get(d, "output_format", "target", default="source", kind=str),
        )


@dataclass
class LanguagePair:
    source: str = "en"
    target: str = "en"

    @property
    def needs_translation(self) -> bool:
        return self.source.split("-")[0].lower() != self.target.split("-")[0].lower()

    @staticmethod
    def parse(d: dict[str, Any]) -> "LanguagePair":
        return LanguagePair(
            source=_get(d, "source", "language", default="en", kind=str),
            target=_get(d, "target", "language", default="en", kind=str),
        )


@dataclass
class Consent:
    """Proof that the owner of a voice agreed to it being cloned.

    `phrase_audio` is the anti-abuse control: the person records themselves
    saying a phrase that contains their name, the date, and this order ID.
    No phrase file, no clone. See docs/04-CONSENT-AND-RIGHTS.md.
    """

    consent_ref: str
    person_name: str
    person_email: str
    is_self: bool
    signed_at: str
    signature_file: str
    phrase_audio: str
    scope: list[str] = field(default_factory=lambda: ["voice_clone", "personal_use"])
    expires_at: str = ""
    revoked: bool = False
    revoked_reason: str = ""

    @staticmethod
    def parse(d: dict[str, Any], where: str = "consent") -> "Consent":
        return Consent(
            consent_ref=_get(d, "consent_ref", where, kind=str),
            person_name=_get(d, "person_name", where, kind=str),
            person_email=_get(d, "person_email", where, kind=str),
            is_self=bool(_get(d, "is_self", where, kind=bool)),
            signed_at=_get(d, "signed_at", where, kind=str),
            signature_file=_get(d, "signature_file", where, kind=str),
            phrase_audio=_get(d, "phrase_audio", where, kind=str),
            scope=list(_get(d, "scope", where, default=["voice_clone", "personal_use"], kind=list)),
            expires_at=_get(d, "expires_at", where, default="", kind=str),
            revoked=bool(_get(d, "revoked", where, default=False, kind=bool)),
            revoked_reason=_get(d, "revoked_reason", where, default="", kind=str),
        )


@dataclass
class VoiceProfile:
    """One human voice the customer supplied, plus where its samples live."""

    voice_id: str
    person_label: str
    samples_dir: str
    consent_ref: str
    provider_voice_id: str = ""   # filled in by the `voice` stage after cloning
    gender_hint: str = ""
    accent_hint: str = ""

    @staticmethod
    def parse(d: dict[str, Any]) -> "VoiceProfile":
        return VoiceProfile(
            voice_id=_get(d, "voice_id", "voices[]", kind=str),
            person_label=_get(d, "person_label", "voices[]", kind=str),
            samples_dir=_get(d, "samples_dir", "voices[]", kind=str),
            consent_ref=_get(d, "consent_ref", "voices[]", kind=str),
            provider_voice_id=_get(d, "provider_voice_id", "voices[]", default="", kind=str),
            gender_hint=_get(d, "gender_hint", "voices[]", default="", kind=str),
            accent_hint=_get(d, "accent_hint", "voices[]", default="", kind=str),
        )


@dataclass
class RoleBinding:
    """'Replace this character with this voice.'

    `match` holds glob/regex patterns tested against the asset path and, when a
    script file exists, against the speaker column. First role whose pattern
    matches a clip wins, so order matters.
    """

    role_id: str
    display_name: str
    voice_id: str
    match: list[str]
    match_speakers: list[str] = field(default_factory=list)
    style: str = "neutral"

    @staticmethod
    def parse(d: dict[str, Any]) -> "RoleBinding":
        return RoleBinding(
            role_id=_get(d, "role_id", "roles[]", kind=str),
            display_name=_get(d, "display_name", "roles[]", default=_get(d, "role_id", "roles[]", kind=str), kind=str),
            voice_id=_get(d, "voice_id", "roles[]", kind=str),
            match=list(_get(d, "match", "roles[]", default=[], kind=list)),
            match_speakers=list(_get(d, "match_speakers", "roles[]", default=[], kind=list)),
            style=_get(d, "style", "roles[]", default="neutral", kind=str),
        )


@dataclass
class Options:
    """Knobs that change how output sounds. Defaults are the safe choices."""

    preserve_timing: bool = True
    max_stretch: float = 1.15          # how far we may time-compress/expand a line
    target_lufs: float = -18.0         # game dialogue convention; movies use -23/-24
    emotion_transfer: bool = True
    keep_original_on_fail: bool = True  # unmatched/failed lines fall back to the original clip
    max_parallel: int = 4
    qc_max_duration_delta_ms: int = 250
    qc_min_pass_rate: float = 0.97
    dry_run_limit: int = 0             # >0 = only process N lines (cheap test run)

    @staticmethod
    def parse(d: dict[str, Any]) -> "Options":
        o = Options()
        for key in (
            "preserve_timing", "max_stretch", "target_lufs", "emotion_transfer",
            "keep_original_on_fail", "max_parallel", "qc_max_duration_delta_ms",
            "qc_min_pass_rate", "dry_run_limit",
        ):
            if key in d and d[key] is not None:
                setattr(o, key, d[key])
        if o.max_stretch < 1.0:
            raise OrderError("options.max_stretch must be >= 1.0", "1.0 means 'never stretch'. 1.15 is a good default.")
        if not 0.0 < o.qc_min_pass_rate <= 1.0:
            raise OrderError("options.qc_min_pass_rate must be between 0 and 1", "0.97 means 97% of lines must pass QC.")
        return o


@dataclass
class ProviderChoice:
    asr: str = "mock"
    translation: str = "mock"
    voice: str = "mock"

    @staticmethod
    def parse(d: dict[str, Any]) -> "ProviderChoice":
        return ProviderChoice(
            asr=_get(d, "asr", "providers", default="mock", kind=str),
            translation=_get(d, "translation", "providers", default="mock", kind=str),
            voice=_get(d, "voice", "providers", default="mock", kind=str),
        )


# --------------------------------------------------------------------------
# the order
# --------------------------------------------------------------------------


@dataclass
class Order:
    order_id: str
    created_at: str
    customer: Customer
    target: Target
    language: LanguagePair
    voices: list[VoiceProfile]
    roles: list[RoleBinding]
    consents: list[Consent]
    options: Options
    providers: ProviderChoice
    root: Path = field(default=Path("."), repr=False)

    # -- lookups ---------------------------------------------------------

    def voice(self, voice_id: str) -> VoiceProfile:
        for v in self.voices:
            if v.voice_id == voice_id:
                return v
        raise OrderError(
            f"roles reference voice_id {voice_id!r} which is not in voices[]",
            f"Add a voices[] entry with voice_id {voice_id!r}, or fix the role.",
        )

    def consent(self, consent_ref: str) -> Consent:
        for c in self.consents:
            if c.consent_ref == consent_ref:
                return c
        raise OrderError(
            f"consent_ref {consent_ref!r} is not in consents[]",
            "Every voice needs a consent record. See docs/04-CONSENT-AND-RIGHTS.md.",
        )

    def resolve(self, rel: str) -> Path:
        """Resolve a path from order.json against the order directory."""
        return (self.root / rel).resolve()

    # -- io --------------------------------------------------------------

    @staticmethod
    def parse(d: dict[str, Any], root: Path) -> "Order":
        order = Order(
            order_id=_get(d, "order_id", "order", kind=str),
            created_at=_get(d, "created_at", "order", default="", kind=str),
            customer=Customer.parse(_get(d, "customer", "order", kind=dict)),
            target=Target.parse(_get(d, "target", "order", kind=dict)),
            language=LanguagePair.parse(_get(d, "language", "order", default={}, kind=dict)),
            voices=[VoiceProfile.parse(x) for x in _get(d, "voices", "order", kind=list)],
            roles=[RoleBinding.parse(x) for x in _get(d, "roles", "order", kind=list)],
            consents=[Consent.parse(x) for x in _get(d, "consents", "order", kind=list)],
            options=Options.parse(_get(d, "options", "order", default={}, kind=dict)),
            providers=ProviderChoice.parse(_get(d, "providers", "order", default={}, kind=dict)),
            root=root,
        )
        if not order.voices:
            raise OrderError("order.voices[] is empty", "At least one voice is needed to replace anything.")
        if not order.roles:
            raise OrderError("order.roles[] is empty", "Bind at least one character to a voice.")
        seen: set[str] = set()
        for v in order.voices:
            if v.voice_id in seen:
                raise OrderError(f"duplicate voice_id {v.voice_id!r}", "voice_id must be unique within an order.")
            seen.add(v.voice_id)
        for r in order.roles:                 # fails fast on dangling references
            order.voice(r.voice_id)
            order.consent(order.voice(r.voice_id).consent_ref)
        return order

    @staticmethod
    def load(order_dir: Path) -> "Order":
        path = order_dir / "order.json"
        if not path.exists():
            raise OrderError(
                f"no order.json in {order_dir}",
                "Copy templates/order.template.json into the order folder and fill it in.",
            )
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise OrderError(
                f"{path} is not valid JSON: {exc}",
                "Usually a trailing comma or a missing quote. Paste it into a JSON validator.",
            ) from exc
        return Order.parse(data, root=order_dir)


# --------------------------------------------------------------------------
# work units
# --------------------------------------------------------------------------


@dataclass
class Line:
    """One replaceable utterance.

    A line starts life as 'there is a clip at this path'. Stages progressively
    fill in text, translation, and the rendered replacement file.
    """

    line_id: str
    source_rel: str          # path relative to target.asset_root
    role_id: str
    index: int = 0
    start_ms: int = 0
    end_ms: int = 0
    speaker_label: str = ""
    text: str = ""
    translated_text: str = ""
    emotion: str = "neutral"
    source_duration_ms: int = 0
    rendered_rel: str = ""    # path relative to the workspace, set by `synthesize`
    mastered_rel: str = ""    # set by `master`
    final_duration_ms: int = 0
    status: str = "pending"   # pending | done | skipped | failed | fallback
    note: str = ""

    @property
    def speak_text(self) -> str:
        return self.translated_text or self.text

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "Line":
        known = {f for f in Line.__dataclass_fields__}  # type: ignore[attr-defined]
        return Line(**{k: v for k, v in d.items() if k in known})


def load_lines(path: Path) -> list[Line]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [Line.from_dict(x) for x in data.get("lines", [])]


def save_lines(path: Path, lines: list[Line]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"count": len(lines), "lines": [l.to_dict() for l in lines]}
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
