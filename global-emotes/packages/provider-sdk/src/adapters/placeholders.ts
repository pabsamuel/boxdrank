import type { ProviderCapabilities, ProviderId, ProviderStatus } from '@global-emotes/contracts';
import {
  ProviderError,
  type AuthorizationCallbackInput,
  type AuthorizationInput,
  type ProviderAdapter,
  type ProviderContext,
  type ProviderHealth,
  type ProviderIdentity,
  type ProviderMetadata,
  type RefreshTokenInput,
  type RevokeConnectionInput,
  type TokenSet,
} from '../types';

/**
 * Honest placeholder for providers that are designed but gated (approval,
 * unconfirmed capability, or pending credentials). Declares its true status
 * and throws `not_configured` instead of pretending to work (spec §4.1).
 */
export class PlaceholderAdapter implements ProviderAdapter {
  constructor(
    private readonly id: ProviderId,
    private readonly name: string,
    private readonly status: ProviderStatus,
    private readonly notes: string,
  ) {}

  metadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      authorizationKind: 'oauth',
      fanScopes: [],
      creatorScopes: [],
    };
  }

  capabilities(): ProviderCapabilities {
    return {
      oauth: true,
      creatorIdentity: false,
      fanIdentity: false,
      fanMembershipVerification: false,
      creatorMemberList: false,
      tierAccess: false,
      emoteImport: false,
      webhooks: false,
      pollingRequired: true,
      approvalRequired: this.status === 'approval_required',
      status: this.status,
      notes: this.notes,
    };
  }

  private blocked(): never {
    throw new ProviderError('not_configured', `${this.name}: ${this.status} — ${this.notes}`);
  }

  async getAuthorizationUrl(_i: AuthorizationInput): Promise<string> {
    this.blocked();
  }
  async exchangeAuthorizationCode(_i: AuthorizationCallbackInput): Promise<TokenSet> {
    this.blocked();
  }
  async refreshToken(_i: RefreshTokenInput): Promise<TokenSet> {
    this.blocked();
  }
  async revokeConnection(_i: RevokeConnectionInput): Promise<void> {
    this.blocked();
  }
  async fetchIdentity(_i: ProviderContext): Promise<ProviderIdentity> {
    this.blocked();
  }
  async healthCheck(): Promise<ProviderHealth> {
    return {
      ok: false,
      status: this.status,
      detail: this.notes,
      checkedAt: new Date().toISOString(),
    };
  }
}
