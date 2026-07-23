import type { ProviderCapabilities } from '@global-emotes/contracts';
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
 * Internal access-code "provider". Redemption itself is first-party (API +
 * database, see the entitlements service) — this adapter exists so codes appear
 * uniformly in the capability matrix, admin dashboard, and provider registry.
 */
export class AccessCodeAdapter implements ProviderAdapter {
  metadata(): ProviderMetadata {
    return {
      id: 'access_code',
      name: 'Access Codes',
      authorizationKind: 'internal',
      fanScopes: [],
      creatorScopes: [],
    };
  }

  capabilities(): ProviderCapabilities {
    return {
      oauth: false,
      creatorIdentity: false,
      fanIdentity: false,
      fanMembershipVerification: true,
      creatorMemberList: false,
      tierAccess: true,
      emoteImport: false,
      webhooks: false,
      pollingRequired: false,
      approvalRequired: false,
      status: 'production_ready',
      notes: 'First-party creator-issued codes; universal fallback for unsupported platforms.',
    };
  }

  async getAuthorizationUrl(_input: AuthorizationInput): Promise<string> {
    throw new ProviderError('not_configured', 'access codes do not use OAuth');
  }

  async exchangeAuthorizationCode(_input: AuthorizationCallbackInput): Promise<TokenSet> {
    throw new ProviderError('not_configured', 'access codes do not use OAuth');
  }

  async refreshToken(_input: RefreshTokenInput): Promise<TokenSet> {
    throw new ProviderError('not_configured', 'access codes do not use OAuth');
  }

  async revokeConnection(_input: RevokeConnectionInput): Promise<void> {
    // nothing to revoke
  }

  async fetchIdentity(_input: ProviderContext): Promise<ProviderIdentity> {
    throw new ProviderError('not_configured', 'access codes have no external identity');
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, status: 'production_ready', checkedAt: new Date().toISOString() };
  }
}
