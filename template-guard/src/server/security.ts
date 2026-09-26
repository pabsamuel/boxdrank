import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * The things a marketplace security scan looks for.
 *
 * monday's review runs a Burp scan and expects the findings remediated. Most
 * of what that scan reports on a small Express app is not clever — it is
 * missing response headers, a permissive CORS policy, and an endpoint that
 * accepts unlimited requests. All of that is cheaper to write now than to
 * remediate under a review deadline, and none of it is speculative: these are
 * the standard findings, not a guess at what might be found.
 *
 * Deliberately hand-rolled rather than pulled from a helmet-style dependency.
 * Four short functions are auditable in one sitting by the person who has to
 * defend them; a dependency tree is not. The trade is real — a library tracks
 * new header recommendations and this does not — so the header set is dated
 * and cheap to revisit.
 */

/**
 * Security response headers, current as of 2026-09.
 *
 * The app renders inside a monday iframe, so `frame-ancestors` must *allow*
 * monday rather than deny framing outright — `X-Frame-Options: DENY` would
 * break the product. That is the one place where the strictest setting is the
 * wrong setting, and it is worth knowing before a scanner flags its absence.
 */
export const MONDAY_FRAME_ANCESTORS = ["https://*.monday.com", "https://monday.com"];

export function securityHeaders(opts: { hsts?: boolean } = {}): RequestHandler {
  const csp = [
    `default-src 'self'`,
    // The client bundle is served from this origin; monday's SDK talks to
    // api.monday.com from inside the iframe.
    `connect-src 'self' https://api.monday.com`,
    `img-src 'self' data: https://*.monday.com`,
    // Vibe injects styles at runtime, so 'unsafe-inline' is required for
    // styles. It is NOT granted for scripts, which is where it would matter.
    `style-src 'self' 'unsafe-inline'`,
    `script-src 'self'`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors ${MONDAY_FRAME_ANCESTORS.join(' ')}`,
  ].join('; ');

  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    // Explicit: the app is framed by monday, and X-Frame-Options cannot
    // express "only these origins" the way CSP frame-ancestors can.
    res.removeHeader('X-Frame-Options');
    // Express advertises itself by default. Free information for an attacker
    // fingerprinting the stack, and a standard scan finding.
    res.removeHeader('X-Powered-By');

    if (opts.hsts !== false) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

/**
 * CORS, restricted to monday origins.
 *
 * The board view is served from this origin, so in normal operation the API is
 * same-origin and CORS never comes up. It is here because a wildcard
 * `Access-Control-Allow-Origin` is a guaranteed scan finding, and because an
 * app that holds monday access tokens should not answer cross-origin requests
 * from anywhere at all.
 */
export function mondayCors(extraOrigins: string[] = []): RequestHandler {
  const allowed = new Set(['https://monday.com', 'https://view.monday.com', ...extraOrigins]);

  const isAllowed = (origin: string): boolean =>
    allowed.has(origin) || /^https:\/\/[a-z0-9-]+\.monday\.com$/i.test(origin);

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('Origin');
    if (origin && isAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    // An unrecognised origin gets no CORS headers at all, which the browser
    // turns into a blocked request. Answering with a 403 body would leak that
    // the endpoint exists.
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

export interface RateLimitOptions {
  /** Window length. Default 1 minute. */
  windowMs?: number;
  /** Requests allowed per key per window. Default 120. */
  max?: number;
  /** How a request is bucketed. Default: the authenticated account, else IP. */
  keyFor?: (req: Request) => string;
  now?: () => number;
}

/**
 * A fixed-window rate limiter, in memory.
 *
 * Honest about what it is: per-process, so it does not hold across instances,
 * and a fixed window allows a burst at a boundary. It exists to stop a single
 * caller hammering `/api/compare` — each of which costs monday API quota that
 * is shared by every customer — and to remove a scan finding. It is not a DDoS
 * defence; that belongs at the edge, and the deployment doc says so.
 *
 * Buckets are swept lazily on write rather than on a timer, so an idle process
 * holds nothing and there is no interval to leak.
 */
export function rateLimit(opts: RateLimitOptions = {}): RequestHandler {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 120;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  const keyFor =
    opts.keyFor ??
    ((req: Request) => {
      const auth = req.header('Authorization');
      // Bucket by a hash-free prefix of the bearer token: enough to separate
      // callers, never enough to reconstruct or log the token itself.
      if (auth) return `t:${auth.slice(-24)}`;
      return `ip:${req.ip ?? 'unknown'}`;
    });

  return (req: Request, res: Response, next: NextFunction) => {
    const t = now();
    const key = keyFor(req);

    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= t) buckets.delete(k);
    }

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= t) {
      buckets.set(key, { count: 1, resetAt: t + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - t) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      // Says what happened and when it clears. A bare 429 trains callers to
      // retry immediately, which is how a limit becomes a loop.
      res.status(429).json({
        error: `Too many requests. Template Guard limits this to ${max} requests per minute so that one busy account cannot spend the monday API quota every customer shares. Try again in ${retryAfter}s.`,
        kind: 'rate_limited',
      });
      return;
    }
    next();
  };
}

/**
 * Redirects plain HTTP to HTTPS behind a proxy that sets `X-Forwarded-Proto`.
 *
 * `trust proxy` must be set on the app for `req.protocol` to reflect the
 * header; without it this is a no-op and the deployment doc covers it.
 */
export function requireHttps(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.secure || req.header('X-Forwarded-Proto') === 'https') {
      next();
      return;
    }
    // Only GETs are safely redirectable. A POST body would be silently
    // dropped by the redirect, so it is refused outright instead.
    if (req.method === 'GET') {
      res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
      return;
    }
    res.status(403).json({
      error: 'Template Guard accepts requests over HTTPS only.',
      kind: 'permission_denied',
    });
  };
}
