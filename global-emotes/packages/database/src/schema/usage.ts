import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { emotes } from './emotes.js';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const favorites = pgTable(
  'favorites',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoteId: uuid('emote_id')
      .notNull()
      .references(() => emotes.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('favorites_unique_idx').on(t.userId, t.emoteId)],
);

export const recentEmotes = pgTable(
  'recent_emotes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoteId: uuid('emote_id')
      .notNull()
      .references(() => emotes.id, { onDelete: 'cascade' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    useCount: integer('use_count').default(1).notNull(),
  },
  (t) => [
    uniqueIndex('recent_emotes_unique_idx').on(t.userId, t.emoteId),
    index('recent_emotes_user_idx').on(t.userId, t.lastUsedAt),
  ],
);

export const userCollections = pgTable('user_collections', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').default(0).notNull(),
  createdAt: createdAt(),
});

export const userCollectionItems = pgTable(
  'user_collection_items',
  {
    id: id(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => userCollections.id, { onDelete: 'cascade' }),
    emoteId: uuid('emote_id')
      .notNull()
      .references(() => emotes.id, { onDelete: 'cascade' }),
    position: integer('position').default(0).notNull(),
  },
  (t) => [uniqueIndex('user_collection_items_unique_idx').on(t.collectionId, t.emoteId)],
);

export const deviceInstallations = pgTable(
  'device_installations',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: ['android', 'ios', 'web'] }).notNull(),
    /** Random per-install identifier generated client-side; not a fingerprint. */
    installId: text('install_id').notNull(),
    appVersion: text('app_version'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('device_installations_install_idx').on(t.installId)],
);

export const deviceSyncCursors = pgTable(
  'device_sync_cursors',
  {
    id: id(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => deviceInstallations.id, { onDelete: 'cascade' }),
    cursor: text('cursor').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('device_sync_cursors_device_idx').on(t.deviceId)],
);

/** Short-lived signed-URL grants for protected assets (audited). */
export const assetCacheGrants = pgTable(
  'asset_cache_grants',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').references(() => deviceInstallations.id, { onDelete: 'set null' }),
    objectKey: text('object_key').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('asset_cache_grants_user_idx').on(t.userId, t.createdAt)],
);

/** Privacy-safe events only — schema enforced upstream by contracts allowlist. */
export const privacySafeUsageEvents = pgTable(
  'privacy_safe_usage_events',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    installId: text('install_id'),
    name: text('name').notNull(),
    props: jsonb('props').$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('usage_events_name_idx').on(t.name, t.occurredAt),
    index('usage_events_user_idx').on(t.userId, t.occurredAt),
  ],
);
