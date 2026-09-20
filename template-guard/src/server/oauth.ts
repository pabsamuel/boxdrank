import crypto from 'node:crypto';
import { TemplateGuardError } from '../api/errors.js';

/**
 * monday OAuth.
 *
 * monday apps can often get away with the client-side session token from
 * `monday-sdk-js`, which is fine for a board view that only reads the board it
 * is embedded in. Template Guard cannot: drift monitoring runs on a schedule
 * with nobody logged in, so the server needs its own long-lived token. Hence a
 * real OAuth flow.
 *
 * ✱ The authorize and token URLs below follow monday's documented OAuth
 * endpoints but have not been exercised against a live app registration.
 */

export const MONDAY_AUTHORIZE_URL = 'https://auth.monday.com/oauth2/authorize';
export const MONDAY_TOKEN_URL = 'https://auth.monday.com/oauth2/token';

/**
 * Scopes requested at install.
 *
 * Kept to the minimum that makes the product work, because every extra scope
 * is a question at security review and a reason for an admin to decline the
 * install:
 *
 *  - `boards:read`     — read board structure. The entire diff depends on it.
 *  - `boards:write`    — create the missing column or group during a repair.
 *  - `account:read`    — account ID and slug, for deep links and billing.
 *  - `me:read`         — identify the installing user.
 *
 * Deliberately NOT requested:
 *  - anything granting item or update access. We never read items, and not
 *    holding the scope is a stronger claim than promising not to use it.
 *  - `workspaces:write`, `users:write`, `teams:write`. Nothing here needs them.
 */
export const REQUIRED_SCOPES = ['boards:read', 'boards:write', 'account:read', 'me:read'] as const;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * CSRF state: a nonce and an issue time, signed.
 *
 * Signed rather than stored server-side so that a restart mid-install does not
 * strand anyone. **The signature alone is not the protection** — anyone can
 * request `/auth/install` and receive a perfectly valid signed state. It
 * proves the value came from us, not that it came from *this browser*.
 *
 * The browser binding is the cookie the install route sets and the callback
 * compares against. Both halves are required: the signature stops a forged
 * state, the cookie stops an attacker completing their own authorization in
 * someone else's session.
 */
export function createState(
  secret: string,
  nonce = crypto.randomBytes(16).toString('hex'),
  now: () => number = Date.now,
): string {
  const issuedAt = now().toString(36);
  const payload = `${nonce}.${issuedAt}`;
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${mac}`;
}

/** An install that has sat unfinished for this long is not being finished. */
export const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function verifyState(
  secret: string,
  state: string,
  opts: { maxAgeMs?: number; now?: () => number } = {},
): boolean {
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, issuedAt, mac] = parts as [string, string, string];

  const expected = crypto.createHmac('sha256', secret).update(`${nonce}.${issuedAt}`).digest('hex');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  // A state that never expires is a replayable one. Ten minutes is longer
  // than any real install takes and shorter than an attacker's convenience.
  const issued = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issued)) return false;
  const age = (opts.now ?? Date.now)() - issued;
  return age >= 0 && age <= (opts.maxAgeMs ?? STATE_MAX_AGE_MS);
}

/**
 * Constant-time comparison of the callback's state against the cookie.
 *
 * Separate from `verifyState` because they answer different questions, and
 * collapsing them is how the cookie ends up written but never read — which is
 * exactly what happened here before ADR-024.
 */
export function stateMatchesCookie(state: string, cookieValue: string | null): boolean {
  if (!cookieValue) return false;
  const a = Buffer.from(state);
  const b = Buffer.from(cookieValue);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Reads one cookie out of a raw `Cookie` header, without a dependency. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      // A malformed cookie value is not a cookie we will act on.
      return null;
    }
  }
  return null;
}

export function authorizeUrl(config: OAuthConfig, state: string): string {
  const url = new URL(MONDAY_AUTHORIZE_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', REQUIRED_SCOPES.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope?: string;
}

export async function exchangeCodeForToken(
  config: OAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetchImpl(MONDAY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      }),
    });
  } catch (cause) {
    throw new TemplateGuardError('Could not reach monday to complete sign-in.', 'transport', cause);
  }

  if (!res.ok) {
    throw new TemplateGuardError(
      `monday rejected the sign-in (HTTP ${res.status}). Check the app's client ID, secret and redirect URI.`,
      'permission_denied',
    );
  }

  const body = (await res.json()) as Partial<TokenResponse>;
  if (!body.access_token) {
    throw new TemplateGuardError('monday returned no access token.', 'unexpected_shape');
  }

  // A token issued with fewer scopes than we asked for produces confusing,
  // half-working behaviour later. Better to say so now, at install time.
  if (body.scope) {
    const granted = new Set(body.scope.split(/[\s,]+/).filter(Boolean));
    const missing = REQUIRED_SCOPES.filter((s) => !granted.has(s));
    if (missing.length > 0) {
      throw new TemplateGuardError(
        `Template Guard was installed without the ${missing.join(', ')} permission${missing.length > 1 ? 's' : ''}, which it needs to compare boards. Please reinstall and accept all permissions.`,
        'permission_denied',
      );
    }
  }

  return body as TokenResponse;
}

/**
 * Verifies the signed JWT monday puts in the `sessionToken` of an embedded
 * view, so the server can trust the account and user a browser request claims.
 *
 * Signature check only — decoding without verifying would let anyone claim any
 * account ID, which is the whole point of the signing secret.
 */
export function verifySessionToken(
  token: string,
  signingSecret: string,
): { accountId: string; userId: string; boardId?: string } {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new TemplateGuardError('Malformed monday session token.', 'permission_denied');
  }

  const expected = crypto
    .createHmac('sha256', signingSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const a = Buffer.from(signatureB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new TemplateGuardError('monday session token failed signature verification.', 'permission_denied');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    dat?: { account_id?: number | string; user_id?: number | string };
    exp?: number;
  };

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    throw new TemplateGuardError('monday session token has expired.', 'permission_denied');
  }

  const accountId = payload.dat?.account_id;
  const userId = payload.dat?.user_id;
  if (accountId == null || userId == null) {
    throw new TemplateGuardError('monday session token is missing account details.', 'unexpected_shape');
  }

  return { accountId: String(accountId), userId: String(userId) };
}
