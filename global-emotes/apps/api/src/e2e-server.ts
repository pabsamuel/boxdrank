/**
 * Standalone in-memory API (PGlite + seeds + mock providers) listening on a
 * real port — used by the web Playwright suite. Never run in production.
 */
const port = Number(process.env.E2E_API_PORT ?? 3901);
// CORS must allow the e2e web origin; set before config loads.
process.env.PUBLIC_WEB_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3900';

const { createTestApp } = await import('./test-helpers');
const t = await createTestApp();
await t.app.listen({ port, host: '127.0.0.1' });
console.log(`e2e api ready on :${port}`);
