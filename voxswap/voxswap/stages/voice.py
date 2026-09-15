"""Stage 6 — voice.

Build (or reuse) one clone per voice the order binds to a role, and record the
provider-side ID on the order so later runs and the purge command can find it.

Consent is re-checked here even though intake already checked it. Intake may
have run days ago; a clone is created *now*.
"""

from __future__ import annotations

import json

from ..consent import check_voice, list_samples
from ..errors import ProviderError
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

            if voice.provider_voice_id and not ctx.force:
                ctx.log.stage(self.name, f"{voice_id}: reusing existing clone")
                built[voice_id] = voice.provider_voice_id
                continue

            samples = [ctx.ensure_wav(p, f"sample-{voice_id}-{i}") for i, p in enumerate(list_samples(ctx.order, voice))]
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

        _persist_provider_ids(ctx, built)
        return StageResult(
            summary=f"{len(built)} voice(s) ready via {ctx.order.providers.voice}",
            metrics={"voices": built, "provider": ctx.order.providers.voice},
        )


def _persist_provider_ids(ctx: JobContext, built: dict[str, str]) -> None:
    """Write provider voice IDs back into order.json.

    This is the only thing VoxSwap ever writes into an order folder, and it is
    deliberate: without it, a withdrawal request could not find the clone to
    destroy, and every re-run would create a duplicate clone.
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
