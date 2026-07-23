import type { EntitlementStatus } from '@global-emotes/contracts';

/**
 * Allowed transitions. Terminal-ish states: 'revoked' can only be restored by
 * an admin (→ active/disputed); nothing transitions out of a deleted record
 * because records are never deleted.
 */
const TRANSITIONS: Record<EntitlementStatus, ReadonlySet<EntitlementStatus>> = {
  pending: new Set(['active', 'revoked', 'expired', 'disputed']),
  active: new Set(['grace', 'expired', 'revoked', 'disputed']),
  grace: new Set(['active', 'expired', 'revoked', 'disputed']),
  expired: new Set(['active', 'disputed']),
  revoked: new Set(['active', 'disputed']),
  disputed: new Set(['active', 'grace', 'expired', 'revoked']),
};

export function canTransition(from: EntitlementStatus, to: EntitlementStatus): boolean {
  return from === to || (TRANSITIONS[from]?.has(to) ?? false);
}

export function assertTransition(from: EntitlementStatus, to: EntitlementStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: EntitlementStatus,
    public readonly to: EntitlementStatus,
  ) {
    super(`Invalid entitlement transition ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Statuses that unlock content. */
export const LIVE_STATUSES: ReadonlySet<EntitlementStatus> = new Set(['active', 'grace']);
