import type { CulturePack, PlayInput } from '@perde/shared';
import { CultureSchema, PlaySchema, PuppetSchema } from '@perde/shared';
import { cultureEn } from './culture';
import { enPuppets } from './puppets';
import { sausages } from './plays/sausages';

export const enPlays: PlayInput[] = [sausages];

export const packEn: CulturePack = {
  culture: CultureSchema.parse(cultureEn),
  puppets: enPuppets.map((p) => PuppetSchema.parse(p)),
  plays: enPlays.map((p) => PlaySchema.parse(p)),
};
