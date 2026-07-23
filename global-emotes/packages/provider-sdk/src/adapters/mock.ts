import type { ExternalEntitlement, ProviderCapabilities } from '@global-emotes/contracts';
import type {
  AuthorizationCallbackInput,
  AuthorizationInput,
  CreatorVerificationResult,
  FanEntitlementSyncInput,
  ImportEmotesInput,
  ImportedEmote,
  NormalizedProviderEvent,
  ProviderAdapter,
  ProviderContext,
  ProviderHealth,
  ProviderIdentity,
  ProviderMetadata,
  RefreshTokenInput,
  RevokeConnectionInput,
  TokenSet,
  VerifyCreatorInput,
  WebhookInput,
} from '../types';

export interface MockFixtures {
  /** accountId → identity. Token format: "mock:<accountId>". */
  identities?: Record<string, { displayName: string; email?: string }>;
  /** fanAccountId → creatorAccountId → tier (null = member without tier). */
  memberships?: Record<string, Record<string, string | null>>;
  emotes?: ImportedEmote[];
}

/**
 * Deterministic in-memory provider for local dev, seeds, and tests. Exercises
 * the full adapter surface (OAuth simulation, entitlement sync, webhooks)
 * without any external service, so the entire creator→fan loop runs offline.
 */
export class MockAdapter implements ProviderAdapter {
  constructor(
    private fixtures: MockFixtures = {},
    private readonly now: () => Date = () => new Date(),
  ) {}

  setFixtures(fixtures: MockFixtures): void {
    this.fixtures = fixtures;
  }

  /** Simulate a membership change (used by dev tools + tests). */
  setMembership(fanId: string, creatorId: string, tier: string | null): void {
    this.fixtures.memberships ??= {};
    this.fixtures.memberships[fanId] ??= {};
    this.fixtures.memberships[fanId][creatorId] = tier;
  }

  removeMembership(fanId: string, creatorId: string): void {
    delete this.fixtures.memberships?.[fanId]?.[creatorId];
  }

  metadata(): ProviderMetadata {
    return {
      id: 'mock',
      name: 'Mock Provider',
      authorizationKind: 'oauth',
      fanScopes: ['mock:read'],
      creatorScopes: ['mock:read'],
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
      status: 'production_ready',
      notes: 'In-memory adapter for development and tests.',
    };
  }

  async getAuthorizationUrl(input: AuthorizationInput): Promise<string> {
    const params = new URLSearchParams({ state: input.state, redirect_uri: input.redirectUri });
    return `mock://authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(input: AuthorizationCallbackInput): Promise<TokenSet> {
    // Code convention: "code:<accountId>"
    const accountId = input.code.replace(/^code:/, '');
    return {
      accessToken: `mock:${accountId}`,
      refreshToken: `mock-refresh:${accountId}`,
      expiresAt: new Date(this.now().getTime() + 3_600_000),
      scopes: ['mock:read'],
    };
  }

  async refreshToken(input: RefreshTokenInput): Promise<TokenSet> {
    const accountId = input.refreshToken.replace(/^mock-refresh:/, '');
    return {
      accessToken: `mock:${accountId}`,
      refreshToken: input.refreshToken,
      expiresAt: new Date(this.now().getTime() + 3_600_000),
      scopes: ['mock:read'],
    };
  }

  async revokeConnection(_input: RevokeConnectionInput): Promise<void> {
    // nothing to do in-memory
  }

  async fetchIdentity(context: ProviderContext): Promise<ProviderIdentity> {
    const accountId = context.accessToken.replace(/^mock:/, '');
    const fixture = this.fixtures.identities?.[accountId];
    return {
      externalAccountId: accountId,
      displayName: fixture?.displayName ?? `Mock ${accountId}`,
      avatarUrl: null,
      email: fixture?.email ?? null,
    };
  }

  async verifyCreatorOwnership(input: VerifyCreatorInput): Promise<CreatorVerificationResult> {
    const identity = await this.fetchIdentity(input.context);
    return {
      verified:
        !input.claimedExternalAccountId ||
        identity.externalAccountId === input.claimedExternalAccountId,
      externalAccountId: identity.externalAccountId,
      evidence: { method: 'mock_self' },
    };
  }

  async syncFanEntitlements(input: FanEntitlementSyncInput): Promise<ExternalEntitlement[]> {
    const memberships = this.fixtures.memberships?.[input.externalFanAccountId] ?? {};
    return input.targets.map((target) => {
      const hasEntry = Object.prototype.hasOwnProperty.call(
        memberships,
        target.externalCreatorAccountId,
      );
      const tier = memberships[target.externalCreatorAccountId] ?? null;
      return {
        providerId: 'mock',
        externalFanAccountId: input.externalFanAccountId,
        externalCreatorAccountId: target.externalCreatorAccountId,
        kind: 'tier',
        tier,
        externalRef: `mock-membership:${target.externalCreatorAccountId}:${input.externalFanAccountId}`,
        observedAt: this.now().toISOString(),
        expiresAt: null,
        active: hasEntry,
      };
    });
  }

  async importCreatorEmotes(_input: ImportEmotesInput): Promise<ImportedEmote[]> {
    return this.fixtures.emotes ?? [];
  }

  /** Body convention: JSON { eventId, fanId, creatorId, tier, active }. */
  async handleWebhook(input: WebhookInput): Promise<NormalizedProviderEvent[]> {
    const body = JSON.parse(input.rawBody) as {
      eventId: string;
      fanId: string;
      creatorId: string;
      tier: string | null;
      active: boolean;
    };
    return [
      {
        externalEventId: body.eventId,
        topic: body.active ? 'mock.subscribe' : 'mock.unsubscribe',
        entitlement: {
          providerId: 'mock',
          externalFanAccountId: body.fanId,
          externalCreatorAccountId: body.creatorId,
          kind: 'tier',
          tier: body.tier,
          externalRef: `mock-event:${body.eventId}`,
          observedAt: this.now().toISOString(),
          expiresAt: null,
          active: body.active,
        },
      },
    ];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, status: 'production_ready', checkedAt: new Date().toISOString() };
  }
}
