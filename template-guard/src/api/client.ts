import { MONDAY_API_ENDPOINT, MONDAY_API_VERSION } from './version.js';
import { TemplateGuardError, classifyGraphQLError, type FailureKind } from './errors.js';

/**
 * Minimal monday GraphQL client.
 *
 * Deliberately thin — it does four things the rest of the app must never do by
 * hand: pin the API version, respect the complexity budget, back off on 429,
 * and refuse to hide an error.
 */

export interface GraphQLError {
  message?: string;
  extensions?: { code?: string; status_code?: number };
  path?: string[];
}

export interface ComplexityInfo {
  before: number;
  query: number;
  after: number;
  reset_in_x_seconds: number;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  /** Present when the query asks for it; see COMPLEXITY_FRAGMENT. */
  account_id?: number;
}

export interface ClientOptions {
  token: string;
  endpoint?: string;
  apiVersion?: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so backoff does not actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1_000;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MondayClient {
  private readonly token: string;
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  /** Last observed complexity budget, for the caller to pace against. */
  complexity: ComplexityInfo | null = null;

  constructor(opts: ClientOptions) {
    if (!opts.token) throw new TemplateGuardError('No monday access token', 'permission_denied');
    this.token = opts.token;
    this.endpoint = opts.endpoint ?? MONDAY_API_ENDPOINT;
    this.apiVersion = opts.apiVersion ?? MONDAY_API_VERSION;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Runs a query. Returns data plus any GraphQL errors — monday routinely
   * answers with both, and throwing away the data because one field was
   * denied is exactly the silent-failure behaviour this app exists to oppose.
   */
  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<{ data: T | undefined; errors: GraphQLError[] }> {
    let attempt = 0;

    for (;;) {
      const res = await this.send(query, variables);

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= this.maxRetries) {
          throw new TemplateGuardError(
            `monday API returned ${res.status} after ${attempt} retries`,
            res.status === 429 ? 'rate_limited' : 'transport',
          );
        }
        await this.sleep(this.backoffFor(attempt, res));
        attempt += 1;
        continue;
      }

      if (!res.ok) {
        throw new TemplateGuardError(
          `monday API returned ${res.status}`,
          res.status === 401 || res.status === 403 ? 'permission_denied' : 'transport',
        );
      }

      let body: GraphQLResponse<T>;
      try {
        body = (await res.json()) as GraphQLResponse<T>;
      } catch (cause) {
        throw new TemplateGuardError('monday API returned malformed JSON', 'unexpected_shape', cause);
      }

      const errors = body.errors ?? [];

      // A complexity or rate error is retryable once the budget resets.
      const retryable = errors.find((e) => {
        const kind = classifyGraphQLError(e);
        return kind === 'complexity_exceeded' || kind === 'rate_limited';
      });
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.backoffFor(attempt, res));
        attempt += 1;
        continue;
      }

      return { data: body.data, errors };
    }
  }

  private async send(query: string, variables: Record<string, unknown>): Promise<Response> {
    try {
      return await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.token,
          'API-Version': this.apiVersion,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (cause) {
      throw new TemplateGuardError('Could not reach the monday API', 'transport', cause);
    }
  }

  private backoffFor(attempt: number, res: Response): number {
    const header = res.headers?.get?.('Retry-After');
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
    }
    // Exponential with jitter, so a fleet of drift monitors does not sync up
    // and hammer monday on the same second.
    const base = BASE_BACKOFF_MS * 2 ** attempt;
    return base + Math.floor(Math.random() * BASE_BACKOFF_MS);
  }
}

/** Classifies a list of GraphQL errors down to the most severe single kind. */
export function worstKind(errors: GraphQLError[]): FailureKind | null {
  if (errors.length === 0) return null;
  const order: FailureKind[] = [
    'schema_mismatch',
    'permission_denied',
    'complexity_exceeded',
    'rate_limited',
    'unexpected_shape',
    'transport',
    'unknown',
  ];
  const kinds = errors.map(classifyGraphQLError);
  for (const k of order) if (kinds.includes(k)) return k;
  return 'unknown';
}
