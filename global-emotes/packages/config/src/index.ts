import { z } from 'zod';

/**
 * Central typed configuration. The brand name is deliberately config-driven so
 * the provisional product name can be changed globally without a code sweep.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BRAND_NAME: z.string().min(1).default('Global Emotes'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),

  DATABASE_URL: z
    .string()
    .default('postgres://globalemotes:localdev@localhost:5432/globalemotes'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  SESSION_SECRET: z.string().min(32).default('dev-session-secret-change-me-please-0000'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, '32-byte hex key required')
    .default('0'.repeat(64)),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default('localdev'),
  S3_SECRET_ACCESS_KEY: z.string().default('localdev123'),
  S3_BUCKET_ORIGINALS: z.string().default('emote-originals'),
  S3_BUCKET_PROCESSED: z.string().default('emote-processed'),
  S3_BUCKET_QUARANTINE: z.string().default('uploads-quarantine'),
  ASSET_CDN_URL: z.string().default('http://localhost:9000/emote-processed'),

  EMAIL_PROVIDER: z.enum(['smtp', 'resend', 'console']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  EMAIL_FROM: z.string().default('no-reply@localhost'),

  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),

  TWITCH_CLIENT_ID: z.string().default(''),
  TWITCH_CLIENT_SECRET: z.string().default(''),
  TWITCH_EVENTSUB_SECRET: z.string().default(''),
  DISCORD_CLIENT_ID: z.string().default(''),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_BOT_TOKEN: z.string().default(''),
  PATREON_CLIENT_ID: z.string().default(''),
  PATREON_CLIENT_SECRET: z.string().default(''),
  TELEGRAM_BOT_TOKEN: z.string().default(''),

  SENTRY_DSN: z.string().default(''),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  API_PORT: z.coerce.number().default(3001),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

/** Parse and validate process.env once. Throws with a readable message on invalid config. */
export function loadEnv(overrides: Partial<Record<keyof AppEnv, string>> = {}): AppEnv {
  if (cached && Object.keys(overrides).length === 0) return cached;
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  if (Object.keys(overrides).length === 0) cached = parsed.data;
  return parsed.data;
}

/** For tests. */
export function resetEnvCache(): void {
  cached = null;
}

// ── Plans and limits (config-driven per master spec §19) ──────────────────────

export type CreatorPlan = 'creator_free' | 'creator_pro' | 'creator_business';
export type FanPlan = 'fan_free' | 'fan_plus';

export interface CreatorPlanLimits {
  maxProviderConnections: number;
  maxPacks: number;
  maxEmotes: number;
  animatedAllowed: boolean;
  teamMembersAllowed: boolean;
  maxTeamMembers: number;
  scheduledReleases: boolean;
  advancedAnalytics: boolean;
  maxAccessCodesPerBatch: number;
}

export const CREATOR_PLAN_LIMITS: Record<CreatorPlan, CreatorPlanLimits> = {
  creator_free: {
    maxProviderConnections: 1,
    maxPacks: 3,
    maxEmotes: 30,
    animatedAllowed: false,
    teamMembersAllowed: false,
    maxTeamMembers: 0,
    scheduledReleases: false,
    advancedAnalytics: false,
    maxAccessCodesPerBatch: 25,
  },
  creator_pro: {
    maxProviderConnections: 10,
    maxPacks: 50,
    maxEmotes: 1000,
    animatedAllowed: true,
    teamMembersAllowed: true,
    maxTeamMembers: 5,
    scheduledReleases: true,
    advancedAnalytics: true,
    maxAccessCodesPerBatch: 1000,
  },
  creator_business: {
    maxProviderConnections: 25,
    maxPacks: 200,
    maxEmotes: 5000,
    animatedAllowed: true,
    teamMembersAllowed: true,
    maxTeamMembers: 25,
    scheduledReleases: true,
    advancedAnalytics: true,
    maxAccessCodesPerBatch: 10000,
  },
};

export interface FanPlanLimits {
  maxFavorites: number;
  maxRecents: number;
  customFolders: boolean;
  crossDeviceSync: boolean;
  personalPacks: boolean;
}

export const FAN_PLAN_LIMITS: Record<FanPlan, FanPlanLimits> = {
  fan_free: {
    maxFavorites: 50,
    maxRecents: 30,
    customFolders: false,
    crossDeviceSync: false,
    personalPacks: false,
  },
  fan_plus: {
    maxFavorites: 1000,
    maxRecents: 200,
    customFolders: true,
    crossDeviceSync: true,
    personalPacks: true,
  },
};

/** Placeholder prices in USD minor units; real prices live in Stripe price objects. */
export const PLAN_PRICING = {
  fan_plus: { monthly: 399, annual: 2999 },
  creator_pro: { monthly: 1200, annual: 9900 },
  creator_business: { monthly: 4900, annual: 49900 },
} as const;

// ── Asset limits (config-driven per master spec §11/§29) ─────────────────────

export const ASSET_LIMITS = {
  maxUploadBytes: 2 * 1024 * 1024,
  maxDimension: 1024,
  minDimension: 32,
  maxAnimationFrames: 120,
  maxAnimationDurationMs: 10_000,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const,
} as const;

// ── Entitlement grace periods per provider (hours) ───────────────────────────

export const GRACE_PERIOD_HOURS: Record<string, number> = {
  default: 72,
  twitch: 72,
  discord: 24,
  patreon: 120, // patreon billing cycles are monthly and lag
  youtube: 72,
  access_code: 0,
  billing: 72,
};

// ── Feature flag defaults (server-controlled overrides live in DB) ───────────

export const FEATURE_FLAG_DEFAULTS: Record<string, boolean> = {
  provider_twitch: true,
  provider_discord: true,
  provider_patreon: false,
  provider_youtube: false,
  provider_kick: false,
  provider_generic_webhook: false,
  animated_emotes: true,
  marketplace: false,
  creator_payouts: false,
  fan_plus: false,
  telegram_export: true,
  whatsapp_export: false,
  browser_extension: false,
};
