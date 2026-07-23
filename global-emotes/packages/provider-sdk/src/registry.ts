import type { AppEnv } from '@global-emotes/config';
import type { ProviderId } from '@global-emotes/contracts';
import type { ProviderAdapter } from './types';
import { MockAdapter } from './adapters/mock';
import { TwitchAdapter } from './adapters/twitch';
import { DiscordAdapter } from './adapters/discord';
import { AccessCodeAdapter } from './adapters/access-code';
import { PlaceholderAdapter } from './adapters/placeholders';

export interface ProviderRegistry {
  get(id: ProviderId): ProviderAdapter;
  all(): Array<{ id: ProviderId; adapter: ProviderAdapter }>;
  /** The shared mock instance, exposed for dev tooling and tests. */
  mock: MockAdapter;
}

export function createProviderRegistry(env: AppEnv): ProviderRegistry {
  const mock = new MockAdapter();
  const adapters: Record<ProviderId, ProviderAdapter> = {
    mock,
    twitch: new TwitchAdapter({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      eventSubSecret: env.TWITCH_EVENTSUB_SECRET,
    }),
    discord: new DiscordAdapter({
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      botToken: env.DISCORD_BOT_TOKEN,
    }),
    access_code: new AccessCodeAdapter(),
    patreon: new PlaceholderAdapter(
      'patreon',
      'Patreon',
      'credentials_required',
      'API v2 membership design documented (docs/integrations/PATREON.md); enable after credentials.',
    ),
    youtube: new PlaceholderAdapter(
      'youtube',
      'YouTube',
      'approval_required',
      'Channel Memberships API is allowlist-gated and creator-authorized only.',
    ),
    kick: new PlaceholderAdapter(
      'kick',
      'Kick',
      'research_required',
      'Official subscription-verification capability unconfirmed; no scraping.',
    ),
    generic_webhook: new PlaceholderAdapter(
      'generic_webhook',
      'Partner Webhooks',
      'production_ready',
      'HMAC-signed partner entitlement events; enable per-partner via feature flag.',
    ),
  };
  return {
    get: (id) => {
      const adapter = adapters[id];
      if (!adapter) throw new Error(`unknown provider: ${id}`);
      return adapter;
    },
    all: () =>
      (Object.entries(adapters) as Array<[ProviderId, ProviderAdapter]>).map(([id, adapter]) => ({
        id,
        adapter,
      })),
    mock,
  };
}
