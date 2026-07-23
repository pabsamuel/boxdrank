import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { creatorProfiles, users } from './identity.js';
import { emotePacks } from './emotes.js';
import { providers } from './providers.js';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const entitlementStatusEnum = pgEnum('entitlement_status', [
  'pending',
  'active',
  'grace',
  'expired',
  'revoked',
  'disputed',
]);

export const entitlementRules = pgTable(
  'entitlement_rules',
  {
    id: id(),
    packId: uuid('pack_id')
      .notNull()
      .references(() => emotePacks.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'public',
        'follower',
        'member',
        'tier',
        'discord_role',
        'patreon_tier',
        'access_code',
        'purchase',
        'campaign',
      ],
    }).notNull(),
    providerId: text('provider_id').references(() => providers.id),
    /** Kind-specific config: { tierIds: [], roleIds: [], guildId, windowEnd… }. */
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    graceHoursOverride: integer('grace_hours_override'),
    createdAt: createdAt(),
  },
  (t) => [index('entitlement_rules_pack_idx').on(t.packId)],
);

/**
 * Append-mostly entitlement records. History is never deleted: a superseded or
 * ended entitlement transitions status and keeps its evidence chain.
 */
export const entitlements = pgTable(
  'entitlements',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    /** Null = creator-wide scope (all packs matching the rule). */
    packId: uuid('pack_id').references(() => emotePacks.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').references(() => entitlementRules.id, { onDelete: 'set null' }),
    providerId: text('provider_id').references(() => providers.id),
    tier: text('tier'),
    status: entitlementStatusEnum('status').default('pending').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('entitlements_user_idx').on(t.userId, t.status),
    index('entitlements_pack_idx').on(t.packId, t.status),
    index('entitlements_creator_idx').on(t.creatorId),
    // At most one live entitlement per (user, rule); history rows keep other statuses.
    uniqueIndex('entitlements_user_rule_live_idx')
      .on(t.userId, t.ruleId)
      .where(sql`status in ('pending', 'active', 'grace')`),
  ],
);

export const entitlementEvidence = pgTable(
  'entitlement_evidence',
  {
    id: id(),
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => entitlements.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['api_poll', 'webhook', 'access_code', 'admin_action', 'billing', 'manual_import'],
    }).notNull(),
    providerId: text('provider_id').references(() => providers.id),
    externalRef: text('external_ref'),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('entitlement_evidence_entitlement_idx').on(t.entitlementId, t.observedAt)],
);

export const accessCodes = pgTable(
  'access_codes',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    packId: uuid('pack_id')
      .notNull()
      .references(() => emotePacks.id, { onDelete: 'cascade' }),
    /** Uppercase human-shareable code. Rate-limited redemption endpoint. */
    code: text('code').notNull(),
    tier: text('tier'),
    batchId: uuid('batch_id'),
    maxRedemptions: integer('max_redemptions').default(1).notNull(),
    redemptionCount: integer('redemption_count').default(0).notNull(),
    /** Entitlement duration granted per redemption; null = indefinite. */
    grantDurationHours: integer('grant_duration_hours'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('access_codes_code_idx').on(t.code)],
);

export const accessCodeRedemptions = pgTable(
  'access_code_redemptions',
  {
    id: id(),
    codeId: uuid('code_id')
      .notNull()
      .references(() => accessCodes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entitlementId: uuid('entitlement_id').references(() => entitlements.id),
    redeemedAt: createdAt(),
  },
  (t) => [uniqueIndex('access_code_redemptions_unique_idx').on(t.codeId, t.userId)],
);
