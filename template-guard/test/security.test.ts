import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { assertSafeWebhookUrl } from '../src/server/index.js';
import {
  MONDAY_FRAME_ANCESTORS,
  mondayCors,
  rateLimit,
  requireHttps,
  securityHeaders,
} from '../src/server/security.js';

/**
 * These are the findings a marketplace Burp scan reports, written as tests so
 * a regression shows up here rather than in a review deadline.
 */

function fakeReq(over: Partial<Request> = {}): Request {
  const headers: Record<string, string> = (over as { headers?: Record<string, string> }).headers ?? {};
  return {
    method: 'GET',
    ip: '203.0.113.1',
    originalUrl: '/api/templates',
    secure: false,
    headers,
    header: (name: string) => headers[name] ?? headers[name.toLowerCase()],
    ...over,
  } as unknown as Request;
}

function fakeRes() {
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    redirected: null as null | { status: number; url: string },
    setHeader: (k: string, v: string) => headers.set(k, v),
    removeHeader: (k: string) => headers.delete(k),
    getHeader: (k: string) => headers.get(k),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
    redirect(status: number, url: string) {
      this.redirected = { status, url };
      return this;
    },
  };
  return { res: res as unknown as Response, headers, raw: res };
}

function run(handler: RequestHandler, req: Request) {
  const { res, headers, raw } = fakeRes();
  const next = vi.fn() as unknown as NextFunction;
  handler(req, res, next);
  return { headers, raw, next: next as unknown as ReturnType<typeof vi.fn> };
}

describe('securityHeaders', () => {
  it('sets the headers a scan looks for', () => {
    const { headers, next } = run(securityHeaders(), fakeReq());

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Strict-Transport-Security')).toMatch(/max-age=31536000/);
    expect(headers.get('Content-Security-Policy')).toContain("object-src 'none'");
    expect(next).toHaveBeenCalled();
  });

  it('allows monday to frame the app — denying it would break the product', () => {
    const { headers } = run(securityHeaders(), fakeReq());
    const csp = headers.get('Content-Security-Policy') ?? '';

    for (const origin of MONDAY_FRAME_ANCESTORS) expect(csp).toContain(origin);
    // The strictest setting is the wrong setting here, and a scanner will ask.
    expect(headers.has('X-Frame-Options')).toBe(false);
  });

  it("never grants 'unsafe-inline' to scripts, only to styles Vibe injects", () => {
    const { headers } = run(securityHeaders(), fakeReq());
    const csp = headers.get('Content-Security-Policy') ?? '';

    expect(csp).toContain(`style-src 'self' 'unsafe-inline'`);
    expect(csp).toContain(`script-src 'self'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('omits HSTS when asked, so local http development is not poisoned', () => {
    const { headers } = run(securityHeaders({ hsts: false }), fakeReq());
    expect(headers.has('Strict-Transport-Security')).toBe(false);
  });
});

describe('mondayCors', () => {
  it('reflects a monday subdomain', () => {
    const { headers } = run(mondayCors(), fakeReq({ headers: { Origin: 'https://acme.monday.com' } } as Partial<Request>));
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://acme.monday.com');
    expect(headers.get('Vary')).toBe('Origin');
  });

  it('answers an unknown origin with no CORS headers at all', () => {
    const { headers, next } = run(
      mondayCors(),
      fakeReq({ headers: { Origin: 'https://monday.com.attacker.example' } } as Partial<Request>),
    );
    // Never a wildcard, and never a 403 body that would confirm the endpoint.
    expect(headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(next).toHaveBeenCalled();
  });

  it('does not treat a lookalike host as monday', () => {
    const { headers } = run(
      mondayCors(),
      fakeReq({ headers: { Origin: 'https://evil-monday.com' } } as Partial<Request>),
    );
    expect(headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('short-circuits a preflight', () => {
    const { raw, next } = run(
      mondayCors(),
      fakeReq({ method: 'OPTIONS', headers: { Origin: 'https://acme.monday.com' } } as Partial<Request>),
    );
    expect(raw.statusCode).toBe(204);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('rateLimit', () => {
  it('allows up to the limit, then answers 429 with a Retry-After', () => {
    let clock = 0;
    const limiter = rateLimit({ max: 2, windowMs: 1000, now: () => clock });
    const req = fakeReq({ headers: { Authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaa' } } as Partial<Request>);

    expect(run(limiter, req).next).toHaveBeenCalled();
    expect(run(limiter, req).next).toHaveBeenCalled();

    const third = run(limiter, req);
    expect(third.next).not.toHaveBeenCalled();
    expect(third.raw.statusCode).toBe(429);
    expect(third.headers.get('Retry-After')).toBe('1');
    // A bare 429 trains callers to retry immediately.
    expect((third.raw.body as { error: string }).error).toMatch(/Try again in 1s/);
  });

  it('lets the window expire', () => {
    let clock = 0;
    const limiter = rateLimit({ max: 1, windowMs: 1000, now: () => clock });
    const req = fakeReq({ headers: { Authorization: 'Bearer token' } } as Partial<Request>);

    run(limiter, req);
    expect(run(limiter, req).raw.statusCode).toBe(429);

    clock = 1001;
    expect(run(limiter, req).next).toHaveBeenCalled();
  });

  it('buckets callers separately', () => {
    const limiter = rateLimit({ max: 1, windowMs: 1000 });
    const a = fakeReq({ headers: { Authorization: 'Bearer aaaaaaaaaaaaaaaaaaaaaaaaaaaa' } } as Partial<Request>);
    const b = fakeReq({ headers: { Authorization: 'Bearer bbbbbbbbbbbbbbbbbbbbbbbbbbbb' } } as Partial<Request>);

    run(limiter, a);
    expect(run(limiter, b).next).toHaveBeenCalled();
    expect(run(limiter, a).raw.statusCode).toBe(429);
  });
});

describe('requireHttps', () => {
  it('passes a request the proxy marked https', () => {
    const { next } = run(requireHttps(), fakeReq({ headers: { 'X-Forwarded-Proto': 'https' } } as Partial<Request>));
    expect(next).toHaveBeenCalled();
  });

  it('redirects a plain GET permanently', () => {
    const { raw } = run(requireHttps(), fakeReq({ headers: { host: 'app.example.com' } } as Partial<Request>));
    expect(raw.redirected).toEqual({ status: 308, url: 'https://app.example.com/api/templates' });
  });

  it('refuses a plain POST rather than redirecting it and losing the body', () => {
    const { raw, next } = run(requireHttps(), fakeReq({ method: 'POST' }));
    expect(raw.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('assertSafeWebhookUrl', () => {
  it('accepts an ordinary https endpoint', () => {
    expect(assertSafeWebhookUrl('https://hooks.slack.com/services/abc').hostname).toBe(
      'hooks.slack.com',
    );
  });

  it('refuses http — drift alerts name your boards', () => {
    expect(() => assertSafeWebhookUrl('http://hooks.example.com')).toThrow(/must use https/);
  });

  it.each([
    'https://localhost/hook',
    'https://127.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://192.168.1.10/hook',
    'https://172.16.0.1/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://vault.internal/hook',
  ])('refuses %s', (url) => {
    // The last one is a cloud metadata service. An app that will POST to any
    // address a user types is a probe of its own network.
    expect(() => assertSafeWebhookUrl(url)).toThrow(/private or loopback/);
  });

  it('does not refuse a public address that merely looks private', () => {
    // 172.32.x is outside the 172.16–172.31 private range.
    expect(() => assertSafeWebhookUrl('https://172.32.0.1/hook')).not.toThrow();
  });

  it('refuses something that is not a URL at all', () => {
    expect(() => assertSafeWebhookUrl('not a url')).toThrow(/not a valid URL/);
  });
});
