import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

// Vite config for the Vue SPA. The built output (dist/) is served by the
// Cloudflare Worker as static assets. API requests proxy to wrangler dev
// (localhost:8787) during local development.
export default defineConfig({
  plugins: [vue()],
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@pokemon-online/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      '@pokemon-online/config': fileURLToPath(new URL('../../packages/config/src/index.ts', import.meta.url)),
      '@pokemon-online/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
