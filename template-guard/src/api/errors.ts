/**
 * Failure taxonomy.
 *
 * The product claim is "we tell you what silently broke." An app making that
 * claim may never itself break silently, so nothing here is swallowed: every
 * degradation becomes a typed, user-presentable record that rides along with
 * whatever partial result we did manage to produce.
 *
 * There is no bare `catch {}` anywhere in this codebase. If you are tempted to
 * add one, you want `partial()` instead.
 */

export type FailureKind =
  /** The API answered, but refused this particular field or object. */
  | 'permission_denied'
  /** We were throttled and ran out of retries. */
  | 'rate_limited'
  /** Query cost exceeded the account's complexity budget. */
  | 'complexity_exceeded'
  /** The field or object does not exist on the pinned schema version. */
  | 'schema_mismatch'
  /** A preview-schema read failed. Never fatal — the flag exists for this. */
  | 'preview_unavailable'
  /** Network, timeout, 5xx. */
  | 'transport'
  /** The API returned a shape we do not understand. */
  | 'unexpected_shape'
  /** Anything genuinely unclassified. Still surfaced, never hidden. */
  | 'unknown';

export interface PartialFailure {
  kind: FailureKind;
  /** Dotted path to what we could not read, e.g. `board.42.columns`. */
  scope: string;
  /** Shown to the user. Plain language, no stack traces, no jargon. */
  message: string;
  /** Does the diff built from this data risk being wrong (vs. merely thin)? */
  degradesDiff: boolean;
  /** Original error, for logs only. Never rendered. */
  cause?: unknown;
}

export function partial(
  kind: FailureKind,
  scope: string,
  message: string,
  opts: { degradesDiff?: boolean; cause?: unknown } = {},
): PartialFailure {
  return {
    kind,
    scope,
    message,
    degradesDiff: opts.degradesDiff ?? true,
    cause: opts.cause,
  };
}

/** A value that may have arrived incomplete, carrying why. */
export interface Partial<T> {
  value: T;
  failures: PartialFailure[];
}

export function ok<T>(value: T): Partial<T> {
  return { value, failures: [] };
}

export function withFailures<T>(value: T, failures: PartialFailure[]): Partial<T> {
  return { value, failures };
}

/**
 * True when nothing was lost. The UI must render a visible degraded state
 * whenever this is false — never a silently short result.
 */
export function isComplete(p: { failures: PartialFailure[] }): boolean {
  return p.failures.length === 0;
}

/** Failures severe enough that the diff itself may be wrong, not just thin. */
export function blockingFailures(p: { failures: PartialFailure[] }): PartialFailure[] {
  return p.failures.filter((f) => f.degradesDiff);
}

/** Raised only for conditions that make continuing meaningless. */
export class TemplateGuardError extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TemplateGuardError';
  }
}

/** Maps a monday GraphQL error payload onto our taxonomy. */
export function classifyGraphQLError(err: {
  message?: string;
  extensions?: { code?: string; status_code?: number };
}): FailureKind {
  const code = err.extensions?.code ?? '';
  const msg = (err.message ?? '').toLowerCase();

  if (code === 'ComplexityException' || msg.includes('complexity')) return 'complexity_exceeded';
  if (code === 'RateLimitExceeded' || msg.includes('rate limit')) return 'rate_limited';
  if (
    code === 'UserUnauthorizedException' ||
    msg.includes('not authorized') ||
    msg.includes('permission')
  ) {
    return 'permission_denied';
  }
  if (
    msg.includes("cannot query field") ||
    msg.includes('undefined field') ||
    msg.includes('unknown argument')
  ) {
    return 'schema_mismatch';
  }
  return 'unknown';
}
