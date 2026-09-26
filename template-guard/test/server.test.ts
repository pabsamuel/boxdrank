import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server/index.js';
import { InMemoryStorage, TokenCipher } from '../src/server/storage.js';

/**
 * The HTTP layer had no tests at all, which is how it shipped without ever
 * serving the client bundle: `npm run dev` runs Vite on one port and the API
 * on another, so the missing static route was invisible until production.
 *
 * These run the real Express app on an ephemeral port.
 */

const cipher = new TokenCipher(Buffer.alloc(32, 5).toString('base64'));
let server: Server;
let base: string;
let clientDir: string;

beforeAll(async () => {
  clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-client-'));
  fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><div id="root"></div>');
  fs.mkdirSync(path.join(clientDir, 'assets'));
  fs.writeFileSync(path.join(clientDir, 'assets', 'main-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(clientDir, 'installed.html'), '<!doctype html>Installed');

  const app = createServer({
    storage: new InMemoryStorage(),
    cipher,
    signingSecret: 'signing-secret',
    oauth: { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://app/auth/callback' },
    clientDir,
    cronSecret: 'cron-secret',
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(clientDir, { recursive: true, force: true });
});

describe('serving the client', () => {
  it('serves the board view at the root — monday loads the app from here', async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="root"');
  });

  it('serves the same bundle for the dashboard widget query string', async () => {
    const res = await fetch(`${base}/?surface=widget`);
    expect(res.status).toBe(200);
  });

  it('serves the post-install page the OAuth callback redirects to', async () => {
    // Without this, every successful install ends on a 404.
    const res = await fetch(`${base}/installed.html`);
    expect(res.status).toBe(200);
  });

  it('caches fingerprinted assets hard and the entry HTML not at all', async () => {
    const asset = await fetch(`${base}/assets/main-abc123.js`);
    expect(asset.headers.get('cache-control')).toMatch(/immutable/);

    const html = await fetch(base);
    // A cached index.html points browsers at assets a deploy has deleted.
    expect(html.headers.get('cache-control')).toBe('no-store');
  });

  it('falls back to the app for an unknown path, not to a 404', async () => {
    const res = await fetch(`${base}/anything/monday/appends`);
    expect(res.status).toBe(200);
  });

  it('does not swallow an unknown /api path into the HTML fallback', async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    // Debugging an HTML page arriving where JSON was expected, through a
    // browser console, is a bad afternoon.
    expect(res.status).not.toBe(200);
    expect(res.headers.get('content-type') ?? '').not.toMatch(/html/);
  });
});

describe('security headers on a real response', () => {
  it('ships the scan headers and lets monday frame the app', async () => {
    const res = await fetch(base);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('frame-ancestors');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBeNull();
  });
});

describe('/health', () => {
  it('answers without authentication, for an uptime checker', async () => {
    const res = await fetch(`${base}/health`);
    const body = (await res.json()) as { ok: boolean; driftScheduler: { started: boolean } };
    expect(body.ok).toBe(true);
    expect(body.driftScheduler.started).toBe(false);
  });
});

describe('the monday code cron endpoint', () => {
  it('refuses when drift monitoring is not enabled on this deployment', async () => {
    const res = await fetch(`${base}/mndy-cronjob/drift`, {
      method: 'POST',
      headers: { 'X-Template-Guard-Cron': 'cron-secret' },
    });
    expect(res.status).toBe(503);
  });

  it('refuses a caller that does not present the shared secret', async () => {
    const res = await fetch(`${base}/mndy-cronjob/drift`, { method: 'POST' });
    // 503 comes first here because no scheduler is configured; what matters is
    // that it never runs a sweep for an unauthenticated caller.
    expect([401, 503]).toContain(res.status);
  });
});

describe('the billing webhook', () => {
  it('echoes monday\'s URL-verification challenge', async () => {
    const res = await fetch(`${base}/webhooks/subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge: 'abc123' }),
    });
    expect(await res.json()).toEqual({ challenge: 'abc123' });
  });

  it('rejects an unsigned event with 401 and changes nothing', async () => {
    const res = await fetch(`${base}/webhooks/subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not.a.jwt' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('authentication', () => {
  it('refuses an API call with no session token', async () => {
    const res = await fetch(`${base}/api/templates`);
    expect(res.status).toBe(403);
    expect((await res.json()) as { kind: string }).toMatchObject({ kind: 'permission_denied' });
  });

  it('refuses a session token that does not verify', async () => {
    const res = await fetch(`${base}/api/templates`, {
      headers: { Authorization: 'Bearer aaa.bbb.ccc' },
    });
    expect(res.status).toBe(403);
  });
});

describe('the OAuth install flow', () => {
  it('sets a state cookie and redirects to monday with the same state', async () => {
    const res = await fetch(`${base}/auth/install`, { redirect: 'manual' });
    expect(res.status).toBe(302);

    const location = new URL(res.headers.get('location') ?? '');
    expect(location.host).toBe('auth.monday.com');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('tg_state=');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    // The redirect and the cookie must carry the same value, or no callback
    // can ever succeed.
    expect(setCookie).toContain(encodeURIComponent(location.searchParams.get('state') ?? 'x'));
  });

  it('refuses a callback whose state has no matching cookie', async () => {
    // The attack this stops: someone starts an install, gets a genuinely
    // signed state, and has a victim's browser complete their authorization.
    const install = await fetch(`${base}/auth/install`, { redirect: 'manual' });
    const state = new URL(install.headers.get('location') ?? '').searchParams.get('state') ?? '';

    const res = await fetch(`${base}/auth/callback?code=abc&state=${encodeURIComponent(state)}`, {
      redirect: 'manual',
    });
    expect(res.status).toBe(403);
    expect((await res.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining('could not be verified') as unknown as string,
    });
  });

  it('refuses a callback with no state at all', async () => {
    const res = await fetch(`${base}/auth/callback?code=abc`, { redirect: 'manual' });
    expect(res.status).toBe(403);
  });

  it('refuses a callback with no code', async () => {
    const res = await fetch(`${base}/auth/callback?state=x`, { redirect: 'manual' });
    expect(res.status).toBe(403);
  });
});
