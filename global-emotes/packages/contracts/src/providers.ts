import { z } from 'zod';

export const providerIdSchema = z.enum([
  'mock',
  'twitch',
  'discord',
  'patreon',
  'youtube',
  'kick',
  'access_code',
  'generic_webhook',
]);
export type ProviderId = z.infer<typeof providerIdSchema>;

/** Honest capability statuses — mirrored in docs/integrations/PROVIDER_CAPABILITY_MATRIX.md. */
export const providerStatusSchema = z.enum([
  'production_ready',
  'credentials_required',
  'approval_required',
  'creator_authorized_only',
  'manual_fallback',
  'research_required',
  'blocked',
]);
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const providerCapabilitiesSchema = z.object({
  oauth: z.boolean(),
  creatorIdentity: z.boolean(),
  fanIdentity: z.boolean(),
  fanMembershipVerification: z.boolean(),
  creatorMemberList: z.boolean(),
  tierAccess: z.boolean(),
  emoteImport: z.boolean(),
  webhooks: z.boolean(),
  pollingRequired: z.boolean(),
  approvalRequired: z.boolean(),
  status: providerStatusSchema,
  notes: z.string().default(''),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

export const publicProviderSchema = z.object({
  id: providerIdSchema,
  name: z.string(),
  status: providerStatusSchema,
  enabled: z.boolean(),
  connectUrl: z.string().nullable(),
});
export type PublicProvider = z.infer<typeof publicProviderSchema>;

export const providerConnectionSchema = z.object({
  id: z.string().uuid(),
  providerId: providerIdSchema,
  externalAccountId: z.string(),
  displayName: z.string().nullable(),
  status: z.enum(['active', 'expired', 'revoked', 'error']),
  connectedAt: z.string(),
});
export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
