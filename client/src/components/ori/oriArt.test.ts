/**
 * The Ori artwork contract (shared/oriArt.ts): one body for every mood, a true single-colour variant,
 * a small drawing without accents, safe icon padding, and SVG that a real renderer rasterizes the way
 * the identity board draws it (white eyes and a lime cheek on a cobalt body). Then the inline React
 * components' contract: mood hooks for tests and CSS, one accessible name, unique mask ids.
 */
import { describe, expect, it } from 'vitest';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Resvg } from '@resvg/resvg-js';
import { ORI_BODY_PATH, ORI_COLORS, ORI_MOODS, oriAppIconSvg, oriCompanionSvg, oriWordmarkSvg, type OriMood } from '@shared/oriArt.ts';
import { OriCompanion } from './OriCompanion.tsx';
import { OriLockup, OriWordmark } from './OriWordmark.tsx';

type RGBA = [number, number, number, number];

function raster(svg: string) {
  const img = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  const px = img.pixels; // a getter that copies the buffer: read it once
  const at = (x: number, y: number): RGBA => {
    const i = (Math.round(y) * img.width + Math.round(x)) * 4;
    return [px[i]!, px[i + 1]!, px[i + 2]!, px[i + 3]!];
  };
  return { width: img.width, height: img.height, at };
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function expectColor(px: RGBA, hex: string) {
  const [r, g, b] = rgb(hex);
  expect(px[3]).toBe(255);
  for (const [got, want] of [[px[0], r], [px[1], g], [px[2], b]] as const) expect(Math.abs(got - want)).toBeLessThanOrEqual(6);
}

const bodies = (svg: string) => [...svg.matchAll(/<path class="ori-body" d="([^"]+)"/g)].map((m) => m[1]);
const ACCENTED: OriMood[] = ['attentive', 'thinking', 'discovery', 'building'];

describe('Ori companion art', () => {
  it('draws every mood, size and colour variant with the same single body path', () => {
    for (const mood of ORI_MOODS) {
      for (const opts of [{ size: 80 }, { size: 20 }, { size: 80, mono: ORI_COLORS.ink }]) {
        expect(bodies(oriCompanionSvg({ mood, ...opts }))).toEqual([ORI_BODY_PATH]);
      }
    }
  });

  it('paints the single-colour variant in that colour only, with the eyes cut out', () => {
    for (const mood of ORI_MOODS) {
      const svg = oriCompanionSvg({ mood, size: 160, mono: ORI_COLORS.white });
      const visible = svg.replace(/<mask[\s\S]*?<\/mask>/g, ''); // mask luminance is not paint
      const paints = new Set([...visible.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]));
      expect([...paints].filter((p) => p !== ORI_COLORS.white && p !== 'none'), mood).toEqual([]);
      expect(visible).not.toContain('ori-cheek');
    }
    // Rasterized: the body is white and opaque, the idle eye is a transparent hole.
    const idle = raster(oriCompanionSvg({ mood: 'idle', size: 160, mono: ORI_COLORS.white }));
    expectColor(idle.at(56, 125), ORI_COLORS.white);
    expect(idle.at(66.2, 95.2)[3]).toBe(0);
  });

  it('drops accents in the small drawing (automatic below 28px) but keeps eyes and cheek', () => {
    for (const mood of ACCENTED) {
      const full = oriCompanionSvg({ mood, size: 80 });
      expect(full, mood).toMatch(/ori-accents|ori-orbit/);
      for (const small of [oriCompanionSvg({ mood, size: 80, simplified: true }), oriCompanionSvg({ mood, size: 24 })]) {
        expect(small, mood).not.toMatch(/ori-accents|ori-orbit|ori-rays|ori-spark|ori-dots/);
        expect(small).toContain('ori-eyes');
        expect(small).toContain('ori-cheek');
      }
    }
    expect(oriCompanionSvg({ mood: 'discovery', size: 28 })).toContain('ori-spark');
  });

  it('rasterizes every mood as the board draws it: cobalt body, white eyes, lime cheek', () => {
    for (const mood of ORI_MOODS) {
      for (const size of [24, 40, 80, 160]) {
        const img = raster(oriCompanionSvg({ mood, size, background: ORI_COLORS.canvas }));
        expect([img.width, img.height]).toEqual([size, size]);
        expectColor(img.at(0, 0), ORI_COLORS.canvas);
        if (size >= 40) expectColor(img.at(size * 0.35, size * 0.79), ORI_COLORS.cobalt); // lower-left of the body
      }
    }
    const idle = raster(oriCompanionSvg({ mood: 'idle', size: 160 }));
    expectColor(idle.at(66.2, 95.2), ORI_COLORS.white); // left eye
    expectColor(idle.at(109, 114.4), ORI_COLORS.lime); // cheek, viewer's right
  });

  it('falls back to idle for unknown moods and escapes attribute values', () => {
    const idle = oriCompanionSvg({ mood: 'idle', size: 64 });
    expect(oriCompanionSvg({ mood: 'gleeful' as OriMood, size: 64 })).toBe(idle);
    const hostile = oriCompanionSvg({ mood: 'idle', size: 64, mono: '"/><script>alert(1)</script>' });
    expect(hostile).not.toContain('<script');
    expect(() => raster(hostile)).not.toThrow();
  });
});

describe('Ori app icon and wordmark', () => {
  it('keeps the maskable icon full-bleed with the companion inside the 80% safe circle', () => {
    const size = 192;
    const icon = raster(oriAppIconSvg(size, { maskable: true }));
    expectColor(icon.at(0, 0), ORI_COLORS.lilac);
    const [lr, lg, lb] = rgb(ORI_COLORS.lilac);
    let outside = 0;
    let marks = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r, g, b] = icon.at(x, y);
        if (Math.abs(r - lr) + Math.abs(g - lg) + Math.abs(b - lb) < 30) continue;
        marks++;
        if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) outside++;
      }
    }
    expect(marks).toBeGreaterThan(size * size * 0.1);
    expect(outside).toBe(0);
    // The plain icon is a rounded square: transparent corners, lilac edge midpoints.
    const plain = raster(oriAppIconSvg(size));
    expect(plain.at(1, 1)[3]).toBe(0);
    expectColor(plain.at(size / 2, 2), ORI_COLORS.lilac);
  });

  it('draws each wordmark variant in its colours with a lime i-dot', () => {
    const k = 64 / 321; // wordmark units → px at height 64
    const cases = [
      ['ink', ORI_COLORS.ink, ORI_COLORS.cobalt],
      ['cobalt', ORI_COLORS.cobalt, ORI_COLORS.cobalt],
      ['light', ORI_COLORS.white, ORI_COLORS.white],
    ] as const;
    for (const [variant, letters, ring] of cases) {
      const img = raster(oriWordmarkSvg({ variant, height: 64 }));
      expect(img.height).toBe(64);
      expect(img.width).toBeGreaterThan(img.height);
      expectColor(img.at(439 * k, 220 * k), letters); // the i's stem
      expectColor(img.at(439 * k, 57.5 * k), ORI_COLORS.lime); // the dot
      expectColor(img.at((439 + 45.5) * k, 57.5 * k), ring); // its ring
      expect(img.at(110 * k, 200 * k)[3], `${variant}: the o has an open counter`).toBe(0);
    }
  });
});

describe('Ori components', () => {
  it('renders the companion inline, decorative by default, with its mood and motion on the root', () => {
    const html = renderToStaticMarkup(createElement(OriCompanion, { mood: 'building', size: 96 }));
    expect(html.startsWith('<svg')).toBe(true);
    expect(html).toMatch(/^<svg[^>]*class="ori-companion"[^>]*data-mood="building"[^>]*data-motion="auto"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role="img"');
    expect(html).toContain('ori-orbit-spin'); // the orbit CSS animates while building
    expect(bodies(html)).toEqual([ORI_BODY_PATH]);
  });

  it('names a non-decorative companion once and switches to the small drawing below 28px', () => {
    const html = renderToStaticMarkup(
      createElement(OriCompanion, { mood: 'discovery', size: 24, motion: 'none', decorative: false, label: 'Ori found something' }),
    );
    expect(html).toMatch(/^<svg[^>]*role="img"[^>]*aria-label="Ori found something"/);
    expect(html).not.toContain('aria-hidden');
    expect(html).toContain('data-motion="none"');
    expect(html).not.toContain('ori-spark');
    expect(renderToStaticMarkup(createElement(OriCompanion, { mood: 'discovery', size: 28 }))).toContain('ori-spark');
  });

  it('gives every single-colour companion on a page its own eye mask', () => {
    const mono = () => createElement(OriCompanion, { mono: ORI_COLORS.ink, size: 40 });
    const html = renderToStaticMarkup(createElement(Fragment, null, mono(), mono()));
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    const refs = [...html.matchAll(/mask="url\(#([^)]+)\)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(refs).toEqual(ids);
  });

  it('labels the wordmark and lockup "Ori" unless an enclosing control names them', () => {
    const mark = renderToStaticMarkup(createElement(OriWordmark, { variant: 'ink', height: 34 }));
    expect(mark).toMatch(/^<svg[^>]*role="img"[^>]*aria-label="Ori"/);
    expect(mark).toContain('height="34"');
    expect(renderToStaticMarkup(createElement(OriWordmark, { title: '' }))).toContain('aria-hidden="true"');
    const lockup = renderToStaticMarkup(createElement(OriLockup, { size: 44, variant: 'cobalt' }));
    expect(lockup).toMatch(/^<svg[^>]*role="img"[^>]*aria-label="Ori"/);
    expect(bodies(lockup)).toEqual([ORI_BODY_PATH]);
    expect(lockup).toContain('ori-dot');
  });
});
