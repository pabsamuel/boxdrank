import type { CulturePack, PlayInput } from '@perde/shared';
import { CultureSchema, PlaySchema, PuppetSchema } from '@perde/shared';
import { cultureTr } from './culture';
import { trPuppets } from './puppets';
import { giris } from './plays/giris';
import { salincak } from './plays/salincak';
import { kayik } from './plays/kayik';
import { eczahane } from './plays/eczahane';

export const trPlays: PlayInput[] = [giris, salincak, kayik, eczahane];

export const packTr: CulturePack = {
  culture: CultureSchema.parse(cultureTr),
  puppets: trPuppets.map((p) => PuppetSchema.parse(p)),
  plays: trPlays.map((p) => PlaySchema.parse(p)),
};
