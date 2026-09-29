import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke e2e against the real relay (wrangler dev serving the Vite build).
 * `pnpm build` must have run first; CI does that. Locally: `pnpm build && pnpm e2e`.
 */
const port = Number(process.env.PERDE_E2E_PORT ?? 8799);
// Sandboxes with a preinstalled Chromium can point here instead of downloading one.
const executablePath = process.env.PERDE_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath },
  },
  webServer: {
    command: `pnpm --filter @perde/relay exec wrangler dev --port ${port} --ip 127.0.0.1`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
  projects: [
    { name: 'tv', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec\.ts/ },
  ],
});
