/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
  test: {
    // Unit tests only. The e2e/ suite is Playwright and runs separately
    // (`npm run test:e2e`) because it needs a browser and a built app.
    include: ['src/**/*.test.ts'],
  },
});
