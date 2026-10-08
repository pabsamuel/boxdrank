import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Unit-test scope for the web app.
 *
 * The specs under `e2e/` are Playwright, driven by `playwright.config.ts` via
 * `pnpm --filter @global-emotes/web e2e`. Vitest's default glob matches
 * `**\/*.spec.ts`, so without this exclude it collects them and fails on
 * Playwright's `test()` being called outside its own runner — which breaks
 * `pnpm verify`. Keep the two runners' scopes disjoint.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
