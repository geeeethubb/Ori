/**
 * The pitch deck route. /pitch/ is a standalone static page served from the built client
 * (client/public/pitch is copied to <CLIENT_DIST>/pitch), outside the SPA: /pitch redirects to /pitch/
 * (keeping the query), /pitch/ serves pitch/index.html uncached, assets cache briefly, a missing
 * /pitch/* file is a 404 rather than the app shell, and ordinary app routes still get the SPA.
 *
 * In-process (app.request, no port), against a temporary CLIENT_DIST that holds a minimal app
 * index.html, a pitch index and two pitch assets.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
