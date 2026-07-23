# YouTube integration

Status: **approval_required + creator_authorized_only** — flag-off placeholder adapter; do not enable without Google approval.

Reality (spec §6.2 honesty rule): the Channel Memberships API (`members.list`, scope `youtube.channel-memberships.creator`) is allowlist-gated and **creator-authorized** — fan OAuth alone cannot enumerate the fan's memberships. Design when approved: creator connects → periodic `members.list` sync → creator-side member matching against connected fans' channel ids; no fan self-serve path exists.

Owner action: apply for API access (OWNER_ACTIONS). Fallback: access codes (creators distribute via members-only posts).
