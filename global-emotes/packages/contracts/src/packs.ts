import { z } from 'zod';
import { slugSchema } from './common.js';
import { entitlementRuleKindSchema } from './entitlements.js';

export const packVisibilitySchema = z.enum(['draft', 'published', 'unlisted', 'suspended']);
export type PackVisibility = z.infer<typeof packVisibilitySchema>;

export const emoteStatusSchema = z.enum(['processing', 'active', 'rejected', 'takedown']);

export const emoteVariantSchema = z.object({
  kind: z.enum(['web_preview', 'keyboard', 'share', 'telegram', 'low_bandwidth', 'thumbnail']),
  key: z.string(),
  mimeType: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  bytes: z.number().int(),
});
export type EmoteVariant = z.infer<typeof emoteVariantSchema>;

export const publicEmoteSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  shortcode: z.string(),
  animated: z.boolean(),
  status: emoteStatusSchema,
  tags: z.array(z.string()).default([]),
  /** URLs are signed/entitlement-aware; never permanent originals. */
  previewUrl: z.string().nullable(),
});
export type PublicEmote = z.infer<typeof publicEmoteSchema>;

export const publicPackSchema = z.object({
  id: z.string().uuid(),
  creatorId: z.string().uuid(),
  creatorHandle: z.string(),
  creatorDisplayName: z.string(),
  slug: slugSchema,
  name: z.string(),
  description: z.string().nullable(),
  visibility: packVisibilitySchema,
  emoteCount: z.number().int(),
  allowTelegramExport: z.boolean(),
  accessSummary: z.array(entitlementRuleKindSchema),
  publishedAt: z.string().nullable(),
});
export type PublicPack = z.infer<typeof publicPackSchema>;

export const createPackRequestSchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema.optional(),
  description: z.string().max(500).optional(),
  allowTelegramExport: z.boolean().default(true),
});

export const updatePackRequestSchema = createPackRequestSchema.partial().extend({
  visibility: packVisibilitySchema.optional(),
});

export const shortcodeSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, 'letters, digits, underscore');

export const createEmoteRequestSchema = z.object({
  name: z.string().min(1).max(64),
  shortcode: shortcodeSchema,
  uploadGrantId: z.string().uuid(),
  tags: z.array(z.string().min(1).max(32)).max(10).default([]),
});

export const requestUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  bytes: z
    .number()
    .int()
    .min(1)
    .max(2 * 1024 * 1024),
});

/** Device sync manifest: everything a keyboard needs, cacheable offline. */
export const syncManifestSchema = z.object({
  generatedAt: z.string(),
  cursor: z.string(),
  packs: z.array(
    z.object({
      packId: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      creatorHandle: z.string(),
      entitlementStatus: z.enum(['active', 'grace']),
      emotes: z.array(
        z.object({
          id: z.string().uuid(),
          shortcode: z.string(),
          name: z.string(),
          animated: z.boolean(),
          keyboardUrl: z.string(),
          shareUrl: z.string(),
          contentHash: z.string(),
        }),
      ),
    }),
  ),
  removedPackIds: z.array(z.string().uuid()),
});
export type SyncManifest = z.infer<typeof syncManifestSchema>;
