import { GRACE_PERIOD_HOURS } from '@global-emotes/config';
import type { ExternalEntitlement } from '@global-emotes/contracts';
import type { EngineRule } from './types';

/**
 * Match normalized external evidence against a pack's entitlement rules.
 * Provider-specific semantics stay in adapters; rules match on normalized
 * kind + provider + tier/role config.
 */
export function ruleMatchesEvidence(rule: EngineRule, evidence: ExternalEntitlement): boolean {
  if (rule.kind === 'public') return false; // public packs need no evidence
  if (rule.providerId && rule.providerId !== evidence.providerId) return false;

  switch (rule.kind) {
    case 'member':
    case 'follower':
      return evidence.kind === rule.kind;
    case 'tier': {
      if (evidence.kind !== 'tier' && evidence.kind !== 'member') return false;
      const tiers = asStringArray(rule.config['tiers']);
      if (tiers.length === 0) return true; // any tier qualifies
      return evidence.tier !== null && tiers.includes(evidence.tier);
    }
    case 'discord_role': {
      if (evidence.kind !== 'discord_role') return false;
      const guildId = rule.config['guildId'];
      if (typeof guildId === 'string' && guildId.length > 0) {
        const evidenceGuild = (evidence.raw?.['guildId'] ?? evidence.externalCreatorAccountId) as string;
        if (evidenceGuild !== guildId) return false;
      }
      const roles = asStringArray(rule.config['roleIds']);
      if (roles.length === 0) return true;
      return evidence.tier !== null && roles.includes(evidence.tier);
    }
    case 'patreon_tier': {
      if (evidence.kind !== 'patreon_tier') return false;
      const tiers = asStringArray(rule.config['tierIds']);
      if (tiers.length === 0) return true;
      return evidence.tier !== null && tiers.includes(evidence.tier);
    }
    case 'access_code':
      return evidence.kind === 'access_code';
    case 'purchase':
      return evidence.kind === 'purchase';
    case 'campaign': {
      if (evidence.kind !== 'campaign' && evidence.kind !== 'member') return false;
      const end = rule.config['windowEnd'];
      if (typeof end === 'string' && new Date(evidence.observedAt) > new Date(end)) return false;
      return true;
    }
    default:
      return false;
  }
}

export function effectiveGraceHours(rule: EngineRule, providerId: string | null): number {
  if (rule.graceHoursOverride !== null && rule.graceHoursOverride !== undefined) {
    return rule.graceHoursOverride;
  }
  if (providerId && providerId in GRACE_PERIOD_HOURS) {
    return GRACE_PERIOD_HOURS[providerId] ?? GRACE_PERIOD_HOURS['default'] ?? 72;
  }
  return GRACE_PERIOD_HOURS['default'] ?? 72;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}
