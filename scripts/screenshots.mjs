#!/usr/bin/env node
/**
 * Review screenshots of the product against a running server (Sample mode is fine; use a throwaway
 * database). Creates a throwaway account, the three reference apps with example entries and a few
 * shares, then photographs the main screens and the key flows (use the app you have, an honest
 * practice save, the data-safe undo plan) at 320, 390, 768 and 1440 px as JPEG.
 *
 *   node scripts/screenshots.mjs --base http://localhost:8799 [--out docs/screenshots/after] [--widths 320,390,768,1440]
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

const ALL_VIEWPORTS = {
  320: { name: '320', width: 320, height: 568, mobile: true },
  390: { name: '390', width: 390, height: 844, mobile: true },
  768: { name: '768', width: 768, height: 1024, mobile: true },
  1440: { name: '1440', width: 1440, height: 900, mobile: false },
};
const VIEWPORTS = (args.widths ?? '320,390,768,1440').split(',').map((w) => ALL_VIEWPORTS[w.trim()]).filter(Boolean);
const SCALE = Number(args.scale ?? 1.5);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), fullPage: true, type: 'jpeg', quality: 82 });

const browser = await chromium.launch();
try {
  // Seed through the API in one context (cookies are per context, so sign in again per viewport).
  const seedCtx = await browser.newContext();
  await api(seedCtx.request, 'POST', '/api/auth/signup', { email, password, displayName: 'Zuyu' });
  const riff = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'riff-practice' });
  const light = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'light-gallery' });
  const people = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'people-queue' });
  const undoDemo = await api(seedCtx.request, 'POST', '/api/apps/from-fixture', { fixture: 'riff-practice', name: 'Riff (undo example)' });
  const today = new Date();
  const iso = (d) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  // The third session was typed in by hand: no plan and an explicitly empty timed value, so it reads "typed in".
  for (const [d, minutes, focus, tempo, feel, planned, timed] of [[0, 9, 'The riff at half speed, then full', 72, 4, 15, 552], [-1, 10, 'Chord changes without looking', 66, 3, 10, 600], [-2, 25, 'Intro of the song, clean strumming', 80, 5, null, null]]) {
    await api(seedCtx.request, 'POST', `/api/apps/${riff.app.id}/records`, { values: { kind: 'session', date: iso(d), minutes, focus, tempo, feel, target_minutes: planned, timed_seconds: timed } });
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
  // Shares, oldest first (the thread shows the newest on top): a sync ask, a follow-up, the guitar note.
  await api(seedCtx.request, 'POST', '/api/agent/captures', { text: 'Auto-sync my Spotify and Instagram into Riff' });
  const followUp = await api(seedCtx.request, 'POST', '/api/agent/captures', { text: 'Follow up with Maya Thursday about the proposal' });
  const guitar = await api(seedCtx.request, 'POST', '/api/agent/captures', { text: 'I like this sound and have 15 minutes to practice. It is a fingerpicked acoustic riff I keep coming back to.', url: 'https://www.instagram.com/reel/example/' });
  const useRiff = guitar.reply?.proposals.find((p) => p.kind === 'use_app');
  const useMaya = followUp.reply?.proposals.find((p) => p.kind === 'use_app');
  await api(seedCtx.request, 'POST', '/api/context/sample', { profile: 'founder-photographer' }).catch(() => undefined);
  await api(seedCtx.request, 'POST', '/api/recommendations/generate', {}).catch(() => undefined);
  const recs = await api(seedCtx.request, 'GET', '/api/recommendations').catch(() => ({ recommendations: [] }));
  const newApp = recs.recommendations.find((r) => r.kind === 'new_app' && r.status === 'fresh');
  // The undo example: a field added, an entry that uses it, so undo has something to keep.
  await api(seedCtx.request, 'POST', `/api/apps/${undoDemo.app.id}/revisions/apply`, { ops: [{ op: 'add_field', field: { id: 'song', label: 'Which song', type: 'text' } }], summary: 'Add a field for the song' });
  await api(seedCtx.request, 'POST', `/api/apps/${undoDemo.app.id}/records`, { values: { kind: 'session', date: iso(0), minutes: 6, song: 'Blackbird', target_minutes: 15, timed_seconds: 371 } });
  await seedCtx.close();

  const pages = [
    ['agent', '/agent'],
    ['playground', '/playground'],
    ['make', newApp ? `/make/${newApp.id}` : '/playground'],
    ['make-use', useRiff ? `/make/${useRiff.id}` : '/agent'],
    ['apps', '/apps'],
    ['riff', `/apps/${riff.app.id}/`],
    ['light', `/apps/${light.app.id}/`],
    ['people', `/apps/${people.app.id}/`],
    ['memory', '/settings/memory'],
    ['settings', '/settings'],
  ];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, deviceScaleFactor: SCALE, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    page.on('dialog', (d) => void d.accept());
    await page.goto(`${BASE}/`);
    await shot(page, `landing-${vp.name}`);
    await page.goto(`${BASE}/login`);
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(password);
    await page.getByTestId('auth-submit').click();
    await page.waitForURL(/\/playground|\/agent/, { timeout: 30_000 });
    for (const [name, url] of pages) {
      await page.goto(`${BASE}${url}`);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(400);
      await shot(page, `${name}-${vp.name}`);
      if (name === 'make' && newApp) {
        const previewBtn = page.getByTestId('make-preview-button');
        if (await previewBtn.count()) {
          await previewBtn.click();
          await page.getByTestId('make-preview').waitFor({ timeout: 90_000 }).catch(() => undefined);
          await page.waitForTimeout(500);
          await shot(page, `make-preview-${vp.name}`);
        }
      }
    }

    // Flow: "use the app you have" from the Agent (Riff with the link to save; People with Maya drafted).
    if (useRiff) {
      await page.goto(`${BASE}/apps/${riff.app.id}/?from=${useRiff.id}`);
      await page.getByTestId('rt-suggestion').waitFor({ timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      await shot(page, `flow-use-riff-${vp.name}`);
    }
    if (useMaya) {
      await page.goto(`${BASE}/apps/${people.app.id}/?from=${useMaya.id}`);
      await page.getByTestId('rt-record-form').waitFor({ timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      await shot(page, `flow-use-people-${vp.name}`);
    }
    // Flow: an honest practice save (measured time, never the plan).
    await page.goto(`${BASE}/apps/${riff.app.id}/`);
    await page.getByTestId('rt-practice-start').click().catch(() => undefined);
    await page.waitForTimeout(1600);
    await page.getByTestId('rt-practice-pause').click().catch(() => undefined);
    await page.getByTestId('rt-practice-save').click().catch(() => undefined);
    await page.getByTestId('rt-form-note').waitFor({ timeout: 10_000 }).catch(() => undefined);
    await shot(page, `flow-practice-save-${vp.name}`);
    await page.getByTestId('rt-cancel-record').click().catch(() => undefined);
    await page.getByTestId('rt-practice-reset').click().catch(() => undefined);
    // Flow: the data-safe undo plan.
    await page.goto(`${BASE}/apps/${undoDemo.app.id}/settings`);
    await page.getByTestId('rt-undo').click().catch(() => undefined);
    await page.getByTestId('rt-undo-plan').waitFor({ timeout: 10_000 }).catch(() => undefined);
    await page.getByTestId('rt-undo-plan').scrollIntoViewIfNeeded().catch(() => undefined);
    await shot(page, `flow-undo-plan-${vp.name}`);
    await ctx.close();
  }
  console.log(`Saved screenshots to ${OUT}`);
} finally {
  await browser.close();
}
