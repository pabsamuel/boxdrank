/**
 * Entitlement engine — the defensible core (master spec §10).
 *
 * A pure, deterministic library: normalized provider evidence goes in,
 * decisions come out. No HTTP, no queues, no database imports. The API and
 * worker apply decisions transactionally and record evidence rows.
 *
 * Guarantees encoded here and proven by tests:
 *  - valid state machine transitions only (pending/active/grace/expired/revoked/disputed)
 *  - out-of-order evidence is ignored (observedAt watermark)
 *  - duplicate evidence is a no-op (dedupeKey)
 *  - provider silence never instantly punishes users (expiry → grace → expired)
 *  - revocation is explicit, auditable, and never deletes history
 */
export * from './types';
export * from './state-machine';
export * from './engine';
export * from './rules';
