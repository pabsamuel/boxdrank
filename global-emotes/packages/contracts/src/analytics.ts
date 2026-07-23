import { z } from 'zod';

/**
 * Privacy-safe analytics event schema (master spec §4.3).
 * HARD RULE: no message contents, no recipients, no typed text, no surrounding
 * text may ever appear here. The ingestion endpoint rejects unknown event
 * names and unknown property keys — an allowlist, not a blocklist.
 */

export const analyticsEventNameSchema = z.enum([
  // fan funnel
  'pack_page_viewed',
  'install_link_clicked',
  'account_created',
  'provider_connected',
  'pack_unlocked',
  'keyboard_onboarding_started',
  'keyboard_enabled',
  // keyboard (no content, ever)
  'keyboard_opened',
  'pack_viewed',
  'emote_selected',
  'insertion_attempted',
  'insertion_succeeded',
  'fallback_copied',
  'share_sheet_opened',
  'telegram_export_started',
  'telegram_export_completed',
  // creator funnel
  'creator_signup',
  'creator_verified',
  'pack_created',
  'emote_uploaded',
  'pack_published',
  'share_link_copied',
  'membership_cta_clicked',
  // billing
  'checkout_started',
  'checkout_completed',
  'subscription_cancelled',
]);
export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;

/** Allowlisted property keys. Anything else is rejected at the trust boundary. */
export const analyticsPropsSchema = z
  .object({
    packId: z.string().uuid().optional(),
    creatorId: z.string().uuid().optional(),
    emoteId: z.string().uuid().optional(),
    providerId: z.string().optional(),
    platform: z.enum(['android', 'ios', 'web']).optional(),
    /** Insertion method category only — never the destination app's content. */
    method: z.string().optional(),
    /** Target app id for compatibility stats (package/bundle id, not content). */
    targetAppId: z.string().optional(),
    success: z.boolean().optional(),
    plan: z.string().optional(),
    campaign: z.string().optional(),
  })
  .strict();

export const analyticsEventSchema = z.object({
  name: analyticsEventNameSchema,
  props: analyticsPropsSchema.default({}),
  occurredAt: z.string().datetime().optional(),
  /** Random per-install id; not a device fingerprint. */
  installId: z.string().max(64).optional(),
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export const analyticsBatchSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(100),
});
