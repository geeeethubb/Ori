/**
 * Home-screen install metadata: per-app web manifests, icons (SVG and rasterized PNG), and
 * the HTML <head> injection that makes a fresh request to /apps/{id}/ install as THAT app.
 * The parent (Ori) installs with the companion icon; every personal app keeps its own icon.
 * Also serves the public-domain example photographs used by previews and the seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { config } from './config.ts';
import { APP_ID_PATTERN } from '../shared/ids.ts';
import { APP_THEME_BACKGROUND, BRAND, BRAND_ASSETS, BRAND_COLORS, appThemeColor, displayDesign, displayIcon } from '../shared/brand.ts';
import { appIconSvg, isIconColor, isIconSymbol, type AppIconSpec } from '../shared/icons.ts';
import { oriAppIconSvg, oriFaviconDocument, oriFaviconSvg } from '../shared/oriArt.ts';
import { getAppPublicMeta } from './repos/apps.ts';
import { getAppPublicLook } from './repos/appLook.ts';

/**
 * Boot payload icon for parent routes (the client reads boot icons only for personal apps). The
 * parent's real icons are the companion art from oriAppIconSvg.
 */
const STORE_ICON: AppIconSpec = { symbol: 'compass', color: 'blue' };
const CANVAS = BRAND_COLORS.canvas;

/** Manifest background per app theme (splash color on Android / iOS); shared with the client. */
const THEME_BACKGROUND: Readonly<Record<string, string>> = APP_THEME_BACKGROUND;

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

/**
 * Parent PNGs. Home-screen PNGs are opaque squares: the platform applies its own mask (iOS paints
 * transparent corners black), so the lilac fills the tile's corners. The maskable variant keeps the
 * companion inside the safe zone for circular and squircle launcher masks.
 */
export async function renderOriIconPng(size: number, maskable = false): Promise<Buffer | null> {
  const key = `ori:${size}:${maskable ? 'm' : 'r'}`;
  const cached = pngCache.get(key);
  if (cached) return cached;
  const R = await loadResvg();
  if (!R) return null;
  const svg = oriAppIconSvg(size, { maskable });
  const png = Buffer.from(new R(svg, { fitTo: { mode: 'width', value: size }, background: BRAND_COLORS.lilac }).render().asPng());
  if (pngCache.size > 500) pngCache.clear();
  pngCache.set(key, png);
  return png;
}

/** Browser-tab sizes of the parent icon: up to this many px, PNGs use the favicon drawing. */
const FAVICON_MAX_PX = 32;

/**
 * The parent favicon as a PNG (16 or 32 px): the dedicated tiny drawing with whole-pixel eyes. A tab
 * shows it as drawn, so its rounded corners stay transparent.
 */
export async function renderOriFaviconPng(size: number): Promise<Buffer | null> {
  const key = `ori-favicon:${size}`;
  const cached = pngCache.get(key);
  if (cached) return cached;
  const R = await loadResvg();
  if (!R) return null;
  const png = Buffer.from(new R(oriFaviconSvg(size), { fitTo: { mode: 'width', value: size } }).render().asPng());
  if (pngCache.size > 500) pngCache.clear();
  pngCache.set(key, png);
  return png;
}

/**
 * The icon an app SHOWS: its stored icon, except that a reference app still carrying a superseded
 * default (pre-Ori, or Riff's interim wave) shows the canonical icon (display only; the stored spec
 * is untouched).
 */
function iconFor(meta: { name: string; iconSymbol: string; iconColor: string } | null): AppIconSpec {
  if (!meta) return STORE_ICON;
  const stored: AppIconSpec = { symbol: isIconSymbol(meta.iconSymbol) ? meta.iconSymbol : 'compass', color: isIconColor(meta.iconColor) ? meta.iconColor : 'blue' };
  return displayIcon(meta.name, stored);
}

/**
 * The theme an app SHOWS: its stored design through displayDesign, exactly as the runtime resolves
 * it, so the manifest background and theme-color match the app a home-screen icon opens (a People
 * app on its legacy mint + blue look shows, and so installs, as white with orange). Falls back to the
 * stored theme when the design cannot be read.
 */
function shownTheme(appId: string, meta: { name: string; theme: string | null }): string | null {
  const look = getAppPublicLook(appId);
  return look ? displayDesign(meta.name, look).theme : meta.theme;
}

/** Browser chrome color: the app's own surface when its theme is known, else the icon color (shared/brand.ts). */
const themeColor = appThemeColor;

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
    background_color: (theme && Object.hasOwn(THEME_BACKGROUND, theme) ? THEME_BACKGROUND[theme] : undefined) ?? CANVAS,
    theme_color: themeColor(icon, theme),
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
    description: BRAND.productSentence,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: BRAND_ASSETS.backgroundColor,
    theme_color: BRAND_ASSETS.themeColor,
    icons: [
      { src: '/icons/store-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/store-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/store-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// ---------- routes ----------

export const installRoutes = new Hono();

function iconResponse(png: Buffer | null, fallbackSvg: () => string): Response {
  if (!png) {
    // Graceful fallback: SVG still renders in browsers and on Android; iOS needs PNG.
    return new Response(fallbackSvg(), { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
  }
  // Icons are public assets; the Android shell fetches them cross-origin to build launcher shortcuts.
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' } });
}

async function pngResponse(icon: AppIconSpec, size: number, maskable: boolean): Promise<Response> {
  return iconResponse(await renderIconPng(icon, size, maskable), () => appIconSvg(icon, size));
}

installRoutes.get('/manifest.webmanifest', (c) => c.body(JSON.stringify(storeManifest()), 200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }));
// Hono parameters must occupy a whole path segment, so the file name is one param with a regex.
const ICON_FILE = /^(?:icon|store)-(\d+)(-maskable)?\.png$/;
installRoutes.get('/icons/:file{store-\\d+(?:-maskable)?\\.png}', async (c) => {
  const m = ICON_FILE.exec(c.req.param('file') ?? '');
  if (!m) return c.notFound();
  const maskable = Boolean(m[2]);
  const requested = Number(m[1]);
  if (!maskable && requested <= FAVICON_MAX_PX) {
    // store-16.png and store-32.png: the favicon drawing, at exactly that size (at least 16 px).
    const small = Math.max(16, requested);
    return iconResponse(await renderOriFaviconPng(small), () => oriFaviconSvg(small));
  }
  const size = clampSize(m[1] as string);
  return iconResponse(await renderOriIconPng(size, maskable), () => oriAppIconSvg(size, { maskable }));
});
// The parent favicon: the tiny drawing at tab sizes (16 and 32 px), the full app icon from 48 px.
installRoutes.get('/icons/store.svg', (c) => c.body(oriFaviconDocument(), 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' }));

installRoutes.get('/apps/:appId/manifest.webmanifest', (c) => {
  const appId = c.req.param('appId');
  if (!APP_ID_PATTERN.test(appId)) return c.notFound();
  const meta = getAppPublicMeta(appId);
  if (!meta) return c.notFound();
  return c.body(JSON.stringify(appManifest(appId, meta.name, iconFor(meta), shownTheme(appId, meta))), 200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' });
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
  const manifest = boot.appId ? `${base}manifest.webmanifest` : BRAND_ASSETS.manifest;
  const touchIcon = boot.appId ? `${base}icon-180.png` : BRAND_ASSETS.touchIcon;
  const head = [
    `<link rel="manifest" href="${manifest}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${touchIcon}">`,
    `<link rel="icon" type="image/svg+xml" href="${boot.appId ? `${base}icon.svg` : BRAND_ASSETS.favicon}">`,
    `<meta name="apple-mobile-web-app-title" content="${name}">`,
    `<meta name="application-name" content="${name}">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
    `<meta name="theme-color" content="${boot.appId ? themeColor(boot.icon, boot.theme) : BRAND_ASSETS.themeColor}">`,
    `<script>window.__AAS_BOOT__=${JSON.stringify({ appId: boot.appId, name: boot.name, icon: boot.icon, purpose: boot.purpose ?? null, theme: boot.theme ?? null }).replace(/</g, '\\u003c')}</script>`,
  ].join('\n    ');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`)
    .replace('</head>', `    ${head}\n  </head>`);
}

export function bootForApp(appId: string | undefined): BootInfo {
  if (appId && APP_ID_PATTERN.test(appId)) {
    const meta = getAppPublicMeta(appId);
    if (meta) return { appId, name: meta.name, icon: iconFor(meta), purpose: meta.purpose, theme: shownTheme(appId, meta) };
  }
  return { appId: null, name: BRAND.name, icon: STORE_ICON };
}
