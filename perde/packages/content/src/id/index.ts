import type { CulturePack, PlayInput } from '@perde/shared';
import { CultureSchema, PlaySchema, PuppetSchema } from '@perde/shared';
import { cultureId } from './culture';
import { idPuppets } from './puppets';
import { cincin } from './plays/cincin';

export const idPlays: PlayInput[] = [cincin];

export const packId: CulturePack = {
  culture: CultureSchema.parse(cultureId),
  puppets: idPuppets.map((p) => PuppetSchema.parse(p)),
  plays: idPlays.map((p) => PlaySchema.parse(p)),
};
