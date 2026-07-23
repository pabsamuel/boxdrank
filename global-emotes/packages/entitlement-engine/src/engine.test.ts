import { describe, expect, it } from 'vitest';
import {
  decideEntitlement,
  sweepEntitlement,
  canTransition,
  assertTransition,
  InvalidTransitionError,
  ruleMatchesEvidence,
  effectiveGraceHours,
  evidenceDedupeKey,
  type EngineEvidence,
  type EngineRule,
  type EntitlementSnapshot,
} from './index';

const NOW = new Date('2026-07-23T12:00:00Z');
const EARLIER = new Date('2026-07-23T10:00:00Z');
const LATER = new Date('2026-07-23T14:00:00Z');

const rule: EngineRule = {
  id: 'rule-1',
  packId: 'pack-1',
  kind: 'tier',
  providerId: 'twitch',
  config: { tiers: ['1000', '2000', '3000'] },
  graceHoursOverride: null,
};

function evidence(overrides: Partial<EngineEvidence> = {}): EngineEvidence {
  return {
    kind: 'webhook',
    providerId: 'twitch',
    externalRef: 'evt-1',
    observedAt: NOW,
    active: true,
    tier: '1000',
    expiresAt: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot {
  return {
    id: 'ent-1',
    userId: 'user-1',
    creatorId: 'creator-1',
    packId: 'pack-1',
    ruleId: 'rule-1',
    providerId: 'twitch',
    tier: '1000',
    status: 'active',
    startedAt: EARLIER,
    lastVerifiedAt: EARLIER,
    expiresAt: null,
    graceUntil: null,
    ...overrides,
  };
}

describe('state machine', () => {
  it('allows documented transitions and rejects others', () => {
    expect(canTransition('pending', 'active')).toBe(true);
    expect(canTransition('active', 'grace')).toBe(true);
    expect(canTransition('grace', 'active')).toBe(true);
    expect(canTransition('grace', 'expired')).toBe(true);
    expect(canTransition('expired', 'active')).toBe(true);
    expect(canTransition('revoked', 'active')).toBe(true); // admin restore
    expect(canTransition('expired', 'grace')).toBe(false);
    expect(canTransition('revoked', 'grace')).toBe(false);
    expect(() => assertTransition('revoked', 'grace')).toThrow(InvalidTransitionError);
  });
});

describe('decideEntitlement — grants', () => {
  it('creates an active entitlement from positive evidence with no prior state', () => {
    const d = decideEntitlement({ now: NOW, rule, current: null, evidence: evidence(), graceHours: 72 });
    expect(d).toMatchObject({ action: 'create', status: 'active', tier: '1000' });
  });

  it('ignores negative evidence with no prior state', () => {
    const d = decideEntitlement({
      now: NOW,
      rule,
      current: null,
      evidence: evidence({ active: false }),
      graceHours: 72,
    });
    expect(d).toEqual({ action: 'ignore', reason: 'no_change' });
  });

  it('extends and re-verifies an active entitlement on fresh positive evidence', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot(),
      evidence: evidence({ observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'extend', lastVerifiedAt: LATER });
  });

  it('records tier changes (upgrade/downgrade) on extension', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot({ tier: '1000' }),
      evidence: evidence({ observedAt: LATER, tier: '3000' }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'extend', tier: '3000' });
    expect((d as { reason: string }).reason).toContain('1000 -> 3000');
  });

  it('reactivates from grace when membership resumes', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot({ status: 'grace', graceUntil: LATER }),
      evidence: evidence({ observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'transition', to: 'active', graceUntil: null });
  });

  it('reactivates an expired entitlement on new membership', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot({ status: 'expired' }),
      evidence: evidence({ observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'transition', to: 'active' });
  });
});

describe('decideEntitlement — endings and grace', () => {
  it('moves active → grace on negative evidence with grace configured', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot(),
      evidence: evidence({ active: false, observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'transition', to: 'grace' });
    const graceUntil = (d as { graceUntil: Date }).graceUntil;
    expect(graceUntil.getTime()).toBe(LATER.getTime() + 72 * 3_600_000);
  });

  it('moves active → expired immediately when grace is zero (access codes)', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot(),
      evidence: evidence({ active: false, observedAt: LATER }),
      graceHours: 0,
    });
    expect(d).toMatchObject({ action: 'transition', to: 'expired' });
  });

  it('does not re-trigger grace while already in grace', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot({ status: 'grace', graceUntil: new Date('2026-07-25T12:00:00Z') }),
      evidence: evidence({ active: false, observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toEqual({ action: 'ignore', reason: 'no_change' });
  });
});

describe('decideEntitlement — ordering, duplicates, admin states', () => {
  it('ignores out-of-order (stale) evidence', () => {
    const d = decideEntitlement({
      now: NOW,
      rule,
      current: snapshot({ lastVerifiedAt: NOW }),
      evidence: evidence({ active: false, observedAt: EARLIER }),
      graceHours: 72,
    });
    expect(d).toEqual({ action: 'ignore', reason: 'stale_evidence' });
  });

  it('ignores exact duplicate evidence via dedupe keys', () => {
    const e = evidence();
    const d = decideEntitlement({
      now: NOW,
      rule,
      current: snapshot(),
      evidence: e,
      graceHours: 72,
      seenEvidenceKeys: new Set([evidenceDedupeKey(e)]),
    });
    expect(d).toEqual({ action: 'ignore', reason: 'duplicate' });
  });

  it('never lets automated evidence override an admin revocation', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot({ status: 'revoked' }),
      evidence: evidence({ observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toEqual({ action: 'ignore', reason: 'terminal_state' });
  });

  it('lets an admin restore a revoked entitlement', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot({ status: 'revoked' }),
      evidence: evidence({ kind: 'admin_action', externalRef: 'admin-restore-1', observedAt: LATER }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'transition', to: 'active' });
  });

  it('admin negative action revokes immediately, skipping grace', () => {
    const d = decideEntitlement({
      now: LATER,
      rule,
      current: snapshot(),
      evidence: evidence({ kind: 'admin_action', active: false, observedAt: LATER, externalRef: 'ban-1' }),
      graceHours: 72,
    });
    expect(d).toMatchObject({ action: 'transition', to: 'revoked' });
  });
});

describe('sweepEntitlement — reconciliation without provider events', () => {
  it('moves active → grace when hard expiry lapses (provider outage tolerance)', () => {
    const d = sweepEntitlement(
      NOW,
      snapshot({ expiresAt: EARLIER }),
      72,
    );
    expect(d).toMatchObject({ action: 'transition', to: 'grace' });
    // Grace anchors to the expiry, not the sweep time — late sweeps don't extend access.
    expect((d as { graceUntil: Date }).graceUntil.getTime()).toBe(
      EARLIER.getTime() + 72 * 3_600_000,
    );
  });

  it('moves grace → expired when grace lapses', () => {
    const d = sweepEntitlement(NOW, snapshot({ status: 'grace', graceUntil: EARLIER }), 72);
    expect(d).toMatchObject({ action: 'transition', to: 'expired' });
  });

  it('leaves healthy entitlements alone', () => {
    const d = sweepEntitlement(NOW, snapshot({ expiresAt: LATER }), 72);
    expect(d).toEqual({ action: 'ignore', reason: 'no_change' });
  });
});

describe('rule matching', () => {
  const baseEvidence = {
    providerId: 'twitch' as const,
    externalFanAccountId: 'fan-1',
    externalCreatorAccountId: 'streamer-1',
    kind: 'tier' as const,
    tier: '1000',
    externalRef: 'sub-1',
    observedAt: NOW.toISOString(),
    expiresAt: null,
    active: true,
  };

  it('matches tier rules with allowed tiers', () => {
    expect(ruleMatchesEvidence(rule, baseEvidence)).toBe(true);
    expect(ruleMatchesEvidence(rule, { ...baseEvidence, tier: '9999' })).toBe(false);
  });

  it('rejects cross-provider evidence', () => {
    expect(ruleMatchesEvidence(rule, { ...baseEvidence, providerId: 'discord' as never })).toBe(false);
  });

  it('matches discord role rules against guild and role ids', () => {
    const discordRule: EngineRule = {
      id: 'r2',
      packId: 'pack-1',
      kind: 'discord_role',
      providerId: 'discord',
      config: { guildId: 'guild-1', roleIds: ['role-vip'] },
      graceHoursOverride: null,
    };
    const discordEvidence = {
      ...baseEvidence,
      providerId: 'discord' as const,
      kind: 'discord_role' as const,
      tier: 'role-vip',
      raw: { guildId: 'guild-1' },
    };
    expect(ruleMatchesEvidence(discordRule, discordEvidence)).toBe(true);
    expect(
      ruleMatchesEvidence(discordRule, { ...discordEvidence, raw: { guildId: 'other' } }),
    ).toBe(false);
    expect(ruleMatchesEvidence(discordRule, { ...discordEvidence, tier: 'role-basic' })).toBe(false);
  });

  it('public rules never match evidence (public needs none)', () => {
    const publicRule: EngineRule = {
      id: 'r3',
      packId: 'p',
      kind: 'public',
      providerId: null,
      config: {},
      graceHoursOverride: null,
    };
    expect(ruleMatchesEvidence(publicRule, baseEvidence)).toBe(false);
  });
});

describe('grace policy resolution', () => {
  it('uses rule override first, then provider default, then global default', () => {
    expect(effectiveGraceHours({ ...rule, graceHoursOverride: 12 }, 'twitch')).toBe(12);
    expect(effectiveGraceHours(rule, 'patreon')).toBe(120);
    expect(effectiveGraceHours(rule, 'unknown-provider')).toBe(72);
    expect(effectiveGraceHours(rule, null)).toBe(72);
  });
});
