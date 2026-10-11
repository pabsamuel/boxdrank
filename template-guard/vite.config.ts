import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 8301 },
  build: { outDir: 'dist/client', sourcemap: true },
});
