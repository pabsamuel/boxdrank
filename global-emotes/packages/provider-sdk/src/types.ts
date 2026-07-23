import type {
  ExternalEntitlement,
  ProviderCapabilities,
  ProviderId,
} from '@global-emotes/contracts';

export interface ProviderMetadata {
  id: ProviderId;
  name: string;
  authorizationKind: 'oauth' | 'internal';
  /** Scopes requested for fan connections. */
  fanScopes: string[];
  /** Scopes requested for creator connections. */
  creatorScopes: string[];
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

export interface ProviderContext {
  accessToken: string;
  externalAccountId?: string;
}

export interface AuthorizationInput {
  redirectUri: string;
  state: string;
  role: 'fan' | 'creator';
  codeChallenge?: string;
}

export interface AuthorizationCallbackInput {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface RefreshTokenInput {
  refreshToken: string;
}

export interface RevokeConnectionInput {
  accessToken: string;
  refreshToken?: string | null;
}

export interface ProviderIdentity {
  externalAccountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

export interface VerifyCreatorInput {
  context: ProviderContext;
  claimedExternalAccountId?: string;
}

export interface CreatorVerificationResult {
  verified: boolean;
  externalAccountId: string;
  evidence: Record<string, unknown>;
}

export interface FanEntitlementSyncInput {
  context: ProviderContext;
  externalFanAccountId: string;
  /** Creator external accounts this platform should be checked against. */
  targets: Array<{ externalCreatorAccountId: string; meta?: Record<string, unknown> }>;
}

export interface CreatorMemberSyncInput {
  context: ProviderContext;
  externalCreatorAccountId: string;
  cursor?: string;
}

export interface ExternalMember {
  externalFanAccountId: string;
  tier: string | null;
  since: string | null;
  raw?: Record<string, unknown>;
}

export interface ImportEmotesInput {
  context: ProviderContext;
  externalCreatorAccountId: string;
}

export interface ImportedEmote {
  externalId: string;
  name: string;
  imageUrl: string;
  animated: boolean;
}

export interface RegisterWebhookInput {
  callbackUrl: string;
  externalCreatorAccountId: string;
  context?: ProviderContext;
}

export interface WebhookRegistration {
  externalSubscriptionId: string;
  topic: string;
}

export interface WebhookInput {
  headers: Record<string, string | undefined>;
  rawBody: string;
}

export interface NormalizedProviderEvent {
  externalEventId: string;
  topic: string;
  entitlement: ExternalEntitlement | null;
  /** Non-entitlement events (verification challenges…) resolved by the driver. */
  control?: { kind: 'challenge_response'; body: string } | { kind: 'revocation' };
}

export interface ProviderHealth {
  ok: boolean;
  status: string;
  detail?: string;
  checkedAt: string;
}

/**
 * Provider adapter contract (master spec §9). Provider-specific code must not
 * leak past this interface — the entitlement engine only ever sees normalized
 * `ExternalEntitlement` evidence.
 */
export interface ProviderAdapter {
  metadata(): ProviderMetadata;
  capabilities(): ProviderCapabilities;

  getAuthorizationUrl(input: AuthorizationInput): Promise<string>;
  exchangeAuthorizationCode(input: AuthorizationCallbackInput): Promise<TokenSet>;
  refreshToken(input: RefreshTokenInput): Promise<TokenSet>;
  revokeConnection(input: RevokeConnectionInput): Promise<void>;

  fetchIdentity(input: ProviderContext): Promise<ProviderIdentity>;

  verifyCreatorOwnership?(input: VerifyCreatorInput): Promise<CreatorVerificationResult>;
  syncFanEntitlements?(input: FanEntitlementSyncInput): Promise<ExternalEntitlement[]>;
  syncCreatorMembers?(input: CreatorMemberSyncInput): Promise<ExternalMember[]>;
  importCreatorEmotes?(input: ImportEmotesInput): Promise<ImportedEmote[]>;
  registerWebhooks?(input: RegisterWebhookInput): Promise<WebhookRegistration[]>;
  handleWebhook?(input: WebhookInput): Promise<NormalizedProviderEvent[]>;

  healthCheck(): Promise<ProviderHealth>;
}

// ── Normalized errors ─────────────────────────────────────────────────────────

export type ProviderErrorKind =
  | 'auth_expired'
  | 'auth_revoked'
  | 'rate_limited'
  | 'not_found'
  | 'permission_denied'
  | 'provider_unavailable'
  | 'invalid_response'
  | 'webhook_invalid_signature'
  | 'webhook_replay'
  | 'not_configured';

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get retryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'provider_unavailable';
  }
}

export type FetchFn = typeof fetch;
