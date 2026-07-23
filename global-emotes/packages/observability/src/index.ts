import { pino, type Logger } from 'pino';
import type { AppEnv } from '@global-emotes/config';

/**
 * Structured logging with hard redaction. Secrets, tokens, cookies and message
 * contents must never reach logs (master spec §23) — redaction paths enforce
 * the obvious cases; code review enforces the rest.
 */
export function createLogger(env: AppEnv, service: string): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.accessToken',
        '*.refreshToken',
        '*.accessTokenEnc',
        '*.refreshTokenEnc',
        '*.password',
        '*.token',
        '*.secret',
      ],
      censor: '[redacted]',
    },
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino/file', options: { destination: 1 } } }
      : {}),
  });
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export type { Logger };
