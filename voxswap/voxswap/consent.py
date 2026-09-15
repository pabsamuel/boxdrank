"""The consent gate.

This is the most important file in the project. Everything else is audio
plumbing; this is what separates a voice studio from a deepfake service.

No line is ever synthesised from a voice that does not pass every check below,
and there is no flag to skip it. If a check is wrong for a real order, fix the
order's paperwork — not this file.

What we require, per voice:

  1. A consent record exists and names a real person and contact address.
  2. A signed consent document is on disk (`signature_file`).
  3. A **verification phrase recording** is on disk (`phrase_audio`): the person
     saying their own name, today's date, and the order ID. This is the control
     that makes "I downloaded my ex's voice notes" hard, because the phrase is
     order-specific and cannot be lifted from existing audio.
  4. The consent is not revoked and not expired.
  5. Its scope covers voice cloning.
  6. For a voice that is not the customer's own, an independent contact address
     for that person — so they can withdraw consent without going through the
     customer.

Withdrawal is implemented too: `purge_order` deletes the clone at the provider,
the samples, the takes made from them, and the delivery. A promise you cannot
execute is not a promise.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

from .audio import probe_wav
from .errors import ConsentError
from .ids import utc_now_iso
from .models import Consent, Order, VoiceProfile

MIN_PHRASE_SECONDS = 3.0
MIN_SAMPLE_SECONDS = 30.0        # below this, clones sound like a bad impression
GOOD_SAMPLE_SECONDS = 90.0

PHRASE_TEMPLATE = (
    "My name is {person_name}. Today is {today}. "
    "I give VoxSwap permission to create a synthetic copy of my voice "
    "for order {order_id}. I understand I can withdraw this permission at any time."
)


@dataclass
class ConsentCheck:
    voice_id: str
    consent_ref: str
    person_name: str
    ok: bool
    sample_seconds: float
    warnings: list[str]


def phrase_for(order: Order, consent: Consent) -> str:
    return PHRASE_TEMPLATE.format(
        person_name=consent.person_name,
        today=date.today().isoformat(),
        order_id=order.order_id,
    )


def _parse_date(value: str, field: str) -> datetime:
    raw = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise ConsentError(
            f"{field} is not a valid date: {value!r}",
            "Use ISO format, e.g. 2026-03-01 or 2026-03-01T12:00:00Z.",
        ) from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _audio_seconds(path: Path) -> float:
    try:
        duration_ms, _, _ = probe_wav(path)
        return duration_ms / 1000.0
    except Exception:                                    # noqa: BLE001 - non-WAV or unreadable
        return -1.0


def check_voice(order: Order, voice: VoiceProfile) -> ConsentCheck:
    consent = order.consent(voice.consent_ref)
    warnings: list[str] = []

    # 1-2. paperwork exists
    if not consent.person_name.strip() or not consent.person_email.strip():
        raise ConsentError(
            f"consent {consent.consent_ref} is missing the person's name or email",
            "We must be able to identify and contact the owner of a cloned voice.",
        )
    signature = order.resolve(consent.signature_file)
    if not signature.exists():
        raise ConsentError(
            f"signed consent document missing for {consent.consent_ref}: {consent.signature_file}",
            "Save the signed form (PDF/image) in the order folder and point signature_file at it. "
            "Template: templates/consent-form.md",
        )

    # 3. verification phrase recording
    phrase = order.resolve(consent.phrase_audio)
    if not phrase.exists():
        raise ConsentError(
            f"verification phrase recording missing for {consent.consent_ref}: {consent.phrase_audio}",
            "Ask the person to record this and send it as a WAV:\n     "
            f'"{phrase_for(order, consent)}"',
        )
    phrase_seconds = _audio_seconds(phrase)
    if phrase_seconds < 0:
        warnings.append(f"could not read the phrase recording {phrase.name} to check its length")
    elif phrase_seconds < MIN_PHRASE_SECONDS:
        raise ConsentError(
            f"verification phrase for {consent.consent_ref} is only {phrase_seconds:.1f}s long",
            f"It must be at least {MIN_PHRASE_SECONDS:.0f}s and contain the full phrase. Ask for a new recording.",
        )

    # 4. still valid
    if consent.revoked:
        raise ConsentError(
            f"consent {consent.consent_ref} has been revoked ({consent.revoked_reason or 'no reason given'})",
            f"Run: python3 -m voxswap purge {order.order_id} --voice {voice.voice_id}",
        )
    signed_at = _parse_date(consent.signed_at, f"consent {consent.consent_ref} signed_at")
    if signed_at > datetime.now(timezone.utc):
        raise ConsentError(
            f"consent {consent.consent_ref} is dated in the future ({consent.signed_at})",
            "Fix the date. A future-dated consent is not a consent.",
        )
    if consent.expires_at:
        if _parse_date(consent.expires_at, f"consent {consent.consent_ref} expires_at") < datetime.now(timezone.utc):
            raise ConsentError(
                f"consent {consent.consent_ref} expired on {consent.expires_at}",
                "Ask for a fresh consent before re-running this order.",
            )

    # 5. scope
    if "voice_clone" not in consent.scope:
        raise ConsentError(
            f"consent {consent.consent_ref} does not cover voice cloning (scope: {consent.scope})",
            'The scope list must include "voice_clone".',
        )

    # 6. third-party voices need their own contact route
    if not consent.is_self:
        if consent.person_email.strip().lower() == order.customer.email.strip().lower():
            raise ConsentError(
                f"consent {consent.consent_ref} is for another person but uses the customer's email address",
                "A third party must give an address we can reach them at directly, so they can withdraw "
                "consent without going through the customer.",
            )
        warnings.append(
            f"{consent.person_name} is not the ordering customer — confirm the verification phrase audio "
            "really is them before the first paid run"
        )

    # sample quantity: a warning, not a gate — quality, not permission
    samples = list_samples(order, voice)
    total_seconds = sum(max(0.0, _audio_seconds(p)) for p in samples)
    if not samples:
        raise ConsentError(
            f"no voice samples found for {voice.voice_id!r} in {voice.samples_dir}",
            "Put the person's recordings (WAV) in that folder.",
        )
    if total_seconds < MIN_SAMPLE_SECONDS:
        warnings.append(
            f"only {total_seconds:.0f}s of samples for {voice.person_label} — expect a weak clone; "
            f"ask for at least {GOOD_SAMPLE_SECONDS:.0f}s of varied, clean speech"
        )

    return ConsentCheck(
        voice_id=voice.voice_id,
        consent_ref=consent.consent_ref,
        person_name=consent.person_name,
        ok=True,
        sample_seconds=round(total_seconds, 1),
        warnings=warnings,
    )


def list_samples(order: Order, voice: VoiceProfile) -> list[Path]:
    """Every readable sample for a voice, excluding the consent phrase itself."""
    directory = order.resolve(voice.samples_dir)
    if not directory.exists():
        return []
    consent = order.consent(voice.consent_ref)
    phrase = order.resolve(consent.phrase_audio)
    out = []
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in (".wav", ".flac", ".mp3", ".m4a", ".ogg", ".opus"):
            continue
        if path.resolve() == phrase.resolve():
            continue
        out.append(path)
    return out


def verify_order(order: Order) -> list[ConsentCheck]:
    """Check every voice bound to a role. Raises on the first failure."""
    used = {order.voice(role.voice_id).voice_id for role in order.roles}
    return [check_voice(order, order.voice(voice_id)) for voice_id in sorted(used)]


# --------------------------------------------------------------------------
# withdrawal
# --------------------------------------------------------------------------


def purge_order(
    cfg,
    order: Order,
    *,
    voice_id: str = "",
    consent_ref: str = "",
    samples: bool = False,
    log=None,
) -> dict:
    """Destroy everything made from one or more voices in an order.

    Deletes the clone at the provider, every generated take, the delivery and
    its ZIP, and — only when asked — the person's original recordings. The
    provider-side ID is cleared from order.json afterwards, so the order stays
    re-runnable and no later stage tries to reuse a clone that is gone.

    Returns a summary of what was destroyed. Callers do the confirming; this
    function does the deleting.
    """
    import shutil

    from .providers import get_voice
    from .workspace import Workspace

    voices = [
        v for v in order.voices
        if (not voice_id or v.voice_id == voice_id) and (not consent_ref or v.consent_ref == consent_ref)
    ]
    if not voices:
        raise ConsentError(
            "no voices in this order matched that filter",
            f"Known voices: {', '.join(v.voice_id for v in order.voices)}.",
        )

    provider = get_voice(order.providers.voice)
    deleted_clones: list[str] = []
    for voice in voices:
        if voice.provider_voice_id:
            try:
                provider.delete_voice(voice.provider_voice_id)
                deleted_clones.append(voice.provider_voice_id)
            except Exception as exc:                     # noqa: BLE001 - keep going; local data must still go
                if log:
                    log.warn(f"could not delete {voice.provider_voice_id} at the provider: {exc}")
        if samples:
            shutil.rmtree(order.resolve(voice.samples_dir), ignore_errors=True)

    ws = Workspace.for_order(cfg, order.order_id)
    ws.wipe()
    shutil.rmtree(ws.delivery, ignore_errors=True)
    (cfg.delivery_dir / f"{order.order_id}.zip").unlink(missing_ok=True)

    _clear_provider_ids(order.root, [v.voice_id for v in voices])

    with (order.root / "consent-audit.log").open("a", encoding="utf-8") as fh:
        fh.write(f"{utc_now_iso()}\tPURGED\t{','.join(v.voice_id for v in voices)}\t"
                 f"samples={'yes' if samples else 'no'}\n")

    return {
        "voices": [v.voice_id for v in voices],
        "clones_deleted": deleted_clones,
        "samples_deleted": samples,
        "work_dir": str(ws.root),
        "delivery": str(ws.delivery),
    }


def _clear_provider_ids(order_dir: Path, voice_ids: list[str]) -> None:
    path = order_dir / "order.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for entry in data.get("voices", []):
        if entry.get("voice_id") in voice_ids:
            entry["provider_voice_id"] = ""
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def record_revocation(order_dir: Path, consent_ref: str, reason: str) -> None:
    """Mark a consent revoked in order.json and append to the audit trail."""
    order_file = order_dir / "order.json"
    data = json.loads(order_file.read_text(encoding="utf-8"))
    found = False
    for entry in data.get("consents", []):
        if entry.get("consent_ref") == consent_ref:
            entry["revoked"] = True
            entry["revoked_reason"] = reason
            entry["revoked_at"] = utc_now_iso()
            found = True
    if not found:
        raise ConsentError(f"no consent {consent_ref!r} in {order_file}", "Check the reference and try again.")
    order_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    trail = order_dir / "consent-audit.log"
    with trail.open("a", encoding="utf-8") as fh:
        fh.write(f"{utc_now_iso()}\tREVOKED\t{consent_ref}\t{reason}\n")
