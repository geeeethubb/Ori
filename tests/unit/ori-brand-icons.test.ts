/**
 * Ori brand identity (docs/ori/ORI_DESIGN_SPEC.md sections 1.1, 3 and 8): one canonical icon per
 * reference app everywhere; a display-only mapping of the superseded defaults (stored specs and icons
 * people chose are never touched); Riff's level bars as their own symbol, so the 'waveform' glyph
 * apps chose keeps its wave; home-screen PNGs without an edge line under platform masks; the People
 * look shown in its install metadata; and the parent install identity (favicon, tab PNGs, launcher
 * PNGs, manifest, index head).
 */
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { makeClient, type TestClient } from '../helpers/testServer.ts';
import {
  APP_THEME_BACKGROUND,
  BRAND,
  BRAND_ASSETS,
  BRAND_COLORS,
  LEGACY_PEOPLE_LOOK,
  NAV,
  REFERENCE_APP_ICONS,
  appThemeColor,
  displayDesign,
  displayIcon,
  referenceIcon,
  supersededIcons,
} from '../../shared/brand.ts';
import { ICON_COLORS, ICON_GLYPH, ICON_GRADIENTS, ICON_PATHS, ICON_SYMBOLS, OUTLINED_COLORS, appIconSvg, type AppIconSpec } from '../../shared/icons.ts';
import { ORI_BODY_PATH, ORI_COLORS, ORI_FAVICON_GRIDS } from '../../shared/oriArt.ts';
import { AppSpecSchema, designFor, type AppDesign } from '../../shared/appSpec.ts';
import type { AppDetailDto } from '../../shared/api.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';
import { appManifest, bootForApp, renderIndex, renderOriIconPng, storeManifest } from '../../server/install.ts';

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

type RGBA = [number, number, number, number];

/** A minimal decoder for the 8-bit, non-interlaced PNGs resvg writes, so served bytes can be checked. */
function decodePng(buf: Buffer): { width: number; height: number; at(x: number, y: number): RGBA } {
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('latin1');
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8], 'bit depth').toBe(8);
      expect(data[12], 'interlace').toBe(0);
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[data[9]!] ?? 0;
      expect(channels, `colour type ${data[9]}`).toBeGreaterThan(0);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[y * stride + i - channels]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= channels ? px[(y - 1) * stride + i - channels]! : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + i] = (src[i]! + pred) & 255;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      const i = Math.floor(y) * stride + Math.floor(x) * channels;
      if (channels === 4) return [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!];
      if (channels === 3) return [px[i]!, px[i + 1]!, px[i + 2]!, 255];
      if (channels === 2) return [px[i]!, px[i]!, px[i]!, px[i + 1]!];
      return [px[i]!, px[i]!, px[i]!, 255];
    },
  };
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function expectColor(p: RGBA, hex: string, label?: string, tolerance = 6): void {
  const [r, g, b] = hexRgb(hex);
  expect(p[3], `${label ?? hex}: opaque`).toBeGreaterThan(250);
  expect(Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b), `${label ?? hex}: rgb(${p.slice(0, 3).join(',')})`).toBeLessThanOrEqual(tolerance);
}

async function png(client: TestClient, path: string) {
  const res = await client.app.request(new Request(`http://local${path}`));
  expect(res.status, path).toBe(200);
  expect(res.headers.get('Content-Type'), path).toBe('image/png');
  return decodePng(Buffer.from(await res.arrayBuffer()));
}

/** Riff's level bars, and the continuous wave 'waveform' has drawn since the redesign (26381e8). */
const LEVEL_BARS = 'M2 10v3 M6 6v11 M10 3v18 M14 8v7 M18 5v13 M22 10v3';
const WAVE = 'M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2';

describe('brand', () => {
  it('is Ori, decided, with the internal identifiers kept', () => {
    expect(BRAND).toMatchObject({ name: 'Ori', shortName: 'Ori', nameStatus: 'decided', legacyName: 'AI App Store' });
    expect(NAV.map((n) => [n.key, n.label, n.path])).toEqual([['agent', 'Agent', '/agent'], ['playground', 'Playground', '/playground'], ['apps', 'My apps', '/apps']]);
  });

  it('keeps the old field names pointing at the right messages', () => {
    expect(BRAND.tagline).toBe(BRAND.headline);
    expect(BRAND.headline).toBe('Your interests have somewhere to go.');
    expect(BRAND.description).toBe(BRAND.landingExplainer);
    expect(BRAND.oneLiner).toBe(BRAND.productSentence);
    expect(BRAND.promise).toBe('Your AI companion. Your world, in your pocket.');
    expect(BRAND.benefit).toBe('Apps made for you. Right on your home screen.');
    expect(BRAND.signature).toBe('Your curiosity. Your story.');
  });
});

describe('canonical reference-app icons', () => {
  it('Light, Riff and People ship with the canonical icons: camera on charcoal, level bars on ink, people on white', () => {
    expect(referenceIcon('light')).toEqual({ symbol: 'camera', color: 'charcoal' });
    expect(referenceIcon('riff')).toEqual({ symbol: 'levels', color: 'ink' });
    expect(referenceIcon('people')).toEqual({ symbol: 'people', color: 'white' });
    // An app made from a fixture shows the same icon as its card.
    expect(LIGHT_GALLERY.icon).toEqual(referenceIcon('light'));
    expect(RIFF_PRACTICE.icon).toEqual(referenceIcon('riff'));
    expect(PEOPLE_QUEUE.icon).toEqual(referenceIcon('people'));
  });

  it('maps every superseded default of a reference app, for display: the pre-Ori one and the interim Riff wave', () => {
    expect(supersededIcons('riff')).toEqual([{ symbol: 'guitar', color: 'ink' }, { symbol: 'waveform', color: 'ink' }]);
    expect(displayIcon('Riff', { symbol: 'guitar', color: 'ink' })).toEqual({ symbol: 'levels', color: 'ink' });
    // Riffs made from the fixture between the Ori foundation (eb2f82c) and the 'levels' symbol stored waveform/ink.
    expect(displayIcon('Riff', { symbol: 'waveform', color: 'ink' })).toEqual({ symbol: 'levels', color: 'ink' });
    expect(displayIcon('Light', { symbol: 'aperture', color: 'charcoal' })).toEqual({ symbol: 'camera', color: 'charcoal' });
    expect(displayIcon('People', { symbol: 'contact', color: 'mint' })).toEqual({ symbol: 'people', color: 'white' });
  });

  it('never touches an icon a person chose, another app, or a near miss', () => {
    const cases: [string | null | undefined, AppIconSpec][] = [
      ['Riff', { symbol: 'guitar', color: 'plum' }],
      ['Riff', { symbol: 'waveform', color: 'plum' }],
      ['Riff', { symbol: 'music', color: 'ink' }],
      ['Riff', { symbol: 'levels', color: 'lime' }],
      ['My Riff', { symbol: 'guitar', color: 'ink' }],
      ['Jam', { symbol: 'waveform', color: 'ink' }],
      ['riff', { symbol: 'waveform', color: 'ink' }],
      ['Light', { symbol: 'waveform', color: 'ink' }],
      ['Light', { symbol: 'aperture', color: 'paper' }],
      ['Darkroom', { symbol: 'aperture', color: 'charcoal' }],
      ['People', { symbol: 'people', color: 'teal' }],
      ['People', { symbol: 'waveform', color: 'ink' }],
      [undefined, { symbol: 'guitar', color: 'ink' }],
      ['', { symbol: 'contact', color: 'mint' }],
    ];
    for (const [name, icon] of cases) expect(displayIcon(name, icon), `${name} ${icon.symbol}/${icon.color}`).toBe(icon);
  });

  it('hands out copies, so a caller cannot edit the registry', () => {
    const shown = displayIcon('Riff', { symbol: 'waveform', color: 'ink' });
    shown.color = 'plum';
    expect(REFERENCE_APP_ICONS.riff.icon.color).toBe('ink');
    const old = supersededIcons('riff');
    old[1]!.color = 'plum';
    expect(REFERENCE_APP_ICONS.riff.interim[0].color).toBe('ink');
  });
});

describe('icon vocabulary', () => {
  it('level bars are a new symbol; the waveform glyph is the wave apps chose, exactly as before', () => {
    expect(ICON_SYMBOLS).toContain('levels');
    expect(ICON_SYMBOLS).toContain('waveform');
    expect(ICON_PATHS.levels).toBe(LEVEL_BARS);
    expect(ICON_PATHS.waveform).toBe(WAVE);
    expect(appIconSvg({ symbol: 'waveform', color: 'ink' })).toContain(WAVE);
    expect(appIconSvg({ symbol: 'levels', color: 'ink' })).toContain(LEVEL_BARS);
  });

  it('white is additive: a white tile with an orange glyph that reaches 3:1', () => {
    expect(ICON_COLORS).toContain('white');
    expect(ICON_GRADIENTS.white).toEqual(['#FFFFFF', '#FFFFFF']);
    expect(contrast(ICON_GLYPH.white, '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('near-white tiles get a hairline only where they draw their own corners, never on a full-bleed tile', () => {
    expect(OUTLINED_COLORS.has('white')).toBe(true);
    expect(appIconSvg({ symbol: 'people', color: 'white' })).toContain('stroke="#DCE0EC"');
    expect(appIconSvg({ symbol: 'people', color: 'white' }, 192, 0)).not.toContain('#DCE0EC');
    expect(appIconSvg({ symbol: 'camera', color: 'paper' }, 192, 0)).not.toContain('#DCE0EC');
  });

  it('Light shows a white camera on charcoal; Riff a lime glyph on ink', () => {
    expect(ICON_GLYPH.charcoal.toLowerCase()).toBe('#ffffff');
    expect(ICON_GRADIENTS.charcoal[0]).toBe(BRAND_COLORS.lightCharcoal);
    expect(ICON_GLYPH.ink).toBe(ORI_COLORS.lime);
    expect(ICON_GRADIENTS.ink[0]).toBe(BRAND_COLORS.ink);
  });

  it('every glyph reaches 3:1 against its own tile', () => {
    for (const c of ICON_COLORS) expect(contrast(ICON_GLYPH[c], ICON_GRADIENTS[c][1]), c).toBeGreaterThanOrEqual(3);
  });

  it('no flattened glyph starts a later subpath with a relative move (it would render displaced)', () => {
    // Glyphs join Lucide's separate paths with a space; a lowercase "m" right after that space is
    // relative to wherever the previous subpath ended, not to the 24x24 box.
    expect(ICON_SYMBOLS.filter((s) => / m/.test(ICON_PATHS[s]))).toEqual([]);
  });
});

describe('displayDesign: the People look is shown, never stored', () => {
  const legacy: Required<AppDesign> = { theme: 'mint', accent: 'blue', typography: 'compact', density: 'compact', artwork: 'none' };

  it('shows only the exact legacy People look (mint + blue) as white with orange, keeping the rest', () => {
    const before = JSON.stringify(legacy);
    expect(displayDesign('People', legacy)).toEqual({ ...legacy, theme: 'bright', accent: 'orange' });
    expect(JSON.stringify(legacy)).toBe(before);
    expect(LEGACY_PEOPLE_LOOK).toEqual({ theme: 'mint', accent: 'blue' });
    // The fixture still stores that legacy look; every People app made from it shows the Ori look.
    expect(displayDesign(PEOPLE_QUEUE.name, designFor(PEOPLE_QUEUE as Parameters<typeof designFor>[0])).theme).toBe('bright');
  });

  it('returns a chosen look, other apps and calls without a name as the very same object', () => {
    for (const [name, design] of [
      ['People', { ...legacy, accent: 'teal' }],
      ['People', { ...legacy, theme: 'lilac' }],
      ['Follow-ups', legacy],
      ['people', legacy],
      [undefined, legacy],
      [null, legacy],
    ] as const) {
      expect(displayDesign(name, design), `${name} ${design.theme}/${design.accent}`).toBe(design);
    }
  });

  it('one chrome-colour rule for the page and its manifest: the shown theme, else the shown icon', () => {
    expect(appThemeColor(displayIcon('People', { symbol: 'contact', color: 'mint' }), displayDesign('People', legacy).theme)).toBe('#FFFFFF');
    expect(appThemeColor(referenceIcon('people'), 'mint')).toBe(APP_THEME_BACKGROUND.mint);
    expect(appThemeColor(referenceIcon('riff'), 'ink')).toBe(BRAND_COLORS.ink);
    expect(appThemeColor(referenceIcon('light'), 'paper')).toBe(BRAND_COLORS.lightPaper);
    expect(appThemeColor({ symbol: 'compass', color: 'blue' }, 'toString')).toBe(BRAND_COLORS.cobalt); // not a theme
    expect(appThemeColor({ symbol: 'compass', color: 'blue' }, null)).toBe(BRAND_COLORS.cobalt);
  });
});

describe('parent install identity', () => {
  it('the parent manifest is Ori with the product sentence and brand colours', () => {
    expect(storeManifest()).toMatchObject({ name: 'Ori', short_name: 'Ori', description: BRAND.productSentence, theme_color: BRAND_ASSETS.themeColor, background_color: BRAND_ASSETS.backgroundColor });
  });

  it('parent pages link the Ori favicon, touch icon, manifest and title', () => {
    const html = renderIndex('<html><head><title>x</title></head><body></body></html>', bootForApp(undefined));
    expect(html).toContain('<title>Ori</title>');
    expect(html).toContain(`<link rel="icon" type="image/svg+xml" href="${BRAND_ASSETS.favicon}">`);
    expect(html).toContain(`href="${BRAND_ASSETS.touchIcon}"`);
    expect(html).toContain(`<link rel="manifest" href="${BRAND_ASSETS.manifest}">`);
    expect(html).toContain(`<meta name="theme-color" content="${BRAND_ASSETS.themeColor}">`);
  });

  it('the favicon document is the companion: a tiny drawing at tab sizes, the app icon from 48 px', async () => {
    const client = await makeClient();
    const svg = await client.request(BRAND_ASSETS.favicon);
    expect(svg.status).toBe(200);
    expect(svg.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(svg.text).toContain(ORI_COLORS.lilac);
    expect(svg.text).toContain(ORI_BODY_PATH);
    expect(svg.text).toContain('@media (min-width:24px)');
    expect(svg.text).toContain('@media (min-width:48px)');
    expect(svg.text).not.toContain(ICON_PATHS.compass);
  });

  it('the 16 and 32 px tab PNGs are the favicon drawing, with two whole-pixel eyes and a cobalt gap', async () => {
    const client = await makeClient();
    for (const grid of [16, 32] as const) {
      const img = await png(client, `/icons/store-${grid}.png`);
      expect([img.width, img.height]).toEqual([grid, grid]);
      const spec = ORI_FAVICON_GRIDS[grid];
      const [w, h] = spec.eyeSize;
      const rows = spec.eyeRadius > 0 ? [1, h - 2] : [0, h - 1];
      for (const [ex, ey] of spec.eyes) {
        for (let x = ex; x < ex + w; x++) for (let y = ey + rows[0]!; y <= ey + rows[1]!; y++) expectColor(img.at(x, y), ORI_COLORS.white, `${grid}px eye ${x},${y}`);
      }
      const [[lx], [rx]] = spec.eyes as [readonly [number, number], readonly [number, number]];
      for (let x = lx + w; x < rx; x++) expectColor(img.at(x, spec.eyes[0]![1] + 1), ORI_COLORS.cobalt, `${grid}px gap ${x}`);
    }
  });

  it('the launcher PNGs are opaque lilac tiles at the requested size, plain and maskable', async () => {
    const client = await makeClient();
    for (const path of ['/icons/store-180.png', '/icons/store-192.png', '/icons/store-512-maskable.png']) {
      const img = await png(client, path);
      const size = Number(/store-(\d+)/.exec(path)![1]);
      expect([img.width, img.height], path).toEqual([size, size]);
      expectColor(img.at(0, 0), ORI_COLORS.lilac, `${path} corner`);
      expectColor(img.at(size - 1, size - 1), ORI_COLORS.lilac, `${path} far corner`);
      expectColor(img.at(size / 2, size * 0.65), ORI_COLORS.cobalt, `${path} body, below the eyes`);
    }
    for (const maskable of [false, true]) {
      const buf = await renderOriIconPng(180, maskable);
      expect(buf && decodePng(buf).width).toBe(180);
    }
  });
});

describe('home-screen identity of existing reference apps', () => {
  async function made(client: TestClient, token: string, fixture: string): Promise<string> {
    const res = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture }, token });
    expect(res.status).toBe(201);
    return res.json.app.id;
  }
  /** A People app as made before the Ori rebrand: the template's earlier mint look and contact icon, stored as is. */
  async function madeLegacyPeople(client: TestClient, token: string): Promise<string> {
    const spec = structuredClone(AppSpecSchema.parse(PEOPLE_QUEUE));
    spec.design = { ...spec.design, theme: 'mint', accent: 'blue' } as AppDesign;
    spec.icon = { symbol: 'contact', color: 'mint' };
    const res = await client.request<AppDetailDto>('/api/apps', { body: { spec }, token });
    expect(res.status).toBe(201);
    return res.json.app.id;
  }
  const revise = (client: TestClient, token: string, id: string, ops: unknown[]) =>
    client.request<AppDetailDto>(`/api/apps/${id}/revisions/apply`, { body: { ops }, token });

  it('a Riff on its pre-Ori or interim default shows level bars everywhere; its stored icon is untouched; chosen icons stay', async () => {
    const client = await makeClient();
    const { token } = await client.signup();
    const id = await made(client, token, 'riff-practice');
    expect(bootForApp(id).icon).toEqual({ symbol: 'levels', color: 'ink' });

    for (const old of supersededIcons('riff')) {
      expect((await revise(client, token, id, [{ op: 'set_icon', icon: old }])).status).toBe(200);
      expect(bootForApp(id).icon, `${old.symbol}/${old.color}`).toEqual({ symbol: 'levels', color: 'ink' });
      const svg = await client.request(`/apps/${id}/icon.svg`);
      expect(svg.text).toContain(LEVEL_BARS);
      expect(svg.text).not.toContain(ICON_PATHS[old.symbol]);
      const stored = await client.request<AppDetailDto>(`/api/apps/${id}`, { token });
      expect(stored.json.app.icon).toEqual(old);
      expect(stored.json.spec.icon).toEqual(old);
    }

    // Icons the person chose are theirs, including a wave on another colour.
    for (const chosen of [{ symbol: 'guitar', color: 'plum' }, { symbol: 'waveform', color: 'plum' }] as const) {
      expect((await revise(client, token, id, [{ op: 'set_icon', icon: chosen }])).status).toBe(200);
      expect(bootForApp(id).icon).toEqual(chosen);
      expect((await client.request(`/apps/${id}/icon.svg`)).text).toContain(ICON_PATHS[chosen.symbol]);
    }

    // Renamed, the interim default is just a wave the app carries.
    expect((await revise(client, token, id, [{ op: 'rename_app', name: 'Jam' }, { op: 'set_icon', icon: { symbol: 'waveform', color: 'ink' } }])).status).toBe(200);
    expect(bootForApp(id).icon).toEqual({ symbol: 'waveform', color: 'ink' });
    expect((await client.request(`/apps/${id}/icon.svg`)).text).toContain(WAVE);
  });

  it("People's home-screen PNGs are white to the edge: no hairline for a platform mask to cut", async () => {
    const client = await makeClient();
    const { token } = await client.signup();
    const id = await made(client, token, 'people-queue');
    for (const file of ['icon-180.png', 'icon-192.png', 'icon-512-maskable.png']) {
      const img = await png(client, `/apps/${id}/${file}`);
      const n = img.width;
      for (let i = 0; i < n; i++) {
        for (const [x, y] of [[i, 0], [i, 1], [i, n - 1], [i, n - 2], [0, i], [1, i], [n - 1, i], [n - 2, i]] as const) {
          expectColor(img.at(x, y), '#FFFFFF', `${file} edge ${x},${y}`, 0);
        }
      }
      // The orange people glyph is drawn in the middle of the tile.
      let glyph = 0;
      for (let y = Math.floor(n * 0.3); y < n * 0.7; y++) {
        for (let x = Math.floor(n * 0.3); x < n * 0.7; x++) {
          const [r, g, b] = img.at(x, y);
          const [gr, gg, gb] = hexRgb(ICON_GLYPH.white);
          if (Math.abs(r - gr) + Math.abs(g - gg) + Math.abs(b - gb) <= 12) glyph += 1;
        }
      }
      expect(glyph, `${file}: orange glyph pixels`).toBeGreaterThan(n * 2);
    }
    // In the app, where the tile draws its own corners, the hairline keeps it visible on a white page.
    expect((await client.request(`/apps/${id}/icon.svg`)).text).toContain('#DCE0EC');
  });

  it("People's manifest and theme-color follow the look the app shows, and a look the person chose", async () => {
    const client = await makeClient();
    const { token } = await client.signup();
    const id = await madeLegacyPeople(client, token);
    const stored = await client.request<AppDetailDto>(`/api/apps/${id}`, { token });
    expect(designFor(stored.json.spec)).toMatchObject(LEGACY_PEOPLE_LOOK); // stored as made, shown as Ori People

    const manifest = async () => (await client.request(`/apps/${id}/manifest.webmanifest`)).json as Record<string, unknown>;
    expect(await manifest()).toMatchObject({ name: 'People', background_color: BRAND_COLORS.canvas, theme_color: '#FFFFFF' });
    expect(bootForApp(id).theme).toBe('bright');
    expect(renderIndex('<html><head><title>x</title></head></html>', bootForApp(id))).toContain('<meta name="theme-color" content="#FFFFFF">');

    // The person picks another accent: the app shows their mint look, and so does its install metadata.
    expect((await revise(client, token, id, [{ op: 'set_design', design: { accent: 'teal' } }])).status).toBe(200);
    expect(await manifest()).toMatchObject({ background_color: '#F3FBF7', theme_color: '#F3FBF7' });
    expect(bootForApp(id).theme).toBe('mint');

    // Another app on the same legacy look keeps it: the mapping is People's alone.
    const other = await madeLegacyPeople(client, token);
    expect((await revise(client, token, other, [{ op: 'rename_app', name: 'Follow-ups' }])).status).toBe(200);
    const renamed = await client.request(`/apps/${other}/manifest.webmanifest`);
    expect(renamed.json).toMatchObject({ name: 'Follow-ups', background_color: '#F3FBF7', theme_color: '#F3FBF7' });
  });

  it('a personal app keeps its own name, scope and look', () => {
    const m = appManifest('appRiff000001', 'Riff', referenceIcon('riff'), 'ink');
    expect(m).toMatchObject({ name: 'Riff', start_url: '/apps/appRiff000001/', scope: '/apps/appRiff000001/', theme_color: BRAND_COLORS.ink, description: 'Riff, your personal app from Ori' });
  });
});
