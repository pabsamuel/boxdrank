import { analyticsBatchSchema, type AnalyticsEvent } from '@global-emotes/contracts';

/**
 * Privacy-safe analytics ingestion. The contracts schema is an allowlist of
 * event names and property keys — anything else is rejected at this trust
 * boundary, which is what makes "no message contents ever" enforceable.
 */

export interface SanitizedBatch {
  accepted: AnalyticsEvent[];
  rejected: number;
}

export function sanitizeBatch(raw: unknown): SanitizedBatch {
  const parsed = analyticsBatchSchema.safeParse(raw);
  if (parsed.success) return { accepted: parsed.data.events, rejected: 0 };

  // Salvage valid events from a partially-invalid batch instead of dropping all.
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { events?: unknown[] }).events)) {
    const events = (raw as { events: unknown[] }).events;
    const accepted: AnalyticsEvent[] = [];
    let rejected = 0;
    for (const event of events) {
      const one = analyticsBatchSchema.shape.events.element.safeParse(event);
      if (one.success) accepted.push(one.data);
      else rejected += 1;
    }
    return { accepted, rejected };
  }
  return { accepted: [], rejected: 1 };
}

/** Funnels used by the launch metrics dashboard (Spec B §17). */
export const FUNNELS = {
  fan_activation: [
    'pack_page_viewed',
    'install_link_clicked',
    'account_created',
    'provider_connected',
    'pack_unlocked',
    'keyboard_enabled',
    'insertion_succeeded',
  ],
  creator_activation: ['creator_signup', 'creator_verified', 'pack_created', 'emote_uploaded', 'pack_published', 'share_link_copied'],
  monetization: ['checkout_started', 'checkout_completed'],
} as const;

/** Documented KPI queries live in docs/operations/OBSERVABILITY.md; keys here keep them typo-safe. */
export const KPI_EVENT_KEYS = [
  'emote_selected',
  'insertion_succeeded',
  'fallback_copied',
  'pack_unlocked',
  'keyboard_opened',
] as const;
