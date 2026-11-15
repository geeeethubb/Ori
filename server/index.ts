/** Server: API + install metadata + built client. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { config, resolveModelMode } from './config.ts';
import { openDatabase } from './db/index.ts';
import { authRoutes } from './routes/auth.ts';
import { appRoutes } from './routes/apps.ts';
import { bootForApp, installRoutes, loadIndexHtml, renderIndex } from './install.ts';
import { APP_ID_PATTERN } from '../shared/ids.ts';
import { BRAND } from '../shared/brand.ts';
import { mountExtraRoutes } from './routes/register.ts';
import { seedOnStart } from './seedOnStart.ts';

export function createServer(): Hono {
  openDatabase();
  const app = new Hono();

  app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
  app.use(
    '/api/*',
    cors({
      origin: (origin) => {
        if (!origin) return origin;
        const allowed = new Set([
          'https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost',
          config.publicOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173', ...config.corsOrigins,
        ]);
        return allowed.has(origin) ? origin : '';
      },
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'X-Client'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  );
  // JSON bodies are small; photo uploads (/api/media) carry their own, larger limit.
  const jsonLimit = bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'That upload is too large (1 MB max).', code: 'too_large' }, 413) });
  app.use('/api/*', async (c, next) => (c.req.path.startsWith('/api/media') ? next() : jsonLimit(c, next)));

  app.get('/api/health', (c) => c.json({ ok: true, name: BRAND.name, modelMode: resolveModelMode(), aiGenerationAllowance: config.aiGenerationAllowance, trialDays: config.trialDays, time: new Date().toISOString() }));
  app.route('/api/auth', authRoutes);
  app.route('/api/apps', appRoutes);
  mountExtraRoutes(app);

  app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found.', code: 'not_found' }, 404) : c.text('Not found', 404)));
  app.onError((err, c) => {
    console.error('[server]', err);
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Something went wrong on our side. Your data is safe; please try again.', code: 'server_error' }, 500);
    return c.text('Server error', 500);
  });

  app.route('/', installRoutes);

  // Built client (production / tests). In `npm run dev` Vite serves the client instead.
  const relDist = path.relative(process.cwd(), config.clientDist).split(path.sep).join('/');
  app.use('/assets/*', serveStatic({ root: relDist, onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }));
  app.use('/favicon.svg', serveStatic({ root: relDist }));
  app.use('/robots.txt', serveStatic({ root: relDist }));

  // The pitch deck: a standalone static page (client/public/pitch, copied into the built client),
  // public like the rest of the static site and outside the app shell. /pitch redirects to /pitch/ so
  // its relative assets resolve; a missing /pitch/* file is a 404, never the SPA.
  app.get('/pitch', (c) => c.redirect(`/pitch/${new URL(c.req.url).search}`, 301));
  app.use('/pitch/*', async (c, next) => {
    await next();
    if (c.res.status !== 200 && c.res.status !== 206) return;
    const p = c.req.path;
    const page = p.endsWith('/') || p.endsWith('.html') || p.endsWith('/config.js');
    c.header('Cache-Control', page ? 'no-store' : 'public, max-age=300');
  });
  app.use('/pitch/*', serveStatic({ root: relDist }));
  app.all('/pitch/*', (c) => c.text('Not found', 404));

  app.get('*', (c) => {
    const html = loadIndexHtml();
    if (!html) {
      return c.html(
        `<!doctype html><meta charset="utf-8"><title>${BRAND.name}</title><body style="font-family:system-ui;padding:2rem"><h1>Client not built</h1><p>Run <code>npm run build</code> then restart, or use <code>npm run dev</code> and open <a href="http://localhost:5173">http://localhost:5173</a>.</p></body>`,
        503,
      );
    }
    const m = /^\/apps\/([^/]+)(?:\/|$)/.exec(c.req.path);
    const appId = m && APP_ID_PATTERN.test(m[1] as string) ? (m[1] as string) : undefined;
    return c.html(renderIndex(html, bootForApp(appId)), 200, { 'Cache-Control': 'no-store' });
  });

  return app;
}

const isMain = Boolean(process.argv[1]) && path.resolve(process.argv[1] as string) === path.resolve(fileURLToPath(import.meta.url));
if (isMain || process.env.AAS_SERVE === '1') {
  const app = createServer();
  // Off unless SEED_DEMO_ON_START=true: additive demo seeding for a hosted demo, finished before the first request.
  await seedOnStart();
  serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
    console.log(`[server] ${BRAND.name} listening on http://localhost:${info.port} (model mode: ${resolveModelMode()}, db: ${config.databasePath})`);
  });
}
