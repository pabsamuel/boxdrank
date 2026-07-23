import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** Standard cursor pagination envelope. */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Consistent error envelope for every non-2xx response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const ErrorCodes = {
  VALIDATION: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  PLAN_LIMIT: 'plan_limit_exceeded',
  PROVIDER_ERROR: 'provider_error',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  INTERNAL: 'internal_error',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'lowercase letters, digits and hyphens');

/** Handles/slugs that can never be claimed by creators. */
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'blog',
  'creator',
  'creators',
  'dashboard',
  'docs',
  'help',
  'legal',
  'library',
  'login',
  'logout',
  'me',
  'official',
  'pack',
  'packs',
  'privacy',
  'root',
  'settings',
  'signup',
  'studio',
  'support',
  'system',
  'terms',
  'www',
]);

export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isValidNewSlug(slug: string): boolean {
  return slugSchema.safeParse(slug).success && !RESERVED_SLUGS.has(slug);
}
