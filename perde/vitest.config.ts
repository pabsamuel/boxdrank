import { defineConfig } from 'vitest/config';

// Unit tests live next to the code in packages/* and apps/*. The relay's
// Durable Object is covered through its pure RoomCore, so no workerd is needed.
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    environment: 'node',
  },
});
