import { FEATURE_FLAG_DEFAULTS } from '@global-emotes/config';
import * as schema from './schema/index';

type AnyDb = {
  insert: (table: unknown) => {
    values: (v: unknown) => { onConflictDoNothing: () => Promise<unknown> };
  };
};

/**
 * Idempotent demo seed shared by dev (`pnpm db:seed`) and tests.
 * Creates: providers, feature flags, a demo creator with a published pack and
 * entitlement rules, a demo fan, an access code, and billing products.
 */
export async function seed(db: AnyDb): Promise<{
  creatorUserId: string;
  fanUserId: string;
  creatorId: string;
  packId: string;
  publicPackId: string;
  accessCode: string;
  tierRuleId: string;
  publicRuleId: string;
  codeRuleId: string;
}> {
  const ids = {
    creatorUserId: '00000000-0000-4000-8000-000000000001',
    fanUserId: '00000000-0000-4000-8000-000000000002',
    adminUserId: '00000000-0000-4000-8000-000000000003',
    creatorId: '00000000-0000-4000-8000-000000000101',
    packId: '00000000-0000-4000-8000-000000000201',
    publicPackId: '00000000-0000-4000-8000-000000000202',
    emote1: '00000000-0000-4000-8000-000000000301',
    emote2: '00000000-0000-4000-8000-000000000302',
    emote3: '00000000-0000-4000-8000-000000000303',
    tierRuleId: '00000000-0000-4000-8000-000000000401',
    publicRuleId: '00000000-0000-4000-8000-000000000402',
    codeRuleId: '00000000-0000-4000-8000-000000000403',
    codeId: '00000000-0000-4000-8000-000000000501',
  } as const;
  const accessCode = 'DEMO-UNLOCK-2026';

  const providerRows = [
    { id: 'mock', name: 'Mock Provider', status: 'production_ready', enabled: true },
    { id: 'twitch', name: 'Twitch', status: 'credentials_required', enabled: true },
    { id: 'discord', name: 'Discord', status: 'credentials_required', enabled: true },
    { id: 'patreon', name: 'Patreon', status: 'credentials_required', enabled: false },
    { id: 'youtube', name: 'YouTube', status: 'approval_required', enabled: false },
    { id: 'kick', name: 'Kick', status: 'research_required', enabled: false },
    { id: 'access_code', name: 'Access Codes', status: 'production_ready', enabled: true },
    {
      id: 'generic_webhook',
      name: 'Partner Webhooks',
      status: 'production_ready',
      enabled: false,
    },
  ];
  await db.insert(schema.providers).values(providerRows).onConflictDoNothing();

  await db
    .insert(schema.featureFlags)
    .values(
      Object.entries(FEATURE_FLAG_DEFAULTS).map(([key, enabled]) => ({
        key,
        enabled,
        description: `Default from config`,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(schema.users)
    .values([
      {
        id: ids.creatorUserId,
        primaryEmail: 'creator@demo.local',
        displayName: 'Demo Creator',
      },
      { id: ids.fanUserId, primaryEmail: 'fan@demo.local', displayName: 'Demo Fan' },
      {
        id: ids.adminUserId,
        primaryEmail: 'admin@demo.local',
        displayName: 'Demo Admin',
        adminRole: 'super_admin',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.creatorProfiles)
    .values({
      id: ids.creatorId,
      userId: ids.creatorUserId,
      handle: 'demo-creator',
      displayName: 'Demo Creator',
      bio: 'Seed creator for local development',
      plan: 'creator_pro',
    })
    .onConflictDoNothing();

  await db
    .insert(schema.externalCreatorAccounts)
    .values({
      creatorId: ids.creatorId,
      providerId: 'mock',
      externalAccountId: 'mock-broadcaster-1',
    })
    .onConflictDoNothing();

  await db
    .insert(schema.emotePacks)
    .values([
      {
        id: ids.packId,
        creatorId: ids.creatorId,
        slug: 'subscriber-pack',
        name: 'Subscriber Pack',
        description: 'Unlocked by tier-1 membership on the mock provider, or an access code.',
        visibility: 'published',
        publishedAt: new Date(),
      },
      {
        id: ids.publicPackId,
        creatorId: ids.creatorId,
        slug: 'free-pack',
        name: 'Free Pack',
        description: 'Public starter pack — no membership required.',
        visibility: 'published',
        publishedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.emotes)
    .values([
      {
        id: ids.emote1,
        creatorId: ids.creatorId,
        name: 'Hype',
        shortcode: 'demoHype',
        status: 'active',
        contentHash: 'seed-hash-1',
      },
      {
        id: ids.emote2,
        creatorId: ids.creatorId,
        name: 'Love',
        shortcode: 'demoLove',
        status: 'active',
        contentHash: 'seed-hash-2',
      },
      {
        id: ids.emote3,
        creatorId: ids.creatorId,
        name: 'Wave',
        shortcode: 'demoWave',
        status: 'active',
        contentHash: 'seed-hash-3',
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.emotePackItems)
    .values([
      { packId: ids.packId, emoteId: ids.emote1, position: 0 },
      { packId: ids.packId, emoteId: ids.emote2, position: 1 },
      { packId: ids.publicPackId, emoteId: ids.emote3, position: 0 },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.entitlementRules)
    .values([
      {
        id: ids.tierRuleId,
        packId: ids.packId,
        kind: 'tier',
        providerId: 'mock',
        config: { tiers: ['tier1', 'tier2', 'tier3'] },
      },
      { id: ids.codeRuleId, packId: ids.packId, kind: 'access_code', providerId: 'access_code' },
      { id: ids.publicRuleId, packId: ids.publicPackId, kind: 'public', providerId: null },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.accessCodes)
    .values({
      id: ids.codeId,
      creatorId: ids.creatorId,
      packId: ids.packId,
      code: accessCode,
      maxRedemptions: 100,
      createdBy: ids.creatorUserId,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.products)
    .values([
      { key: 'fan_plus', name: 'Fan Plus' },
      { key: 'creator_pro', name: 'Creator Pro' },
      { key: 'creator_business', name: 'Creator Business' },
    ])
    .onConflictDoNothing();

  return {
    creatorUserId: ids.creatorUserId,
    fanUserId: ids.fanUserId,
    creatorId: ids.creatorId,
    packId: ids.packId,
    publicPackId: ids.publicPackId,
    accessCode,
    tierRuleId: ids.tierRuleId,
    publicRuleId: ids.publicRuleId,
    codeRuleId: ids.codeRuleId,
  };
}
