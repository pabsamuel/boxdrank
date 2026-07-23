# Kick integration

Status: **research_required** — flag-off placeholder; no scraping, no undocumented endpoints (spec §4.1).

Kick launched an official public API with OAuth (2025); whether it exposes subscription verification with stable scopes is unconfirmed as of build time. Before enabling: verify official docs for (a) OAuth scopes, (b) a subscription/membership read endpoint, (c) webhook support, (d) ToS permitting this use. Until confirmed, the adapter declares `research_required` and throws `not_configured`. Fallback: access codes.
