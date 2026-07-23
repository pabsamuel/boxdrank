import { defineConfig } from '@playwright/test';

/**
 * Browser e2e: real Next.js dev server + the in-memory e2e API (PGlite, seeded,
 * mock providers). No external services. Run: pnpm --filter @global-emotes/web e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:3900',
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  webServer: [
    {
      command: 'pnpm --filter @global-emotes/api exec tsx src/e2e-server.ts',
      url: 'http://127.0.0.1:3901/v1/health',
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next dev -p 3900',
      url: 'http://127.0.0.1:3900',
      reuseExistingServer: !process.env.CI,
      env: {
        PUBLIC_API_URL: 'http://127.0.0.1:3901',
        BRAND_NAME: 'Global Emotes',
      },
      timeout: 120_000,
    },
  ],
});
