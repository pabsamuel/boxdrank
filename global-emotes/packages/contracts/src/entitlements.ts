import { z } from 'zod';
import { providerIdSchema } from './providers.js';

export const entitlementStatusSchema = z.enum([
  'pending',
  'active',
  'grace',
  'expired',
  'revoked',
  'disputed',
]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const entitlementRuleKindSchema = z.enum([
  'public',
  'follower',
  'member',
  'tier',
  'discord_role',
  'patreon_tier',
  'access_code',
  'purchase',
  'campaign',
]);
export type EntitlementRuleKind = z.infer<typeof entitlementRuleKindSchema>;

export const entitlementRuleSchema = z.object({
  id: z.string().uuid(),
  packId: z.string().uuid(),
  kind: entitlementRuleKindSchema,
  providerId: providerIdSchema.nullable(),
  /** Rule-kind-specific config: tier ids, role ids, campaign window, etc. */
  config: z.record(z.unknown()).default({}),
});
export type EntitlementRule = z.infer<typeof entitlementRuleSchema>;

export const publicEntitlementSchema = z.object({
  id: z.string().uuid(),
  packId: z.string().uuid().nullable(),
  creatorId: z.string().uuid(),
  providerId: providerIdSchema.nullable(),
  tier: z.string().nullable(),
  status: entitlementStatusSchema,
  startedAt: z.string(),
  expiresAt: z.string().nullable(),
  graceUntil: z.string().nullable(),
});
export type PublicEntitlement = z.infer<typeof publicEntitlementSchema>;

/** Normalized external evidence produced by provider adapters. */
export const externalEntitlementSchema = z.object({
  providerId: providerIdSchema,
  externalFanAccountId: z.string(),
  externalCreatorAccountId: z.string(),
  kind: entitlementRuleKindSchema,
  tier: z.string().nullable(),
  /** e.g. Twitch sub tier, Discord role id, Patreon tier id. */
  externalRef: z.string(),
  observedAt: z.string(),
  expiresAt: z.string().nullable(),
  active: z.boolean(),
  raw: z.record(z.unknown()).optional(),
});
export type ExternalEntitlement = z.infer<typeof externalEntitlementSchema>;

export const redeemCodeRequestSchema = z.object({
  code: z
    .string()
    .min(4)
    .max(64)
    .transform((s) => s.trim().toUpperCase()),
});
