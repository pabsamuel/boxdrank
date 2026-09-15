import process from 'node:process';
import { defineConfig } from '@playwright/test';

/**
 * Smoke tests that exercise the real camera -> pose -> render path in a real
 * browser, using Chromium's fake camera. This is how we check that the app
 * actually boots and tracks a body without a phone in hand.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      // This environment ships its own Chromium; PLAYWRIGHT_CHROMIUM_PATH lets CI
      // or a contributor point at theirs instead of re-downloading one.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
    permissions: ['camera'],
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
