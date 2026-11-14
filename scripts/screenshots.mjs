#!/usr/bin/env node
/**
 * Review screenshots of the redesigned product against a running server (Sample mode is fine).
 * Creates a throwaway account, example apps and one capture, then photographs the main screens at
 * phone and desktop widths into docs/screenshots/after/ (outside test-results, which Playwright wipes).
 *
 *   node scripts/screenshots.mjs --base http://localhost:8799 [--out docs/screenshots/after]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : [])).filter((x) => x.length));
const BASE = (args.base ?? 'http://localhost:8799').replace(/\/$/, '');
const OUT = path.resolve(args.out ?? 'docs/screenshots/after');
fs.mkdirSync(OUT, { recursive: true });

const email = `shots-${Date.now().toString(36)}@example.test`;
const password = 'walks-and-brick-walls';

async function api(request, method, url, data) {
  const res = await request.fetch(`${BASE}${url}`, { method, data, headers: { 'Content-Type': 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${text.slice(0, 200)}`);
  return json;
}

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '1440', width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch();
try {
  // Seed through the API in one context (cookies are per context, so sign in again per viewport).
  const seedCtx = await browser.newContext();
  await api(seedCtx.request, 'POST', '/api/auth/signup', { email, password, displayName: 'Zuyu' });
  const riff = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'riff-practice' });
  const light = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'light-gallery' });
  const people = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'people-queue' });
  const today = new Date();
  const iso = (d) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  for (const [d, minutes, focus, tempo, feel] of [[0, 15, 'The riff at half speed, then full', 72, 4], [-1, 10, 'Chord changes without looking', 66, 3], [-2, 25, 'Intro of the song, clean strumming', 80, 5]]) {
    await api(seedCtx.request, 'POST', `/api/apps/${riff.app.id}/records`, { values: { kind: 'session', date: iso(d), minutes, focus, tempo, feel } });
  }
  await api(seedCtx.request, 'POST', `/api/apps/${riff.app.id}/records`, { values: { kind: 'source', url: 'https://example.com/fingerpicked-riff', title: 'Fingerpicked riff (example)', source_note: 'That intro', source_kind: 'riff' } });
  const captions = ['Low sun on the brick wall by the station', 'Long shadows across the tram tracks', 'Backlit tree on the corner', 'Scaffolding stripes in the afternoon'];
  for (let i = 1; i <= 4; i++) {
    const bytes = fs.readFileSync(path.resolve('server/fixtures/media', `light-${i}.jpg`));
    const up = await seedCtx.request.fetch(`${BASE}/api/media`, { method: 'POST', multipart: { file: { name: `light-${i}.jpg`, mimeType: 'image/jpeg', buffer: bytes } } });
    const media = (await up.json()).media;
    await api(seedCtx.request, 'POST', `/api/apps/${light.app.id}/records`, { values: { date: iso(-i + 1), photo: media.id, caption: captions[i - 1], light: ['golden', 'harsh', 'overcast', 'golden'][i - 1], keeper: i === 1 } });
  }
  for (const [person, action, d, done, context, channel] of [
    ['Priya', 'Send the deck', -2, false, 'She asked about pricing for small teams.', 'email'],
    ['Marcus', 'Intro to a design partner', 0, false, 'Mentioned a studio looking for a prototype partner.', 'linkedin'],
    ['Lena', 'Share the photo walk route', 2, false, 'Loved the shadows series.', 'text'],
    ['Sam', 'Confirm the SAFE questions', -5, true, 'Answered by email.', 'email'],
  ]) {
    await api(seedCtx.request, 'POST', `/api/apps/${people.app.id}/records`, { values: { person, action, due: iso(d), done, context, channel } });
  }
  const cap = await api(seedCtx.request, 'POST', '/api/agent/captures', { text: 'I like this sound and have 15 minutes to practice. It is a fingerpicked acoustic riff I keep coming back to.', url: 'https://www.instagram.com/reel/example/' });
  const newApp = cap.reply?.proposals.find((p) => p.kind === 'new_app');
  await api(seedCtx.request, 'POST', '/api/context/sample', { profile: 'founder-photographer' }).catch(() => undefined);
  await api(seedCtx.request, 'POST', '/api/recommendations/generate', {}).catch(() => undefined);
  await seedCtx.close();

  const pages = [
    ['landing', '/', false],
    ['agent', '/agent', true],
    ['playground', '/playground', true],
    ['make', newApp ? `/make/${newApp.id}` : '/playground', true],
    ['apps', '/apps', true],
    ['riff', `/apps/${riff.app.id}/`, true],
    ['light', `/apps/${light.app.id}/`, true],
    ['people', `/apps/${people.app.id}/`, true],
    ['memory', '/settings/memory', true],
    ['settings', '/settings', true],
  ];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, deviceScaleFactor: 2, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.screenshot({ path: path.join(OUT, `landing-${vp.name}.png`), fullPage: true });
    await page.goto(`${BASE}/login`);
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(password);
    await page.getByTestId('auth-submit').click();
    await page.waitForURL(/\/playground|\/agent/, { timeout: 30_000 });
    for (const [name, url, needsAuth] of pages) {
      if (name === 'landing') continue;
      await page.goto(`${BASE}${url}`);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${name}-${vp.name}.png`), fullPage: true });
      if (name === 'make' && newApp) {
        const preview = page.getByTestId('make-preview');
        if (await preview.count() === 0) {
          const previewBtn = page.getByRole('button', { name: /^preview/i }).first();
          if (await previewBtn.count()) {
            await previewBtn.click();
            await preview.waitFor({ timeout: 90_000 }).catch(() => undefined);
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join(OUT, `make-preview-${vp.name}.png`), fullPage: true });
          }
        }
      }
      void needsAuth;
    }
    await ctx.close();
  }
  console.log(`Saved screenshots to ${OUT}`);
} finally {
  await browser.close();
}
