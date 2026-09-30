import { z } from 'zod';

/**
 * A puppet is a small tree of SVG parts. Each part may rotate around a pivot,
 * driven by one pose axis (arm, lean, talk, bob). Puppets are authored in a
 * local coordinate box of `width` × `height` with y pointing down and the
 * feet on the bottom edge, so the stage can place them on its ground line.
 */

export const DRIVERS = [
  'none',
  'arm',
  'lean',
  'talk',
  'bob',
  'arm-inverse',
  'stride',
  'stride-inverse',
] as const;
export const DriverSchema = z.enum(DRIVERS);
export type Driver = z.infer<typeof DriverSchema>;

export const PointSchema = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof PointSchema>;

export const PuppetPartSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** SVG path data (`d`) in puppet-local coordinates (vector parts). */
  d: z.string().min(1).optional(),
  /**
   * For raster puppets: the region of the puppet's image this part shows, in
   * local coordinates. Children's regions are cut out of their parent's.
   */
  polygon: z.array(PointSchema).min(3).optional(),
  /**
   * A separate image for this part, drawn in the same box as the puppet's
   * image. A part with its own image is a layer on top of its parent (nothing
   * is cut out of the parent), like a leather arm pinned over a complete coat.
   */
  image: z.string().max(1_500_000).optional(),
  fill: z.string().optional(),
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
    id: z.string().regex(/^[a-z0-9:-]+$/),
    cultureId: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(1),
    description: z.string().trim().min(1),
    width: z.number().positive(),
    height: z.number().positive(),
    /**
     * Raster puppets: a URL or data URL of the artwork (transparent PNG/WebP)
     * drawn into the width × height box. Parts then use `polygon`.
     */
    image: z.string().max(1_500_000).optional(),
    /**
     * Optional painted artwork for a vector puppet: used instead of `parts`
     * once its image has loaded, so packs work before the art files exist.
     */
    art: z
      .object({
        image: z.string().max(1_500_000),
        width: z.number().positive(),
        height: z.number().positive(),
        rod: PointSchema.optional(),
        parts: z.array(z.lazy(() => PuppetPartSchema)).min(1),
      })
      .optional(),
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
      if (!p.d && !p.polygon) {
        ctx.addIssue({
          code: 'custom',
          path: ['parts', i],
          message: 'a part needs path data or a polygon',
        });
      }
      if (p.polygon && !puppet.image) {
        ctx.addIssue({
          code: 'custom',
          path: ['parts', i, 'polygon'],
          message: 'polygon parts need a puppet image',
        });
      }
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

/** Puppets a family made themselves carry this prefix; they travel with the phone. */
export const CUSTOM_PUPPET_PREFIX = 'custom:';

export function isCustomPuppet(id: string): boolean {
  return id.startsWith(CUSTOM_PUPPET_PREFIX);
}

/** Polygon → SVG path data. */
export function polygonPath(points: Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';
}

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
