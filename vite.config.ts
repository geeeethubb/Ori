import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const serverTarget = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': serverTarget,
      '^/apps/[^/]+/(manifest\.webmanifest|icon.*)$': serverTarget,
      '/manifest.webmanifest': serverTarget,
      '^/icons/.*': serverTarget,
    },
  },
});
