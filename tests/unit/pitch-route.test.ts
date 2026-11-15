/**
 * The pitch deck route. /pitch/ is a standalone static page served from the built client
 * (client/public/pitch is copied to <CLIENT_DIST>/pitch), outside the SPA: /pitch redirects to /pitch/
 * (keeping the query), /pitch/ serves pitch/index.html uncached, assets cache briefly, a missing
 * /pitch/* file is a 404 rather than the app shell, and ordinary app routes still get the SPA.
 *
 * In-process (app.request, no port), against a temporary CLIENT_DIST that holds a minimal app
 * index.html, a pitch index, pitch assets in nested folders and two stand-in recordings (video types,
 * byte ranges).
 *
 * The second block checks the real deck's data (client/public/pitch): the 15 presented scenes and their budgets,
 * the closing slide's exact content, a renderer for every layout, and every media file the deck names.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClient, type TestClient } from '../helpers/testServer.ts';

const APP_MARKER = 'APP-SHELL-ROOT';
const PITCH_MARKER = 'PITCH-DECK-INDEX';

let client: TestClient;
let dist = '';

beforeAll(async () => {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'ori-pitch-route-'));
  fs.mkdirSync(path.join(dist, 'pitch', 'assets', 'ori'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><html><head><title>Ori</title></head><body><div id="root">${APP_MARKER}</div></body></html>`);
  fs.writeFileSync(path.join(dist, 'pitch', 'index.html'), `<!doctype html><title>Ori pitch</title><main id="deck">${PITCH_MARKER}</main>`);
  fs.writeFileSync(path.join(dist, 'pitch', 'style.css'), 'body{color:#162039}');
  fs.writeFileSync(path.join(dist, 'pitch', 'config.js'), 'window.ORI_PITCH={};');
  fs.writeFileSync(path.join(dist, 'pitch', 'assets', 'ori', 'companion-idle.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>');
  // Stand-ins for the demo recordings (served as files; their bytes do not matter here).
  fs.mkdirSync(path.join(dist, 'pitch', 'media'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'pitch', 'media', 'clip.mp4'), Buffer.alloc(2048, 7));
  fs.writeFileSync(path.join(dist, 'pitch', 'media', 'clip.webm'), Buffer.alloc(1024, 9));
  // The 16-slide deck adds nested folders: slide renderers and real product screenshots.
  fs.mkdirSync(path.join(dist, 'pitch', 'slides'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'pitch', 'slides', 'g1-evidence.js'), 'window.ORI_SLIDES = window.ORI_SLIDES || {};');
  fs.mkdirSync(path.join(dist, 'pitch', 'media', 'stills'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'pitch', 'media', 'stills', 'shot.webp'), Buffer.alloc(512, 3));
  // server/config.ts reads CLIENT_DIST when the server is first imported (lazily, in makeClient).
  process.env.CLIENT_DIST = dist;
  client = await makeClient();
});

afterAll(() => {
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});

describe('/pitch', () => {
  it('redirects /pitch to /pitch/ permanently, keeping the query string', async () => {
    const plain = await client.request('/pitch');
    expect(plain.status).toBe(301);
    expect(plain.headers.get('location')).toBe('/pitch/');

    const withQuery = await client.request('/pitch?from=judges&v=2');
    expect(withQuery.status).toBe(301);
    expect(withQuery.headers.get('location')).toBe('/pitch/?from=judges&v=2');
  });

  it('serves the deck index at /pitch/ and /pitch/index.html, never cached', async () => {
    for (const url of ['/pitch/', '/pitch/?from=judges', '/pitch/index.html']) {
      const res = await client.request(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get('content-type'), url).toMatch(/text\/html/);
      expect(res.headers.get('cache-control'), url).toBe('no-store');
      expect(res.text, url).toContain(PITCH_MARKER);
      expect(res.text, url).not.toContain(APP_MARKER);
    }
  });

  it('serves deck assets with a short cache, and its config uncached', async () => {
    const css = await client.request('/pitch/style.css');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toMatch(/text\/css/);
    expect(css.headers.get('cache-control')).toBe('public, max-age=300');
    expect(css.text).toContain('#162039');

    const art = await client.request('/pitch/assets/ori/companion-idle.svg');
    expect(art.status).toBe(200);
    expect(art.headers.get('content-type')).toMatch(/image\/svg\+xml/);

    const config = await client.request('/pitch/config.js');
    expect(config.status).toBe(200);
    expect(config.headers.get('cache-control')).toBe('no-store');
  });

  it('serves the demo recordings with video types and byte ranges (Safari and iPhones request ranges)', async () => {
    const mp4 = await client.request('/pitch/media/clip.mp4');
    expect(mp4.status).toBe(200);
    expect(mp4.headers.get('content-type')).toBe('video/mp4');
    expect(mp4.headers.get('content-length')).toBe('2048');
    expect(mp4.headers.get('cache-control')).toBe('public, max-age=300');

    // Safari's first request for a video is a two-byte probe; a 206 with Content-Range lets it play and seek.
    const probe = await client.request('/pitch/media/clip.mp4', { headers: { Range: 'bytes=0-1' } });
    expect(probe.status).toBe(206);
    expect(probe.headers.get('accept-ranges')).toBe('bytes');
    expect(probe.headers.get('content-range')).toBe('bytes 0-1/2048');
    expect(probe.headers.get('content-length')).toBe('2');
    expect(probe.headers.get('cache-control')).toBe('public, max-age=300');

    const tail = await client.request('/pitch/media/clip.mp4', { headers: { Range: 'bytes=1024-' } });
    expect(tail.status).toBe(206);
    expect(tail.headers.get('content-range')).toBe('bytes 1024-2047/2048');

    const webm = await client.request('/pitch/media/clip.webm');
    expect(webm.status).toBe(200);
    expect(webm.headers.get('content-type')).toBe('video/webm');
  });

  it('serves files in nested deck folders (slide renderers, screenshots) with a short cache', async () => {
    const js = await client.request('/pitch/slides/g1-evidence.js?v=16.1');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(js.headers.get('cache-control')).toBe('public, max-age=300');

    const still = await client.request('/pitch/media/stills/shot.webp');
    expect(still.status).toBe(200);
    expect(still.headers.get('content-type')).toBe('image/webp');
    expect(still.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('answers a missing deck file with 404, never the app shell', async () => {
    // ..%2f survives URL parsing (unlike %2e%2e, which normalizes away before routing) and must not escape the deck.
    for (const url of ['/pitch/missing.js', '/pitch/assets/nope.png', '/pitch/media/01-create.webm', '/pitch/nested/deeper/', '/pitch/..%2findex.html', '/pitch/..%2f..%2fpackage.json']) {
      const res = await client.request(url);
      expect(res.status, url).toBe(404);
      expect(res.text, url).not.toContain(APP_MARKER);
      expect(res.text, url).not.toContain(PITCH_MARKER);
    }
  });

  it('leaves ordinary app routes to the SPA', async () => {
    for (const url of ['/', '/agent', '/playground', '/pitchfork']) {
      const res = await client.request(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get('content-type'), url).toMatch(/text\/html/);
      expect(res.text, url).toContain(APP_MARKER);
      expect(res.text, url).not.toContain(PITCH_MARKER);
    }
    const health = await client.request('/api/health');
    expect(health.status).toBe(200);
    expect(health.json?.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// The real deck's data (client/public/pitch), evaluated the way the browser loads it.
// ---------------------------------------------------------------------------------------------------

const PITCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'public', 'pitch');
const KIT_QR = path.resolve(PITCH_DIR, '..', '..', '..', 'docs', 'ori-pitch-kit', 'assets', 'qr-ori.png');

interface DeckScene {
  id: string;
  aliases?: string[];
  label: string;
  headline: string;
  seconds: number;
  theme?: string;
  companion: { expression: string; corner?: boolean } | null;
  layout: string;
  onScreen: Record<string, unknown>;
  spoken: string;
  cue: string;
  appendix?: string[];
}
interface DeckSlot {
  slide: number;
  sources: string[];
  poster: string;
  still: string;
  label: string;
  stillLabel: string;
  aspect: string;
  cues: number[];
}
interface DeckWindow {
  ORI_PITCH: { media: Record<string, DeckSlot> };
  ORI_SCENES: DeckScene[];
  ORI_SLIDES: Record<string, unknown>;
  ORI_APPENDIX_SECTIONS: Record<string, string>;
}

function loadDeck(): DeckWindow {
  const sandbox = { window: {} as Record<string, unknown> };
  vm.createContext(sandbox);
  const slideFiles = fs.readdirSync(path.join(PITCH_DIR, 'slides')).filter((f) => f.endsWith('.js')).sort().map((f) => `slides/${f}`);
  for (const file of ['config.js', 'scenes.js', ...slideFiles]) {
    vm.runInContext(fs.readFileSync(path.join(PITCH_DIR, file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window as unknown as DeckWindow;
}

describe('the pitch deck data (client/public/pitch)', () => {
  const deck = loadDeck();
  const scenes = deck.ORI_SCENES;
  const html = fs.readFileSync(path.join(PITCH_DIR, 'index.html'), 'utf8');

  it('presents the revision brief’s scenes without slide 2, in order, in 238 s (3:58)', () => {
    // docs/ori-pitch-kit/ORI_PITCH_REVISION_BRIEF.md, section 5, with two founder decisions: slide 2 (the research
    // evidence) moved to the appendix and its 12 s were not redistributed; slide 8 runs 25 s for his recording.
    expect(scenes.map((s) => s.seconds)).toEqual([7, 19, 17, 14, 26, 26, 25, 13, 16, 19, 12, 10, 15, 12, 7]);
    expect(scenes.reduce((sum, s) => sum + s.seconds, 0)).toBe(238);
    expect(scenes.map((s) => s.layout)).toEqual(['promise', 'discovery', 'journey', 'feeling', 'create', 'grow', 'features', 'zones', 'position', 'founder', 'growth', 'pricing', 'velocity', 'ask', 'signature']);
    const names = scenes.flatMap((s) => [s.id, ...(s.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain('evidence');
    // Nothing spoken still refers to the removed slide.
    for (const scene of scenes) expect(scene.spoken, scene.id).not.toMatch(/47\.6|Wanting needs a bridge|intended to exercise/i);
  });

  it('keeps the research evidence, complete, in the appendix', () => {
    const start = html.indexOf('id="appendix-research"');
    expect(start, 'the research panel').toBeGreaterThan(-1);
    expect(start, 'near the top of the sources section').toBeGreaterThan(html.indexOf('id="appendix-sources"'));
    expect(start).toBeLessThan(html.indexOf('id="appendix-r1"'));
    const panel = html.slice(start, html.indexOf('</ul>', start));
    for (const text of ['Wanting is only the beginning.', '47.6%', 'Intended to exercise. Didn’t follow through.', 'Feil et al., 2023', '≈½',
      'Behavior changed about half as much as intention.', 'Standardized effects: 0.36 vs. 0.66.', 'Webb &amp; Sheeran, 2006', 'Intention 0.66',
      'Behavior 0.36', 'Wanting needs a bridge to doing.', 'Physical activity only', 'Neither study measures Ori.', 'not a success rate']) {
      expect(panel, text).toContain(text);
    }
    expect(deck.ORI_APPENDIX_SECTIONS.research).toBe('Research behind this');
    expect(html).toContain('data-appendix-link="research"');
    expect(scenes.find((s) => s.id === 'discovery')?.appendix).toContain('research');
  });

  it('gives every scene its words, a renderer, a valid expression and real appendix links', () => {
    const builtIn = new Set(['promise', 'signature']);
    for (const scene of scenes) {
      expect(scene.label, scene.id).toBeTruthy();
      expect(scene.headline, scene.id).toBeTruthy();
      expect(scene.spoken, scene.id).toBeTruthy();
      expect(scene.cue, scene.id).toBeTruthy();
      expect(builtIn.has(scene.layout) || typeof deck.ORI_SLIDES[scene.layout] === 'function', `${scene.id}: renderer for "${scene.layout}"`).toBe(true);
      if (scene.layout === 'signature') expect(scene.companion, 'no companion on the close').toBeNull();
      else expect(['Listening', 'Thinking', 'Found something', 'Ready'], scene.id).toContain(scene.companion?.expression);
      for (const id of scene.appendix ?? []) {
        expect(deck.ORI_APPENDIX_SECTIONS[id], `${scene.id} → appendix ${id}`).toBeTruthy();
        expect(html, `appendix-${id} in index.html`).toContain(`id="appendix-${id}"`);
      }
    }
  });

  it('closes with only the signature line, the supplied QR code and the contact details', () => {
    const close = scenes[scenes.length - 1];
    if (!close) throw new Error('scenes.js has no scenes');
    const o = close.onScreen as { line: string; qr: { src: string; href: string }; contact: { name: string; email: string; phone: string; tel: string } };
    expect(close.layout).toBe('signature');
    expect(o.line).toBe('Ori. Your phone, your story.');
    expect(o.qr.href).toBe('https://ori-fjrx.onrender.com/');
    expect(Object.keys(o).sort()).toEqual(['contact', 'line', 'qr']);
    expect(o.contact).toEqual({ name: 'Zuyu Liu', email: 'zliu2017@illinois.edu', phone: '847-962-2868', tel: '+18479622868' });
    // The supplied image, byte for byte (it encodes https://ori-fjrx.onrender.com/).
    expect(fs.readFileSync(path.join(PITCH_DIR, o.qr.src)).equals(fs.readFileSync(KIT_QR))).toBe(true);
    // The account invitation is spoken, never shown.
    expect(close.spoken).toContain('Scan the code, create your own account, and try Ori.');
    expect(close.cue).toContain('Scan the code, create your own account, and try Ori.');
  });

  it('lists every media slot with files that exist, labelled honestly', () => {
    const media = deck.ORI_PITCH.media;
    // The playground slot may be retired: slide 8 (presented #7) uses one recording in the context slot.
    expect(Object.keys(media)).toEqual(expect.arrayContaining(['context', 'create', 'grow', 'return']));
    for (const [key, slot] of Object.entries(media)) {
      for (const file of [...slot.sources, slot.poster, slot.still].filter(Boolean)) {
        expect(fs.existsSync(path.join(PITCH_DIR, file)), `${key}: ${file}`).toBe(true);
      }
      expect(slot.still, `${key}: a real screenshot to fall back to`).toMatch(/^media\/stills\//);
      expect(slot.aspect, key).toMatch(/^\d+ \/ \d+$/);
      expect(Array.isArray(slot.cues), key).toBe(true);
      expect(slot.stillLabel, key).toMatch(/^Product screenshot/);
      if (slot.sources.length) {
        expect(slot.sources[0], `${key}: MP4 first`).toMatch(/\.mp4$/);
        // The founder's own context recording shows Ori's Live AI badge; the other recordings are Sample mode.
        if (key === 'context') expect(slot.label, `${key}: the founder's recording shows Live AI`).toBe('Recording · Live AI');
        else expect(slot.label, `${key}: the recordings are Sample mode`).toBe('Recorded product demo · Sample mode');
      }
    }
  });

  it('loads only files that exist', () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"#:]+?)(?:\?[^"]*)?"/g)].map((m) => m[1] ?? '').filter((ref) => ref && !ref.startsWith('/') && !ref.startsWith('#'));
    expect(refs.length).toBeGreaterThan(10);
    for (const ref of refs) expect(fs.existsSync(path.join(PITCH_DIR, ref)), ref).toBe(true);
  });
});
