import { z } from 'zod';
import { GestureSchema, SeatIdSchema } from './protocol';

/**
 * A play is a script: characters (each bound to a seat and a puppet) and
 * sections of lines. Lines are short on purpose so speech recognition can
 * confirm them and children can read them along.
 */

export const LANGS = [
  'tr-TR',
  'en-GB',
  'en-US',
  'de-DE',
  'fr-FR',
  'it-IT',
  'id-ID',
  'ja-JP',
  'zh-CN',
] as const;
export const LangSchema = z.enum(LANGS);
export type Lang = z.infer<typeof LangSchema>;

export const PlayLineSchema = z.object({
  seat: SeatIdSchema,
  /** The spoken text, shown karaoke-style. Keep it under ~12 words. */
  text: z.string().trim().min(1).max(300),
  /** Stage direction shown small under the line; never spoken. */
  hint: z.string().trim().max(200).optional(),
  /** Puppet gesture the stage plays when this line starts. */
  gesture: GestureSchema.optional(),
  /** Sung lines (semai, gazel…) are matched leniently. */
  song: z.boolean().optional(),
});
export type PlayLine = z.infer<typeof PlayLineSchema>;

export const PlaySectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1),
  lines: z.array(PlayLineSchema).min(1),
});
export type PlaySection = z.infer<typeof PlaySectionSchema>;

export const PlayCharacterSchema = z.object({
  seat: SeatIdSchema,
  name: z.string().trim().min(1),
  puppetId: z.string(),
  /** CSS colour used for this character's name in the karaoke bar. */
  color: z.string().optional(),
  /** How the figure first appears in a section: walks in from the wing, or drops from above. */
  entrance: z.enum(['walk', 'drop']).optional(),
});
export type PlayCharacter = z.infer<typeof PlayCharacterSchema>;

export const PlaySchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    cultureId: z.string().regex(/^[a-z0-9-]+$/),
    lang: LangSchema,
    title: z.string().trim().min(1),
    subtitle: z.string().trim().optional(),
    summary: z.string().trim().min(1),
    /** e.g. "4+" */
    ageRange: z.string().optional(),
    durationMin: z.number().int().positive(),
    premium: z.boolean().default(false),
    /** Provenance note: which traditional play this adapts and why it is free to use. */
    source: z.string().trim().min(1),
    characters: z.array(PlayCharacterSchema).min(1),
    sections: z.array(PlaySectionSchema).min(1),
  })
  .superRefine((play, ctx) => {
    const seats = new Set<string>();
    play.characters.forEach((c, i) => {
      if (seats.has(c.seat)) {
        ctx.addIssue({
          code: 'custom',
          path: ['characters', i, 'seat'],
          message: `duplicate seat ${c.seat}`,
        });
      }
      seats.add(c.seat);
    });
    play.sections.forEach((s, si) => {
      s.lines.forEach((l, li) => {
        if (!seats.has(l.seat)) {
          ctx.addIssue({
            code: 'custom',
            path: ['sections', si, 'lines', li, 'seat'],
            message: `line seat ${l.seat} is not a character of this play`,
          });
        }
      });
    });
    const ids = new Set<string>();
    play.sections.forEach((s, si) => {
      if (ids.has(s.id))
        ctx.addIssue({
          code: 'custom',
          path: ['sections', si, 'id'],
          message: `duplicate section ${s.id}`,
        });
      ids.add(s.id);
    });
  });
export type Play = z.infer<typeof PlaySchema>;
export type PlayInput = z.input<typeof PlaySchema>;

export interface FlatLine {
  index: number;
  sectionIndex: number;
  sectionTitle: string;
  line: PlayLine;
}

/** Flatten sections into a single ordered list of lines. */
export function flattenLines(play: Play): FlatLine[] {
  const out: FlatLine[] = [];
  play.sections.forEach((section, sectionIndex) => {
    for (const line of section.lines) {
      out.push({ index: out.length, sectionIndex, sectionTitle: section.title, line });
    }
  });
  return out;
}

/**
 * Whether a character is on the screen at a line: from its first line in the
 * current section to the end of that section. Before that it waits in the wing.
 */
export function onStageAt(lines: FlatLine[], seat: string, lineIndex: number): boolean {
  const here = lines[lineIndex];
  if (!here) return true;
  for (let i = lineIndex; i >= 0; i--) {
    const l = lines[i]!;
    if (l.sectionIndex !== here.sectionIndex) return false;
    if (l.line.seat === seat) return true;
  }
  return false;
}

export function countLines(play: Play): number {
  return play.sections.reduce((n, s) => n + s.lines.length, 0);
}

/** Estimated running time: lines × ~7 seconds, rounded up to whole minutes. */
export function estimateDurationMin(play: Play): number {
  return Math.max(1, Math.ceil((countLines(play) * 7) / 60));
}

/** Words per line, used by the content metric "lines short enough for kids". */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
