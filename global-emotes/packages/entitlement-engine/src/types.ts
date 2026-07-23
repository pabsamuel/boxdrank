import type { EntitlementRuleKind, EntitlementStatus } from '@global-emotes/contracts';

export interface EngineRule {
  id: string;
  packId: string;
  kind: EntitlementRuleKind;
  providerId: string | null;
  config: Record<string, unknown>;
  graceHoursOverride: number | null;
}

/** Current persisted entitlement state, as loaded by the driver. */
export interface EntitlementSnapshot {
  id: string;
  userId: string;
  creatorId: string;
  packId: string | null;
  ruleId: string | null;
  providerId: string | null;
  tier: string | null;
  status: EntitlementStatus;
  startedAt: Date;
  lastVerifiedAt: Date | null;
  expiresAt: Date | null;
  graceUntil: Date | null;
}

/** Normalized evidence from an adapter, an access code, billing, or an admin. */
export interface EngineEvidence {
  kind: 'api_poll' | 'webhook' | 'access_code' | 'admin_action' | 'billing' | 'manual_import';
  providerId: string | null;
  /** Stable external reference (event id, sub id, code id) for idempotency. */
  externalRef: string;
  observedAt: Date;
  active: boolean;
  tier: string | null;
  /** Hard expiry the provider communicated, if any. */
  expiresAt: Date | null;
  payload?: Record<string, unknown>;
}

export type EngineDecision =
  | {
      action: 'create';
      status: Extract<EntitlementStatus, 'active' | 'pending'>;
      tier: string | null;
      expiresAt: Date | null;
      reason: string;
    }
  | {
      action: 'transition';
      to: EntitlementStatus;
      tier?: string | null;
      expiresAt?: Date | null;
      graceUntil?: Date | null;
      lastVerifiedAt?: Date;
      reason: string;
    }
  | { action: 'extend'; tier: string | null; expiresAt: Date | null; lastVerifiedAt: Date; reason: string }
  | { action: 'ignore'; reason: 'stale_evidence' | 'duplicate' | 'no_change' | 'terminal_state' };

export interface DecideInput {
  now: Date;
  rule: EngineRule;
  current: EntitlementSnapshot | null;
  evidence: EngineEvidence;
  /** Effective grace period hours (already resolved from config + rule override). */
  graceHours: number;
  /** Recently-seen evidence dedupe keys (externalRef + observedAt ISO). */
  seenEvidenceKeys?: ReadonlySet<string>;
}

export function evidenceDedupeKey(e: EngineEvidence): string {
  return `${e.kind}:${e.providerId ?? 'none'}:${e.externalRef}:${e.observedAt.toISOString()}:${e.active}`;
}
