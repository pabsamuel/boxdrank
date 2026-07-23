import type { ExternalEntitlement, ProviderCapabilities } from '@global-emotes/contracts';
import {
  ProviderError,
  type AuthorizationCallbackInput,
  type AuthorizationInput,
  type CreatorVerificationResult,
  type FanEntitlementSyncInput,
  type FetchFn,
  type ProviderAdapter,
  type ProviderContext,
  type ProviderHealth,
  type ProviderIdentity,
  type ProviderMetadata,
  type RefreshTokenInput,
  type RevokeConnectionInput,
  type TokenSet,
  type VerifyCreatorInput,
} from '../types';
import { providerFetch } from '../http';

const API = 'https://discord.com/api/v10';

export interface DiscordAdapterOptions {
  clientId: string;
  clientSecret: string;
  botToken: string;
  fetchFn?: FetchFn;
  now?: () => Date;
}

/**
 * Discord role-based entitlements. Fans authorize `identify guilds.members.read`;
 * the adapter reads the fan's member object in the creator's guild and emits one
 * evidence item per role. The creator's guild is verified via bot membership or
 * the creator's own OAuth (`guilds` scope, owner/manage check).
 */
export class DiscordAdapter implements ProviderAdapter {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(private readonly options: DiscordAdapterOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  metadata(): ProviderMetadata {
    return {
      id: 'discord',
      name: 'Discord',
      authorizationKind: 'oauth',
      fanScopes: ['identify', 'guilds', 'guilds.members.read'],
      creatorScopes: ['identify', 'guilds'],
    };
  }

  capabilities(): ProviderCapabilities {
    return {
      oauth: true,
      creatorIdentity: true,
      fanIdentity: true,
      fanMembershipVerification: true,
      creatorMemberList: false, // requires bot + privileged intent; polling per-fan instead
      tierAccess: true, // roles as tiers
      emoteImport: false,
      webhooks: false, // gateway events need a persistent bot; polling at v1
      pollingRequired: true,
      approvalRequired: false,
      status: this.configured ? 'production_ready' : 'credentials_required',
      notes: 'Roles are the entitlement primitive. Fan-side self-serve via guilds.members.read.',
    };
  }

  private get configured(): boolean {
    return this.options.clientId.length > 0 && this.options.clientSecret.length > 0;
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ProviderError('not_configured', 'Discord credentials are not configured');
    }
  }

  async getAuthorizationUrl(input: AuthorizationInput): Promise<string> {
    this.assertConfigured();
    const scopes = input.role === 'creator' ? this.metadata().creatorScopes : this.metadata().fanScopes;
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: input.state,
      prompt: 'consent',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: AuthorizationCallbackInput): Promise<TokenSet> {
    this.assertConfigured();
    return this.tokenRequest(
      new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
      }),
    );
  }

  async refreshToken(input: RefreshTokenInput): Promise<TokenSet> {
    this.assertConfigured();
    return this.tokenRequest(
      new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: input.refreshToken,
      }),
    );
  }

  private async tokenRequest(body: URLSearchParams): Promise<TokenSet> {
    const json = await providerFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(this.fetchFn, `${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: json.expires_in ? new Date(this.now().getTime() + json.expires_in * 1000) : null,
      scopes: json.scope?.split(' ') ?? [],
    };
  }

  async revokeConnection(input: RevokeConnectionInput): Promise<void> {
    this.assertConfigured();
    await this.fetchFn(`${API}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        token: input.accessToken,
      }).toString(),
    });
  }

  async fetchIdentity(context: ProviderContext): Promise<ProviderIdentity> {
    const user = await providerFetch<{
      id: string;
      username: string;
      global_name?: string;
      avatar?: string;
    }>(this.fetchFn, `${API}/users/@me`, {
      headers: { authorization: `Bearer ${context.accessToken}` },
    });
    return {
      externalAccountId: user.id,
      displayName: user.global_name ?? user.username,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
      email: null,
    };
  }

  /** Creator verifies guild ownership: their OAuth guild list must show owner/admin. */
  async verifyCreatorOwnership(input: VerifyCreatorInput): Promise<CreatorVerificationResult> {
    const guilds = await providerFetch<
      Array<{ id: string; name: string; owner: boolean; permissions: string }>
    >(this.fetchFn, `${API}/users/@me/guilds`, {
      headers: { authorization: `Bearer ${input.context.accessToken}` },
    });
    const claimed = input.claimedExternalAccountId;
    const MANAGE_GUILD = 0x20n;
    const match = guilds.find(
      (g) =>
        g.id === claimed && (g.owner || (BigInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD),
    );
    return {
      verified: Boolean(match),
      externalAccountId: claimed ?? '',
      evidence: match ? { guildName: match.name, owner: match.owner } : { reason: 'not_owner_or_manager' },
    };
  }

  /** One evidence item per (guild, role) the fan holds; inactive item when no roles match. */
  async syncFanEntitlements(input: FanEntitlementSyncInput): Promise<ExternalEntitlement[]> {
    const results: ExternalEntitlement[] = [];
    for (const target of input.targets) {
      const guildId = target.externalCreatorAccountId;
      let roles: string[] = [];
      let isMember = true;
      try {
        const member = await providerFetch<{ roles: string[] }>(
          this.fetchFn,
          `${API}/users/@me/guilds/${encodeURIComponent(guildId)}/member`,
          { headers: { authorization: `Bearer ${input.context.accessToken}` } },
        );
        roles = member.roles;
      } catch (err) {
        if (err instanceof ProviderError && err.kind === 'not_found') {
          isMember = false;
        } else {
          throw err;
        }
      }
      const observedAt = this.now().toISOString();
      if (!isMember || roles.length === 0) {
        results.push({
          providerId: 'discord',
          externalFanAccountId: input.externalFanAccountId,
          externalCreatorAccountId: guildId,
          kind: 'discord_role',
          tier: null,
          externalRef: `discord-member:${guildId}:${input.externalFanAccountId}`,
          observedAt,
          expiresAt: null,
          active: false,
          raw: { guildId },
        });
        continue;
      }
      for (const roleId of roles) {
        results.push({
          providerId: 'discord',
          externalFanAccountId: input.externalFanAccountId,
          externalCreatorAccountId: guildId,
          kind: 'discord_role',
          tier: roleId,
          externalRef: `discord-role:${guildId}:${input.externalFanAccountId}:${roleId}`,
          observedAt,
          expiresAt: null,
          active: true,
          raw: { guildId },
        });
      }
    }
    return results;
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.configured) return { ok: false, status: 'credentials_required', checkedAt };
    return { ok: true, status: 'configured', checkedAt };
  }
}
