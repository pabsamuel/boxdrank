import { z } from 'zod';

/**
 * A puppet is a small tree of SVG parts. Each part may rotate around a pivot,
 * driven by one pose axis (arm, lean, talk, bob). Puppets are authored in a
 * local coordinate box of `width` × `height` with y pointing down and the
 * feet on the bottom edge, so the stage can place them on its ground line.
 */

export const DRIVERS = ['none', 'arm', 'lean', 'talk', 'bob', 'arm-inverse'] as const;
export const DriverSchema = z.enum(DRIVERS);
export type Driver = z.infer<typeof DriverSchema>;

export const PuppetPartSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** SVG path data (`d`) in puppet-local coordinates. */
  d: z.string().min(1),
  fill: z.string(),
  opacity: z.number().min(0).max(1).optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  /** Rotation pivot in local coordinates; required when `driver` is set. */
  pivot: z.tuple([z.number(), z.number()]).optional(),
  /** Parent part id; the part inherits the parent's rotation. */
  parent: z.string().optional(),
  driver: DriverSchema.optional(),
  /** Degrees of rotation when the driver axis reads 1. */
  gain: z.number().optional(),
  /** Rotation applied before the driver, so rest poses can be authored. */
  rest: z.number().optional(),
});
export type PuppetPart = z.infer<typeof PuppetPartSchema>;

export const PuppetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    cultureId: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    /** Suggested karaoke colour for this character. */
    color: z.string(),
    /**
     * Where the puppeteer's rod holds the figure, in local coordinates. The whole
     * figure leans and swings around this point (a Karagöz hangs from the neck,
     * a glove puppet pivots at the wrist). Defaults to a point on the neck line.
     */
    rod: z.tuple([z.number(), z.number()]).optional(),
    premium: z.boolean().default(false),
    parts: z.array(PuppetPartSchema).min(1),
  })
  .superRefine((puppet, ctx) => {
    const ids = new Set(puppet.parts.map((p) => p.id));
    if (ids.size !== puppet.parts.length) {
      ctx.addIssue({ code: 'custom', path: ['parts'], message: 'duplicate part ids' });
    }
    puppet.parts.forEach((p, i) => {
      if (p.parent && !ids.has(p.parent)) {
        ctx.addIssue({
          code: 'custom',
          path: ['parts', i, 'parent'],
          message: `unknown parent ${p.parent}`,
        });
      }
      if (p.driver && p.driver !== 'none' && !p.pivot) {
        ctx.addIssue({
          code: 'custom',
          path: ['parts', i, 'pivot'],
          message: 'driven parts need a pivot',
        });
      }
      if (p.parent === p.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['parts', i, 'parent'],
          message: 'a part cannot be its own parent',
        });
      }
    });
  });
export type Puppet = z.infer<typeof PuppetSchema>;
export type PuppetInput = z.input<typeof PuppetSchema>;

/** The rod point, with a sensible default for rigs that do not declare one. */
export function rodPoint(puppet: Puppet): [number, number] {
  return puppet.rod ?? [puppet.width / 2, puppet.height * 0.34];
}

/** Order parts so every parent precedes its children (stable otherwise). */
export function orderParts(puppet: Puppet): PuppetPart[] {
  const byId = new Map(puppet.parts.map((p) => [p.id, p] as const));
  const depth = (p: PuppetPart, guard = 0): number =>
    p.parent && guard < 32 ? 1 + depth(byId.get(p.parent)!, guard + 1) : 0;
  return puppet.parts
    .map((p, i) => ({ p, i, d: depth(p) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.p);
}
