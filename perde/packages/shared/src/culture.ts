import { z } from 'zod';
import { LangSchema } from './play';
import type { Play } from './play';
import type { Puppet } from './puppet';

/**
 * A culture pack bundles one puppet tradition: its puppets, its plays, and
 * how its stage should look. Packs are data; adding one never touches app code.
 */

export const LocalizedSchema = z.object({ tr: z.string().min(1), en: z.string().min(1) });
export type Localized = z.infer<typeof LocalizedSchema>;

export const StageLookSchema = z.object({
  /** How the screen is lit and framed. */
  kind: z.enum(['shadow-screen', 'booth', 'paper-screen']),
  /** CSS colours. */
  backdrop: z.string(),
  glow: z.string(),
  ground: z.string(),
  text: z.string(),
  /** Puppets on a shadow screen are translucent; booth puppets are opaque. */
  puppetOpacity: z.number().min(0).max(1),
  blur: z.number().min(0).max(4),
});

export const CultureSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: LocalizedSchema,
  /** The tradition's own name, e.g. "Karagöz ve Hacivat", "Punch and Judy". */
  tradition: z.string().min(1),
  region: z.string().min(1),
  lang: LangSchema,
  description: LocalizedSchema,
  /** Short respectful note on origins, shown in the lobby. */
  heritage: LocalizedSchema,
  stage: StageLookSchema,
  /** Default seats offered on the lobby screen, in order. */
  defaultSeats: z
    .array(z.object({ seat: z.string(), puppetId: z.string(), name: z.string() }))
    .min(1),
  premium: z.boolean().default(false),
});
export type Culture = z.infer<typeof CultureSchema>;
export type CultureInput = z.input<typeof CultureSchema>;

export interface CulturePack {
  culture: Culture;
  puppets: Puppet[];
  plays: Play[];
}

export function pickLocalized(l: Localized, uiLang: string): string {
  return uiLang.startsWith('tr') ? l.tr : l.en;
}
