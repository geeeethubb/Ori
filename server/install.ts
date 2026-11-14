/**
 * Home-screen install metadata: per-app web manifests, icons (SVG and rasterized PNG), and
 * the HTML <head> injection that makes a fresh request to /apps/{id}/ install as THAT app.
 * Also serves the public-domain example photographs used by previews and the seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { config } from './config.ts';
import { APP_ID_PATTERN } from '../shared/ids.ts';
import { BRAND } from '../shared/brand.ts';
import { ICON_GRADIENTS, appIconSvg, isIconColor, isIconSymbol, type AppIconSpec } from '../shared/icons.ts';
import { getAppPublicMeta } from './repos/apps.ts';

/** Temporary brand mark: a blue tile with a "play" shape made of the sparkle-free compass glyph. */
const STORE_ICON: AppIconSpec = { symbol: 'compass', color: 'blue' };
const CANVAS = '#F7F8FC';

/** Manifest background per app theme (splash color on Android / iOS). */
const THEME_BACKGROUND: Record<string, string> = {
  bright: '#F7F8FC', paper: '#FAF8F4', charcoal: '#181A1F', ink: '#162039', mint: '#F3FBF7', lilac: '#F6F1FF', sunset: '#FFF4EF',
};

type Resvg = typeof import('@resvg/resvg-js').Resvg;
let resvgCtor: Resvg | null | undefined;
async function loadResvg(): Promise<Resvg | null> {
  if (resvgCtor !== undefined) return resvgCtor;
  try {
    resvgCtor = (await import('@resvg/resvg-js')).Resvg;
  } catch (err) {
    console.warn('[install] @resvg/resvg-js unavailable; PNG icons disabled:', (err as Error).message);
    resvgCtor = null;
  }
  return resvgCtor;
}

const pngCache = new Map<string, Buffer>();

export async function renderIconPng(icon: AppIconSpec, size: number, maskable = false): Promise<Buffer | null> {
  const key = `${icon.symbol}:${icon.color}:${size}:${maskable ? 'm' : 'r'}`;
  const cached = pngCache.get(key);
  if (cached) return cached;
  const R = await loadResvg();
  if (!R) return null;
  // Maskable/adaptive icons: full-bleed square (launcher applies its own mask); iOS also masks.
  const svg = appIconSvg(icon, size, maskable ? 0 : 0);
  const png = Buffer.from(new R(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  if (pngCache.size > 500) pngCache.clear();
  pngCache.set(key, png);
  return png;
}

function iconFor(meta: { iconSymbol: string; iconColor: string } | null): AppIconSpec {
  if (!meta) return STORE_ICON;
  return { symbol: isIconSymbol(meta.iconSymbol) ? meta.iconSymbol : 'compass', color: isIconColor(meta.iconColor) ? meta.iconColor : 'blue' };
}

function themeColor(icon: AppIconSpec): string {
  return ICON_GRADIENTS[icon.color][1];
}

function shortName(name: string): string {
  return name.length <= 12 ? name : name.slice(0, 12).trim();
}

export function appManifest(appId: string, name: string, icon: AppIconSpec, theme?: string | null): Record<string, unknown> {
  const base = `/apps/${appId}/`;
  return {
    id: base,
    name,
    short_name: shortName(name),
    description: `${name}, your personal app from ${BRAND.name}`,
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: THEME_BACKGROUND[theme ?? 'bright'] ?? CANVAS,
    theme_color: themeColor(icon),
    icons: [
      { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}icon-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

export function storeManifest(): Record<string, unknown> {
  return {
    id: '/',
    name: BRAND.name,
    short_name: BRAND.shortName,
    description: BRAND.tagline,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: CANVAS,
    theme_color: themeColor(STORE_ICON),
    icons: [
      { src: '/icons/store-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/store-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/store-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// ---------- routes ----------

export const installRoutes = new Hono();

async function pngResponse(icon: AppIconSpec, size: number, maskable: boolean): Promise<Response> {
  const png = await renderIconPng(icon, size, maskable);
  if (!png) {
    // Graceful fallback: SVG still renders in browsers and on Android; iOS needs PNG.
    return new Response(appIconSvg(icon, size), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
  }
  // Icons are public assets; the Android shell fetches them cross-origin to build launcher shortcuts.
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
}

installRoutes.get('/manifest.webmanifest', (c) => c.body(JSON.stringify(storeManifest()), 200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }));
// Hono parameters must occupy a whole path segment, so the file name is one param with a regex.
const ICON_FILE = /^(?:icon|store)-(\d+)(-maskable)?\.png$/;
installRoutes.get('/icons/:file{store-\\d+(?:-maskable)?\\.png}', (c) => {
  const m = ICON_FILE.exec(c.req.param('file') ?? '');
  if (!m) return c.notFound();
  return pngResponse(STORE_ICON, clampSize(m[1] as string), Boolean(m[2]));
});
installRoutes.get('/icons/store.svg', (c) => c.body(appIconSvg(STORE_ICON, 256), 200, { 'Content-Type': 'image/svg+xml' }));

installRoutes.get('/apps/:appId/manifest.webmanifest', (c) => {
  const appId = c.req.param('appId');
  if (!APP_ID_PATTERN.test(appId)) return c.notFound();
  const meta = getAppPublicMeta(appId);
  if (!meta) return c.notFound();
  return c.body(JSON.stringify(appManifest(appId, meta.name, iconFor(meta), meta.theme)), 200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
});

installRoutes.get('/apps/:appId/icon.svg', (c) => {
  const appId = c.req.param('appId');
  const meta = APP_ID_PATTERN.test(appId) ? getAppPublicMeta(appId) : null;
  if (!meta) return c.notFound();
  return c.body(appIconSvg(iconFor(meta), 256), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' });
});

installRoutes.get('/apps/:appId/:file{icon-\\d+(?:-maskable)?\\.png}', (c) => {
  const appId = c.req.param('appId');
  const m = ICON_FILE.exec(c.req.param('file') ?? '');
  const meta = m && APP_ID_PATTERN.test(appId) ? getAppPublicMeta(appId) : null;
  if (!meta || !m) return c.notFound();
  return pngResponse(iconFor(meta), clampSize(m[1] as string), Boolean(m[2]));
});

/** Public-domain example photographs (CC0, Wikimedia Commons; see docs/ASSET_SOURCES.md). */
const EXAMPLES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'media');
installRoutes.get('/examples/:file{light-[1-4]\\.jpg}', (c) => {
  const file = path.basename(c.req.param('file') ?? '');
  const full = path.join(EXAMPLES_DIR, file);
  if (!fs.existsSync(full)) return c.notFound();
  return c.body(new Uint8Array(fs.readFileSync(full)), 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800' });
});

function clampSize(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 192;
  return Math.min(1024, Math.max(48, Math.round(n)));
}

// ---------- HTML head injection ----------

let indexCache: { html: string; mtime: number } | null = null;

export function loadIndexHtml(): string | null {
  const file = path.join(config.clientDist, 'index.html');
  try {
    const stat = fs.statSync(file);
    if (!indexCache || indexCache.mtime !== stat.mtimeMs) indexCache = { html: fs.readFileSync(file, 'utf8'), mtime: stat.mtimeMs };
    return indexCache.html;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}

export interface BootInfo {
  appId: string | null;
  name: string;
  icon: AppIconSpec;
  purpose?: string;
  theme?: string | null;
}

/** Inject the right title, manifest, apple-touch-icon and theme color for this route. */
export function renderIndex(html: string, boot: BootInfo): string {
  const name = escapeHtml(boot.name);
  const base = boot.appId ? `/apps/${boot.appId}/` : '/';
  const manifest = boot.appId ? `${base}manifest.webmanifest` : '/manifest.webmanifest';
  const touchIcon = boot.appId ? `${base}icon-180.png` : '/icons/store-180.png';
  const head = [
    `<link rel="manifest" href="${manifest}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${touchIcon}">`,
    `<link rel="icon" type="image/svg+xml" href="${boot.appId ? `${base}icon.svg` : '/icons/store.svg'}">`,
    `<meta name="apple-mobile-web-app-title" content="${name}">`,
    `<meta name="application-name" content="${name}">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
    `<meta name="theme-color" content="${themeColor(boot.icon)}">`,
    `<script>window.__AAS_BOOT__=${JSON.stringify({ appId: boot.appId, name: boot.name, icon: boot.icon, purpose: boot.purpose ?? null, theme: boot.theme ?? null }).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`)
    .replace('</head>', `    ${head}\n  </head>`);
}

export function bootForApp(appId: string | undefined): BootInfo {
  if (appId && APP_ID_PATTERN.test(appId)) {
    const meta = getAppPublicMeta(appId);
    if (meta) return { appId, name: meta.name, icon: iconFor(meta), purpose: meta.purpose, theme: meta.theme };
  }
  return { appId: null, name: BRAND.name, icon: STORE_ICON };
}
