import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Auth primitives: opaque session tokens (hashed at rest), single-use magic
 * link tokens, and AES-256-GCM envelope encryption for provider OAuth tokens.
 * No third-party auth service — see ADR-0001.
 */

// ── Opaque tokens ─────────────────────────────────────────────────────────────

/** 256-bit URL-safe random token. Only its SHA-256 is stored. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Human-friendly access code, e.g. "K7QF-M2XR-9BWD". Unambiguous alphabet. */
export function generateAccessCode(groups = 3, groupLen = 4): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = '';
    for (let i = 0; i < groupLen; i++) {
      const idx = randomBytes(1)[0]! % alphabet.length;
      part += alphabet[idx];
    }
    parts.push(part);
  }
  return parts.join('-');
}

// ── Cookie value signing (HMAC, for tamper-evidence on non-DB cookies) ───────

export function signValue(value: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${sig}`;
}

export function unsignValue(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = createHmac('sha256', secret).update(value).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}

// ── Provider token encryption at rest (AES-256-GCM) ──────────────────────────

/** Ciphertext format: v1:<iv b64>:<tag b64>:<data b64> */
export function encryptSecret(plaintext: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes of hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(ciphertext: string, hexKey: string): string {
  const [version, ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('invalid ciphertext format');
  }
  const key = Buffer.from(hexKey, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Session policy ───────────────────────────────────────────────────────────

export const SESSION_TTL_MS = 30 * 24 * 3_600_000; // 30 days
export const MAGIC_LINK_TTL_MS = 15 * 60_000; // 15 minutes
export const SESSION_COOKIE = 'ge_session';

export function sessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

export function magicLinkExpiry(now = new Date()): Date {
  return new Date(now.getTime() + MAGIC_LINK_TTL_MS);
}
