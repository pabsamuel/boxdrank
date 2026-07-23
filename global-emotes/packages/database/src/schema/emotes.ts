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
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date());

export const emotePacks = pgTable(
  'emote_packs',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    visibility: text('visibility', { enum: ['draft', 'published', 'unlisted', 'suspended'] })
      .default('draft')
      .notNull(),
    allowTelegramExport: boolean('allow_telegram_export').default(true).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('emote_packs_creator_slug_idx').on(t.creatorId, t.slug),
    index('emote_packs_visibility_idx').on(t.visibility),
  ],
);

export const emotes = pgTable(
  'emotes',
  {
    id: id(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    shortcode: text('shortcode').notNull(),
    animated: boolean('animated').default(false).notNull(),
    status: text('status', { enum: ['processing', 'active', 'rejected', 'takedown'] })
      .default('processing')
      .notNull(),
    contentHash: text('content_hash'),
    currentVersion: integer('current_version').default(1).notNull(),
    /** Provenance: 'upload' | 'import:<provider>' + license note (spec §4.2). */
    source: text('source').default('upload').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('emotes_creator_shortcode_idx').on(t.creatorId, t.shortcode),
    index('emotes_content_hash_idx').on(t.contentHash),
  ],
);

export const emoteAssetVersions = pgTable(
  'emote_asset_versions',
  {
    id: id(),
    emoteId: uuid('emote_id')
      .notNull()
      .references(() => emotes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    originalKey: text('original_key').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    frameCount: integer('frame_count').default(1).notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    bytes: integer('bytes').notNull(),
    contentHash: text('content_hash').notNull(),
    /** EmoteVariant[] from contracts: keyboard/web/share/telegram/low-bandwidth keys. */
    variants: jsonb('variants').$type<unknown[]>().default([]).notNull(),
    processingStatus: text('processing_status', {
      enum: ['pending', 'processing', 'succeeded', 'failed'],
    })
      .default('pending')
      .notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('emote_asset_versions_idx').on(t.emoteId, t.version)],
);

export const emotePackItems = pgTable(
  'emote_pack_items',
  {
    id: id(),
    packId: uuid('pack_id')
      .notNull()
      .references(() => emotePacks.id, { onDelete: 'cascade' }),
    emoteId: uuid('emote_id')
      .notNull()
      .references(() => emotes.id, { onDelete: 'cascade' }),
    position: integer('position').default(0).notNull(),
  },
  (t) => [
    uniqueIndex('emote_pack_items_unique_idx').on(t.packId, t.emoteId),
    index('emote_pack_items_pack_idx').on(t.packId, t.position),
  ],
);

export const emoteTags = pgTable(
  'emote_tags',
  {
    id: id(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('emote_tags_name_idx').on(t.name)],
);

export const emoteTagLinks = pgTable(
  'emote_tag_links',
  {
    id: id(),
    emoteId: uuid('emote_id')
      .notNull()
      .references(() => emotes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => emoteTags.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('emote_tag_links_unique_idx').on(t.emoteId, t.tagId)],
);

/** Immutable snapshot of a pack at publish time (rollback + version history). */
export const packVersions = pgTable(
  'pack_versions',
  {
    id: id(),
    packId: uuid('pack_id')
      .notNull()
      .references(() => emotePacks.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('pack_versions_idx').on(t.packId, t.version)],
);

export const packPublications = pgTable('pack_publications', {
  id: id(),
  packId: uuid('pack_id')
    .notNull()
    .references(() => emotePacks.id, { onDelete: 'cascade' }),
  packVersionId: uuid('pack_version_id')
    .notNull()
    .references(() => packVersions.id),
  publishedBy: uuid('published_by')
    .notNull()
    .references(() => users.id),
  note: text('note'),
  publishedAt: createdAt(),
});

/** Temporary, pre-authorized upload slot; object lands in quarantine bucket. */
export const uploadGrants = pgTable(
  'upload_grants',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    objectKey: text('object_key').notNull(),
    mimeType: text('mime_type').notNull(),
    maxBytes: integer('max_bytes').notNull(),
    status: text('status', { enum: ['pending', 'uploaded', 'consumed', 'expired'] })
      .default('pending')
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('upload_grants_key_idx').on(t.objectKey)],
);

export const assetProcessingJobs = pgTable(
  'asset_processing_jobs',
  {
    id: id(),
    emoteId: uuid('emote_id').references(() => emotes.id, { onDelete: 'cascade' }),
    uploadGrantId: uuid('upload_grant_id').references(() => uploadGrants.id),
    status: text('status', { enum: ['queued', 'processing', 'succeeded', 'failed'] })
      .default('queued')
      .notNull(),
    attempts: integer('attempts').default(0).notNull(),
    error: text('error'),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('asset_jobs_status_idx').on(t.status)],
);
