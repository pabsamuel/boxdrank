# 0001 — Cloudflare Workers + Durable Objects for the relay

**Status:** accepted

## Context

Phones and the TV need a low-latency message path. Options: WebRTC data channels between phone and
TV (needs signalling anyway, painful on smart-TV browsers), a Node WebSocket server on a VPS/Fly,
PartyKit, or Cloudflare Durable Objects.

## Decision

One Worker serves the static site and `/api`; one Durable Object per room relays WebSocket frames
using the hibernation API. Room state lives in socket attachments, so an idle room costs nothing.

## Consequences

- One deploy command, one bill, edge latency (~30–80 ms in Türkiye/Europe).
- Rooms are SQLite-backed Durable Objects (`new_sqlite_classes`), so the Workers Free plan
  serves them; the $5 Paid plan is a later step when free-plan limits bind.
- No WebRTC: fine for 30 Hz pose updates; revisit only if playtests show >150 ms tilt-to-move.
- Local development runs the real runtime (workerd) via `wrangler dev`, so e2e tests are honest.
