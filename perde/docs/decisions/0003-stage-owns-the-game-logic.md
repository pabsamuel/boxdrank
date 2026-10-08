# 0003 — The TV owns the game; the relay is dumb

**Status:** accepted

## Context

Game state (who is cast, which line, karaoke progress) could live in the Durable Object, on the
TV, or on the phones.

## Decision

The TV (`stage-machine.ts`) is the single source of truth. The relay only stamps and forwards.
Phones render the state they are sent and never decide anything.

## Consequences

- All logic is a pure reducer with unit tests; no server code to deploy for a rules change.
- A TV reload loses the running play (phones stay connected and get a fresh lobby). Acceptable
  for a living-room device; M2 adds a "reconnecting" affordance.
- The relay never needs to know about plays, so content updates ship with the static site.
