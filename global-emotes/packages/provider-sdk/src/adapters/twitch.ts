import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ExternalEntitlement, ProviderCapabilities } from '@global-emotes/contracts';
import {
  ProviderError,
  type AuthorizationCallbackInput,
  type AuthorizationInput,
  type CreatorVerificationResult,
  type FanEntitlementSyncInput,
  type FetchFn,
  type ImportEmotesInput,
  type ImportedEmote,
  type NormalizedProviderEvent,
  type ProviderAdapter,
  type ProviderContext,
  type ProviderHealth,
  type ProviderIdentity,
  type ProviderMetadata,
  type RefreshTokenInput,
  type RevokeConnectionInput,
  type TokenSet,
  type VerifyCreatorInput,
  type WebhookInput,
} from '../types';
import { providerFetch } from '../http';

const AUTH_BASE = 'https://id.twitch.tv/oauth2';
const HELIX = 'https://api.twitch.tv/helix';

export interface TwitchAdapterOptions {
  clientId: string;
  clientSecret: string;
  eventSubSecret: string;
  fetchFn?: FetchFn;
  /** Injectable clock for webhook replay-window tests. */
  now?: () => Date;
}

interface HelixEnvelope<T> {
  data: T[];
}

/**
 * Twitch reference adapter. Endpoints and scopes follow the official Helix API:
 *  - fan-side sub check: GET /subscriptions/user (scope user:read:subscriptions)
 *  - creator-side list:  GET /subscriptions (scope channel:read:subscriptions)
 *  - channel emotes:     GET /chat/emotes (creator-authorized import)
 *  - EventSub webhooks:  HMAC-SHA256(id + timestamp + body), 10-minute replay window
 * Re-verify against current Twitch docs when credentials are configured.
 */
export class TwitchAdapter implements ProviderAdapter {
  private readonly fetchFn: FetchFn;
  private readonly now: () => Date;

  constructor(private readonly options: TwitchAdapterOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  metadata(): ProviderMetadata {
    return {
      id: 'twitch',
      name: 'Twitch',
      authorizationKind: 'oauth',
      fanScopes: ['user:read:subscriptions'],
      creatorScopes: ['channel:read:subscriptions'],
    };
  }

  capabilities(): ProviderCapabilities {
    return {
      oauth: true,
      creatorIdentity: true,
      fanIdentity: true,
      fanMembershipVerification: true,
      creatorMemberList: true,
      tierAccess: true,
      emoteImport: true,
      webhooks: true,
      pollingRequired: false,
      approvalRequired: false,
      status: this.configured ? 'production_ready' : 'credentials_required',
      notes: 'Fan-side self-serve sub verification via user:read:subscriptions.',
    };
  }

  private get configured(): boolean {
    return this.options.clientId.length > 0 && this.options.clientSecret.length > 0;
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ProviderError('not_configured', 'Twitch credentials are not configured');
    }
  }

  async getAuthorizationUrl(input: AuthorizationInput): Promise<string> {
    this.assertConfigured();
    const scopes =
      input.role === 'creator' ? this.metadata().creatorScopes : this.metadata().fanScopes;
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: input.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state: input.state,
    });
    return `${AUTH_BASE}/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: AuthorizationCallbackInput): Promise<TokenSet> {
    this.assertConfigured();
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    });
    return this.tokenRequest(body);
  }

  async refreshToken(input: RefreshTokenInput): Promise<TokenSet> {
    this.assertConfigured();
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    });
    return this.tokenRequest(body);
  }

  private async tokenRequest(body: URLSearchParams): Promise<TokenSet> {
    const json = await providerFetch<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string[];
    }>(this.fetchFn, `${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: json.expires_in ? new Date(this.now().getTime() + json.expires_in * 1000) : null,
      scopes: json.scope ?? [],
    };
  }

  async revokeConnection(input: RevokeConnectionInput): Promise<void> {
    this.assertConfigured();
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      token: input.accessToken,
    });
    await this.fetchFn(`${AUTH_BASE}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  }

  private helixHeaders(context: ProviderContext): Record<string, string> {
    return {
      authorization: `Bearer ${context.accessToken}`,
      'client-id': this.options.clientId,
    };
  }

  async fetchIdentity(context: ProviderContext): Promise<ProviderIdentity> {
    const json = await providerFetch<
      HelixEnvelope<{ id: string; display_name: string; profile_image_url: string; email?: string }>
    >(this.fetchFn, `${HELIX}/users`, { headers: this.helixHeaders(context) });
    const user = json.data[0];
    if (!user) throw new ProviderError('invalid_response', 'no user in /users response');
    return {
      externalAccountId: user.id,
      displayName: user.display_name,
      avatarUrl: user.profile_image_url,
      email: user.email ?? null,
    };
  }

  async verifyCreatorOwnership(input: VerifyCreatorInput): Promise<CreatorVerificationResult> {
    // Ownership = the authenticated account IS the claimed channel.
    const identity = await this.fetchIdentity(input.context);
    const verified =
      !input.claimedExternalAccountId ||
      identity.externalAccountId === input.claimedExternalAccountId;
    return {
      verified,
      externalAccountId: identity.externalAccountId,
      evidence: { method: 'oauth_self', displayName: identity.displayName },
    };
  }

  /** Fan-side self-serve sub verification — the launch-wedge capability. */
  async syncFanEntitlements(input: FanEntitlementSyncInput): Promise<ExternalEntitlement[]> {
    const results: ExternalEntitlement[] = [];
    for (const target of input.targets) {
      const url = `${HELIX}/subscriptions/user?broadcaster_id=${encodeURIComponent(
        target.externalCreatorAccountId,
      )}&user_id=${encodeURIComponent(input.externalFanAccountId)}`;
      try {
        const json = await providerFetch<
          HelixEnvelope<{ broadcaster_id: string; tier: string; is_gift: boolean }>
        >(this.fetchFn, url, { headers: this.helixHeaders(input.context) });
        const sub = json.data[0];
        results.push({
          providerId: 'twitch',
          externalFanAccountId: input.externalFanAccountId,
          externalCreatorAccountId: target.externalCreatorAccountId,
          kind: 'tier',
          tier: sub ? sub.tier : null,
          externalRef: `twitch-sub:${target.externalCreatorAccountId}:${input.externalFanAccountId}`,
          observedAt: this.now().toISOString(),
          expiresAt: null,
          active: Boolean(sub),
          raw: sub ? { isGift: sub.is_gift } : {},
        });
      } catch (err) {
        // Helix returns 404 when the user has no sub — that's negative evidence, not an error.
        if (err instanceof ProviderError && err.kind === 'not_found') {
          results.push({
            providerId: 'twitch',
            externalFanAccountId: input.externalFanAccountId,
            externalCreatorAccountId: target.externalCreatorAccountId,
            kind: 'tier',
            tier: null,
            externalRef: `twitch-sub:${target.externalCreatorAccountId}:${input.externalFanAccountId}`,
            observedAt: this.now().toISOString(),
            expiresAt: null,
            active: false,
          });
        } else {
          throw err;
        }
      }
    }
    return results;
  }

  async importCreatorEmotes(input: ImportEmotesInput): Promise<ImportedEmote[]> {
    const json = await providerFetch<
      HelixEnvelope<{
        id: string;
        name: string;
        images: { url_4x?: string; url_2x?: string; url_1x: string };
        format: string[];
      }> & { template: string }
    >(
      this.fetchFn,
      `${HELIX}/chat/emotes?broadcaster_id=${encodeURIComponent(input.externalCreatorAccountId)}`,
      { headers: this.helixHeaders(input.context) },
    );
    return json.data.map((e) => ({
      externalId: e.id,
      name: e.name,
      imageUrl: e.images.url_4x ?? e.images.url_2x ?? e.images.url_1x,
      animated: e.format.includes('animated'),
    }));
  }

  /**
   * EventSub webhook verification + normalization.
   * Signature: sha256=HMAC(secret, messageId + timestamp + rawBody).
   */
  async handleWebhook(input: WebhookInput): Promise<NormalizedProviderEvent[]> {
    const messageId = input.headers['twitch-eventsub-message-id'];
    const timestamp = input.headers['twitch-eventsub-message-timestamp'];
    const signature = input.headers['twitch-eventsub-message-signature'];
    const messageType = input.headers['twitch-eventsub-message-type'];
    if (!messageId || !timestamp || !signature) {
      throw new ProviderError('webhook_invalid_signature', 'missing EventSub headers');
    }

    const expected =
      'sha256=' +
      createHmac('sha256', this.options.eventSubSecret)
        .update(messageId + timestamp + input.rawBody)
        .digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new ProviderError('webhook_invalid_signature', 'EventSub signature mismatch');
    }

    // Replay protection: reject messages older than 10 minutes (Twitch guidance).
    const age = this.now().getTime() - new Date(timestamp).getTime();
    if (Number.isNaN(age) || age > 10 * 60_000) {
      throw new ProviderError('webhook_replay', 'EventSub message outside replay window');
    }

    const body = JSON.parse(input.rawBody) as {
      challenge?: string;
      subscription?: { type: string };
      event?: Record<string, unknown>;
    };

    if (messageType === 'webhook_callback_verification' && body.challenge) {
      return [
        {
          externalEventId: messageId,
          topic: 'verification',
          entitlement: null,
          control: { kind: 'challenge_response', body: body.challenge },
        },
      ];
    }
    if (messageType === 'revocation') {
      return [
        {
          externalEventId: messageId,
          topic: 'revocation',
          entitlement: null,
          control: { kind: 'revocation' },
        },
      ];
    }

    const type = body.subscription?.type ?? 'unknown';
    const event = body.event ?? {};
    const broadcasterId = String(event['broadcaster_user_id'] ?? '');
    const fanId = String(event['user_id'] ?? '');
    if (!broadcasterId || !fanId) {
      return [{ externalEventId: messageId, topic: type, entitlement: null }];
    }

    const active = type === 'channel.subscribe' || type === 'channel.subscription.gift';
    return [
      {
        externalEventId: messageId,
        topic: type,
        entitlement: {
          providerId: 'twitch',
          externalFanAccountId: fanId,
          externalCreatorAccountId: broadcasterId,
          kind: 'tier',
          tier: typeof event['tier'] === 'string' ? (event['tier'] as string) : null,
          externalRef: `twitch-eventsub:${messageId}`,
          observedAt: timestamp,
          expiresAt: null,
          active,
        },
      },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.configured) {
      return { ok: false, status: 'credentials_required', checkedAt };
    }
    return { ok: true, status: 'configured', checkedAt };
  }
}
