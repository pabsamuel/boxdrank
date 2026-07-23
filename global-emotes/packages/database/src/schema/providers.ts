import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { creatorProfiles, users } from './identity';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

/** Provider registry row; capability detail lives in provider-sdk declarations. */
export const providers = pgTable('providers', {
  id: text('id').primaryKey(), // 'twitch' | 'discord' | ...
  name: text('name').notNull(),
  status: text('status').notNull(), // ProviderStatus from contracts
  enabled: boolean('enabled').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const providerConnections = pgTable(
  'provider_connections',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    externalAccountId: text('external_account_id').notNull(),
    displayName: text('display_name'),
    scopes: text('scopes').array().default([]).notNull(),
    status: text('status', { enum: ['active', 'expired', 'revoked', 'error'] })
      .default('active')
      .notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('provider_connections_unique_idx').on(t.userId, t.providerId, t.externalAccountId),
    index('provider_connections_provider_account_idx').on(t.providerId, t.externalAccountId),
  ],
);

/** Tokens are AES-256-GCM encrypted by packages/auth crypto; never selected into API responses. */
export const providerTokens = pgTable(
  'provider_tokens',
  {
    id: id(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => providerConnections.id, { onDelete: 'cascade' }),
    accessTokenEnc: text('access_token_enc').notNull(),
    refreshTokenEnc: text('refresh_token_enc'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('provider_tokens_connection_idx').on(t.connectionId)],
);

export const providerWebhookSubscriptions = pgTable(
  'provider_webhook_subscriptions',
  {
    id: id(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    externalSubscriptionId: text('external_subscription_id').notNull(),
    topic: text('topic').notNull(),
    /** e.g. broadcaster id the subscription targets. */
    externalAccountId: text('external_account_id'),
    status: text('status', { enum: ['pending', 'active', 'failed', 'revoked'] })
      .default('pending')
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('provider_webhooks_external_idx').on(t.providerId, t.externalSubscriptionId),
  ],
);

export const providerSyncRuns = pgTable(
  'provider_sync_runs',
  {
    id: id(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    connectionId: uuid('connection_id').references(() => providerConnections.id, {
      onDelete: 'set null',
    }),
    kind: text('kind', {
      enum: ['fan_entitlements', 'creator_members', 'emote_import', 'reconciliation'],
    }).notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed'] })
      .default('running')
      .notNull(),
    stats: jsonb('stats').$type<Record<string, number>>().default({}).notNull(),
    error: text('error'),
    startedAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('provider_sync_runs_provider_idx').on(t.providerId, t.startedAt)],
);

/** Webhook inbox: idempotency + replay protection. One row per external event id. */
export const providerEvents = pgTable(
  'provider_events',
  {
    id: id(),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    externalEventId: text('external_event_id').notNull(),
    topic: text('topic').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    receivedAt: createdAt(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    status: text('status', { enum: ['received', 'processed', 'failed', 'skipped'] })
      .default('received')
      .notNull(),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error'),
  },
  (t) => [uniqueIndex('provider_events_external_idx').on(t.providerId, t.externalEventId)],
);

export const externalCreatorAccounts = pgTable(
  'external_creator_accounts',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    externalAccountId: text('external_account_id').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('external_creator_accounts_idx').on(t.providerId, t.externalAccountId),
    index('external_creator_accounts_creator_idx').on(t.creatorId),
  ],
);

export const externalFanAccounts = pgTable(
  'external_fan_accounts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: text('provider_id')
      .notNull()
      .references(() => providers.id),
    externalAccountId: text('external_account_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('external_fan_accounts_idx').on(t.providerId, t.externalAccountId)],
);
