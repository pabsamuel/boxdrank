# ADR-0002 — Merge of the two master specifications

Status: **Accepted** · Date: 2026-07-23

## Context

The owner supplied two overlapping master prompts: "Global Emotes" (expansive product spec, explicitly designated master) and "EmoteHub" (leaner execution directive with governance discipline, uploaded mid-session). Both describe portable creator emote packs + keyboard delivery.

## Decision

1. **Product scope & domain model** follow Global Emotes (Spec A): provider entitlement portability is the core differentiator, full domain model (§8), provider SDK (§9), entitlement engine (§10).
2. **Operating discipline** follows EmoteHub (Spec B): root `STATUS.md`/`DECISIONS.md`/`ASSUMPTIONS.md`/`RISKS.md`/`OWNER_ACTIONS.md`/`CLAUDE.md`, phase gates with verified commands, honest platform-reality copy, pre-mortem risk register, credit-efficient execution, brand name isolated in config.
3. **Monetization order** follows Spec B (creator SaaS first; Fan Plus flagged) — see IMPROVEMENT_PROPOSALS IP-01.
4. **Backend** follows Spec A (Fastify+Drizzle+Postgres) over Spec B's Supabase — see IP-09. Spec B's storage-portability requirement (R2-ready) is honored via the S3 abstraction.
5. **Mobile** merges both: native extensions (both specs) + native thin shells (deviation from B's React Native suggestion, IP-10).
6. **Phase plan** merges A §32 and B §14 into the 9-phase plan in `docs/product/ROADMAP.md`; per owner instruction, phases execute continuously rather than stopping at B's Phase-0 gate.

## Consequences

One coherent product ("Global Emotes", provisional name in config). Any future spec conflict resolves in this order: owner instruction > Spec A product intent > Spec B discipline > this ADR chain.
