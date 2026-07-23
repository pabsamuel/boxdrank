import { z } from 'zod';

/**
 * Data-driven target-app compatibility registry (IMPROVEMENT_PROPOSALS IP-06).
 * Served by the API, cached by keyboards. Runtime MIME detection always wins;
 * these entries are hints and copy for user-facing messaging. Never hardcode
 * "works everywhere" claims.
 */

export const insertionCapabilitySchema = z.enum([
  'direct_static_image',
  'direct_animated_gif',
  'direct_animated_webp',
  'clipboard_static',
  'clipboard_animated',
  'share_sheet',
  'unsupported',
]);
export type InsertionCapability = z.infer<typeof insertionCapabilitySchema>;

export const compatibilityEntrySchema = z.object({
  /** Android package name or iOS bundle id. */
  appId: z.string(),
  platform: z.enum(['android', 'ios']),
  displayName: z.string(),
  capabilities: z.array(insertionCapabilitySchema),
  /** ISO date this entry was last verified on a real device. */
  lastVerifiedAt: z.string().nullable(),
  notes: z.string().default(''),
});
export type CompatibilityEntry = z.infer<typeof compatibilityEntrySchema>;

export const compatibilityRegistrySchema = z.object({
  version: z.number().int(),
  updatedAt: z.string(),
  entries: z.array(compatibilityEntrySchema),
});
export type CompatibilityRegistry = z.infer<typeof compatibilityRegistrySchema>;

/** Choose the best delivery method given target capabilities and emote kind. */
export function selectInsertionMethod(
  capabilities: InsertionCapability[],
  animated: boolean,
): InsertionCapability {
  const order: InsertionCapability[] = animated
    ? ['direct_animated_webp', 'direct_animated_gif', 'clipboard_animated', 'share_sheet']
    : ['direct_static_image', 'clipboard_static', 'share_sheet'];
  for (const method of order) {
    if (capabilities.includes(method)) return method;
  }
  return capabilities.includes('share_sheet') ? 'share_sheet' : 'unsupported';
}
