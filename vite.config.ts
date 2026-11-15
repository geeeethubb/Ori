import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverTarget = process.env.VITE_DEV_SERVER_TARGET ?? 'http://localhost:8787';

/**
 * Dev only: the pitch deck (client/public/pitch) is a standalone static page outside the SPA, as in
 * production (server/index.ts). /pitch redirects to /pitch/, /pitch/ serves pitch/index.html, and a
 * missing /pitch/* file is a 404 instead of the app's index.html.
 */
function pitchDevRoutes(): Plugin {
  const pitchDir = fileURLToPath(new URL('./client/public/pitch', import.meta.url));
  return {
    name: 'ori-pitch-dev-routes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/pitch') {
          res.statusCode = 301;
          res.setHeader('Location', `/pitch/${url.search}`);
          res.end();
          return;
        }
        if (!url.pathname.startsWith('/pitch/')) return next();
        if (url.pathname === '/pitch/') {
          req.url = `/pitch/index.html${url.search}`;
          return next();
        }
        let file = '';
        try {
          file = path.resolve(pitchDir, decodeURIComponent(url.pathname.slice('/pitch/'.length)));
        } catch {
          // A malformed escape is simply not a file.
        }
        if (!file.startsWith(pitchDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not found');
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: 'client',
  plugins: [react(), pitchDevRoutes()],
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
      '^/examples/.*': serverTarget,
    },
  },
});
