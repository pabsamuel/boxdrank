import type { DecideInput, EngineDecision, EntitlementSnapshot } from './types';
import { evidenceDedupeKey } from './types';
import { canTransition } from './state-machine';

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

/**
 * Core decision function. Pure and deterministic: given the current snapshot,
 * one piece of evidence, and the effective grace policy, produce the action
 * the driver should apply. Handles duplicates, out-of-order delivery, provider
 * downgrades, expiry and grace.
 */
export function decideEntitlement(input: DecideInput): EngineDecision {
  const { now, current, evidence, graceHours } = input;

  if (input.seenEvidenceKeys?.has(evidenceDedupeKey(evidence))) {
    return { action: 'ignore', reason: 'duplicate' };
  }

  // Out-of-order protection: never let older evidence override newer knowledge.
  if (current?.lastVerifiedAt && evidence.observedAt < current.lastVerifiedAt) {
    return { action: 'ignore', reason: 'stale_evidence' };
  }

  if (!current) {
    if (!evidence.active) return { action: 'ignore', reason: 'no_change' };
    return {
      action: 'create',
      status: 'active',
      tier: evidence.tier,
      expiresAt: evidence.expiresAt,
      reason: `granted by ${evidence.kind} evidence ${evidence.externalRef}`,
    };
  }

  // Admin-controlled states are never overridden by automated evidence.
  if (current.status === 'revoked' || current.status === 'disputed') {
    if (evidence.kind !== 'admin_action') return { action: 'ignore', reason: 'terminal_state' };
  }

  if (evidence.active) {
    const tierChanged = evidence.tier !== current.tier;
    if (current.status === 'active') {
      const expiryChanged =
        (evidence.expiresAt?.getTime() ?? null) !== (current.expiresAt?.getTime() ?? null);
      if (!tierChanged && !expiryChanged) {
        // Same facts, newer observation: just move the verification watermark.
        return {
          action: 'extend',
          tier: current.tier,
          expiresAt: current.expiresAt,
          lastVerifiedAt: evidence.observedAt,
          reason: 'reverified',
        };
      }
      return {
        action: 'extend',
        tier: evidence.tier,
        expiresAt: evidence.expiresAt,
        lastVerifiedAt: evidence.observedAt,
        reason: tierChanged ? `tier ${current.tier ?? 'none'} -> ${evidence.tier ?? 'none'}` : 'expiry updated',
      };
    }
    // pending/grace/expired (+ admin restore of revoked/disputed) → active
    if (!canTransition(current.status, 'active')) {
      return { action: 'ignore', reason: 'terminal_state' };
    }
    return {
      action: 'transition',
      to: 'active',
      tier: evidence.tier,
      expiresAt: evidence.expiresAt,
      graceUntil: null,
      lastVerifiedAt: evidence.observedAt,
      reason: `reactivated by ${evidence.kind} evidence ${evidence.externalRef}`,
    };
  }

  // Negative evidence: membership ended / role removed / refund / admin revoke.
  if (evidence.kind === 'admin_action') {
    return {
      action: 'transition',
      to: 'revoked',
      lastVerifiedAt: evidence.observedAt,
      reason: `revoked by admin: ${evidence.externalRef}`,
    };
  }

  if (current.status === 'active' || current.status === 'pending') {
    if (graceHours <= 0) {
      return {
        action: 'transition',
        to: 'expired',
        lastVerifiedAt: evidence.observedAt,
        reason: `ended by ${evidence.kind} evidence (no grace)`,
      };
    }
    return {
      action: 'transition',
      to: 'grace',
      graceUntil: addHours(now, graceHours),
      lastVerifiedAt: evidence.observedAt,
      reason: `ended by ${evidence.kind} evidence; ${graceHours}h grace`,
    };
  }

  if (current.status === 'grace') {
    // Already in grace; negative evidence changes nothing until grace lapses.
    return { action: 'ignore', reason: 'no_change' };
  }

  return { action: 'ignore', reason: 'no_change' };
}

/**
 * Time-based sweep for the reconciliation worker: expiry and grace lapses that
 * happen without any provider event (outage tolerance, spec §10.10).
 */
export function sweepEntitlement(
  now: Date,
  current: EntitlementSnapshot,
  graceHours: number,
): EngineDecision {
  if (current.status === 'active' && current.expiresAt && current.expiresAt <= now) {
    if (graceHours <= 0) {
      return { action: 'transition', to: 'expired', reason: 'expiry lapsed (no grace)' };
    }
    return {
      action: 'transition',
      to: 'grace',
      graceUntil: addHours(current.expiresAt, graceHours),
      reason: `expiry lapsed; ${graceHours}h grace`,
    };
  }
  if (current.status === 'grace' && current.graceUntil && current.graceUntil <= now) {
    return { action: 'transition', to: 'expired', reason: 'grace lapsed' };
  }
  return { action: 'ignore', reason: 'no_change' };
}
