"""Stage 6 — voice.

Build (or reuse) one clone per voice the order binds to a role, and record the
provider-side ID on the order so later runs and the purge command can find it.

Consent is re-checked here even though intake already checked it. Intake may
have run days ago; a clone is created *now*.

A clone is reused across runs — making one can cost money and a provider slot —
but only while it still matches the samples. When a customer re-records, the
fingerprint on the clone's CLONED record no longer matches, so the clone is
rebuilt and the old one is deleted. Reusing it would ship the whole game in the
voice from the recordings they replaced; keeping it would leave a clone that a
withdrawal request can no longer find.
"""

from __future__ import annotations

import json

from ..consent import (check_voice, file_digest, last_clone, list_samples, record_audit,
                       samples_fingerprint)
from ..errors import ProviderError, VoxSwapError
from ..models import Order
from .base import JobContext, Stage, StageResult


class VoiceStage(Stage):
    name = "voice"
    title = "Build voices"
    description = "Create or reuse the cloned voice for each role"

    def run(self, ctx: JobContext) -> StageResult:
        needed = sorted({role.voice_id for role in ctx.order.roles
                         if any(l.role_id == role.role_id and l.status != "skipped" for l in ctx.lines)})
        if not needed:
            return StageResult(summary="no active roles — no voices to build", skipped=True)

        provider = ctx.provider("voice")
        built: dict[str, str] = {}
        for voice_id in needed:
            voice = ctx.order.voice(voice_id)
            check_voice(ctx.order, voice)                # consent must still hold at clone time

            fingerprint = samples_fingerprint(ctx.order, voice)
            previous = voice.provider_voice_id
            if previous and not ctx.force:
                if not clone_is_stale(ctx.order, voice_id, fingerprint):
                    ctx.log.stage(self.name, f"{voice_id}: reusing existing clone")
                    built[voice_id] = previous
                    continue
                ctx.log.stage(self.name, f"{voice_id}: the samples changed since this clone was made — rebuilding it")

            originals = list_samples(ctx.order, voice)
            # The decode cache is keyed by content too: a re-recorded m4a with
            # the same name must not come back as last week's decoded copy.
            samples = [ctx.ensure_wav(p, f"sample-{voice_id}-{i}-{file_digest(p)[:10]}")
                       for i, p in enumerate(originals)]
            if not samples:
                raise ProviderError(
                    f"no usable samples for voice {voice_id!r}",
                    "Samples must be readable audio; install ffmpeg if they are mp3/m4a.",
                )
            ctx.log.stage(self.name, f"{voice_id}: cloning {voice.person_label} from {len(samples)} sample(s)")
            provider_id = provider.ensure_voice(
                voice_id, voice.person_label, samples, consent_ref=voice.consent_ref,
            )
            voice.provider_voice_id = provider_id
            built[voice_id] = provider_id
            # The creation event. Written immediately, before the run can fail
            # somewhere later: a clone that exists at a provider must never be
            # absent from the trail.
            record_audit(ctx.order.root, "CLONED", voice_id, voice.consent_ref, voice.person_label,
                         f"provider={ctx.order.providers.voice}", f"id={provider_id}",
                         f"samples={fingerprint}")
            # Saved before the old clone is touched, so a crash in between
            # leaves order.json pointing at the clone that matches the samples.
            _persist_provider_ids(ctx, {voice_id: provider_id})
            if previous and previous != provider_id:
                _retire(ctx, provider, voice, previous, provider_id)

        _persist_provider_ids(ctx, built)
        return StageResult(
            summary=f"{len(built)} voice(s) ready via {ctx.order.providers.voice}",
            metrics={"voices": built, "provider": ctx.order.providers.voice},
        )


def clone_is_stale(order: Order, voice_id: str, fingerprint: str) -> bool:
    """True only when the trail proves the clone on file came from other samples.

    No record, or a record without a fingerprint (orders cloned before it was
    kept), is "cannot tell" and keeps the clone: re-cloning on a guess costs
    the operator money, and `--force` is there for a human who knows better.
    """
    voice = order.voice(voice_id)
    record = last_clone(order.root, voice_id)
    made_from = record.get("samples", "") if record.get("id") == voice.provider_voice_id else ""
    return bool(made_from) and bool(fingerprint) and made_from != fingerprint


def voices_with_new_samples(order: Order) -> list[str]:
    """Voices whose clone on file was made from samples that have since changed."""
    used = sorted({role.voice_id for role in order.roles})
    return [vid for vid in used
            if order.voice(vid).provider_voice_id
            and clone_is_stale(order, vid, samples_fingerprint(order, order.voice(vid)))]


def _retire(ctx: JobContext, provider, voice, old_id: str, new_id: str) -> None:
    """Delete the clone a new one replaced, and say so in the trail either way."""
    root, provider_name = ctx.order.root, ctx.order.providers.voice
    try:
        provider.delete_voice(old_id)
    except (VoxSwapError, OSError) as exc:
        # The new clone is good and already on file, so the build goes on —
        # but a clone nobody tracks is exactly what a withdrawal cannot reach,
        # so it goes on the record and in front of the operator.
        record_audit(root, "ORPHANED", voice.voice_id, voice.consent_ref, voice.person_label,
                     f"provider={provider_name}", f"id={old_id}", f"error={exc}")
        ctx.log.warn(f"{voice.voice_id}: could not delete the old clone {old_id} ({exc}). "
                     f"Delete it by hand at {provider_name}; it is recorded as ORPHANED in consent-audit.log.")
        return
    record_audit(root, "REPLACED", voice.voice_id, voice.consent_ref, voice.person_label,
                 f"provider={provider_name}", f"old={old_id}", f"new={new_id}")
    ctx.log.stage("voice", f"{voice.voice_id}: deleted the old clone it replaced")


def _persist_provider_ids(ctx: JobContext, built: dict[str, str]) -> None:
    """Write provider voice IDs back into order.json.

    This and `consent-audit.log` are the only things VoxSwap ever writes into an
    order folder, and both are deliberate: without this ID a withdrawal request
    could not find the clone to destroy, and every re-run would create a
    duplicate clone.
    """
    path = ctx.order.root / "order.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        ctx.log.warn(f"could not update order.json with provider voice IDs: {exc}")
        return
    changed = False
    for entry in data.get("voices", []):
        vid = entry.get("voice_id")
        if vid in built and entry.get("provider_voice_id") != built[vid]:
            entry["provider_voice_id"] = built[vid]
            changed = True
    if changed:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
