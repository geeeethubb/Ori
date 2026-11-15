#!/usr/bin/env node
/**
 * Review screenshots of every Ori screen against a running server (Sample mode is fine; use a throwaway
 * database, never data/app.db). Seeds a throwaway account with the three reference apps, example entries
 * dated in local time, shares (one with a photo) and Playground ideas, then photographs, per width:
 *
 * - signed out: the landing, sign up, sign in, pricing and the companion gallery (/ori);
 * - the Light journey on a fresh account: the Agent's first use, the conversation after sharing a photo
 *   thought with a photo (the Light card), the Make page (on phones the compact strip, then the whole
 *   preview), Ready after Make mine, and Light holding the shared photo;
 * - the seeded account: Agent, Playground, My apps (on arrival, then with another tile selected), the
 *   Make page and its "use the app you have" variant, Riff, Light, People, an app's settings, What
 *   you've shared, Settings and Bring context;
 * - flows: Edit with Ori asking, then with "Add camera settings to my photo notes" previewed; the
 *   install sheet (Safari on phones and tablets, and Chrome on Android at 390); use the app you have
 *   (Riff, People); an honest practice save; the data-safe undo plan.
 *
 * Every shot waits for the network, web fonts and running animations to settle. A state that does not
 * appear is reported (and the script exits with code 1) instead of being photographed silently.
 * Full-page shots start at the top of the page; the conversation, My apps with a tile selected and the
 * undo plan are also photographed as seen, at the scroll position the product chose (<name>-view-<width>).
 *
 *   node scripts/screenshots.mjs --base http://localhost:8799 [--out docs/screenshots/after] [--widths 390,1440,320,768] [--scale 1.5]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : [])).filter((x) => x.length));
const BASE = (args.base ?? 'http://localhost:8799').replace(/\/$/, '');
const OUT = path.resolve(args.out ?? 'docs/screenshots/after');
fs.mkdirSync(OUT, { recursive: true });

const stamp = Date.now().toString(36);
const email = `shots-${stamp}@example.test`;
const password = 'walks-and-brick-walls';
const MEDIA = path.resolve('server/fixtures/media');
const LIGHT_THOUGHT = 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.';
/** The browser runs in this machine's time zone, so "today" on screen is the same day as the seeded entries. */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function api(request, method, url, data) {
  const res = await request.fetch(`${BASE}${url}`, { method, data, headers: { 'Content-Type': 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()} ${text.slice(0, 200)}`);
  return json;
}

async function uploadPhoto(request, file) {
  const res = await request.fetch(`${BASE}/api/media`, { method: 'POST', multipart: { file: { name: path.basename(file), mimeType: 'image/jpeg', buffer: fs.readFileSync(file) } } });
  if (!res.ok()) throw new Error(`POST /api/media → ${res.status()} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).media;
}

/** A local calendar date `days` from today (toISOString is UTC and would label tonight's session 'Tomorrow'). */
function iso(days) {
  const x = new Date();
  x.setDate(x.getDate() + days);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Phone and tablet widths browse as Safari on that device, so platform-specific screens (the install steps) show what an iPhone or iPad person sees. */
const ALL_VIEWPORTS = {
  320: { name: '320', width: 320, height: 568, mobile: true, userAgent: devices['iPhone SE'].userAgent },
  390: { name: '390', width: 390, height: 844, mobile: true, userAgent: devices['iPhone 13'].userAgent },
  768: { name: '768', width: 768, height: 1024, mobile: true, userAgent: devices['iPad Mini'].userAgent },
  1440: { name: '1440', width: 1440, height: 900, mobile: false },
};
/** 390 and 1440 first (the reference sizes), then 320 and 768. */
const VIEWPORTS = (args.widths ?? '390,1440,320,768').split(',').map((w) => ALL_VIEWPORTS[w.trim()]).filter(Boolean);
const SCALE = Number(args.scale ?? 1.5);
/** Below this width the Make page leads with a compact strip and opens the whole preview in place. */
const MAKE_WIDE_MIN = 1000;

let taken = 0;
const missing = [];

/** Wait until the screen is still: network quiet, web fonts loaded, running finite animations and transitions done. */
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .evaluate(async () => {
      await document.fonts?.ready;
      const finite = document.getAnimations().filter((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity));
      await Promise.race([Promise.all(finite.map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 4000))]);
      // Images that are on the page have decoded (the person's photos come through the session).
      await Promise.all(Array.from(document.images).filter((img) => !img.complete).map((img) => new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); setTimeout(r, 4000); })));
      // A smooth scroll (not a Web Animation) has come to rest.
      let last = -1;
      for (let i = 0; i < 30 && window.scrollY !== last; i++) {
        last = window.scrollY;
        await new Promise((r) => setTimeout(r, 100));
      }
    })
    .catch(() => undefined);
  await page.waitForTimeout(150);
}

/**
 * The whole page, from the top (a full-page capture draws fixed and sticky bars where the window was
 * scrolled to, so the page is put back at its top first). With `view`, first the screen exactly as the
 * person sees it, at the scroll position the product chose (the newest exchange, say), as <name>-view.
 */
async function shot(page, name, { view = false } = {}) {
  // Animations still running (the companion's idle loop) are held still for the picture; finished ones stay finished.
  const opts = { type: 'jpeg', quality: 82, animations: 'disabled', caret: 'hide' };
  const [base, width] = [name.slice(0, name.lastIndexOf('-')), name.slice(name.lastIndexOf('-') + 1)];
  if (view) {
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `${base}-view-${width}.jpg`), ...opts });
    taken++;
    console.log(`  ${base}-view-${width}`);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })).catch(() => undefined);
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), fullPage: true, ...opts });
  taken++;
  console.log(`  ${name}`);
}

/** Wait for a test id; a state that never appears is recorded (the run then fails) rather than photographed silently. */
async function waitFor(page, testId, { timeout = 30_000, enabled = false } = {}) {
  const el = page.getByTestId(testId).first();
  try {
    await el.waitFor({ state: 'visible', timeout });
    if (enabled) {
      const until = Date.now() + timeout;
      while (!(await el.isEnabled())) {
        if (Date.now() > until) throw new Error('still disabled');
        await page.waitForTimeout(200);
      }
    }
    return true;
  } catch {
    missing.push(`${testId} on ${page.url()}`);
    console.warn(`  (not shown: ${testId} on ${page.url()})`);
    return false;
  }
}

const browser = await chromium.launch();
try {
  // ---------- the review account, seeded through the API ----------
  const seedCtx = await browser.newContext();
  const rq = seedCtx.request;
  await api(rq, 'POST', '/api/auth/signup', { email, password, displayName: 'Zuyu' });
  const riff = await api(rq, 'POST', '/api/apps/from-fixture', { fixture: 'riff-practice' });
  const light = await api(rq, 'POST', '/api/apps/from-fixture', { fixture: 'light-gallery' });
  const people = await api(rq, 'POST', '/api/apps/from-fixture', { fixture: 'people-queue' });
  const undoDemo = await api(rq, 'POST', '/api/apps/from-fixture', { fixture: 'riff-practice', name: 'Riff (undo example)' });
  // The third session was typed in by hand: no plan and an explicitly empty timed value, so it reads "typed in".
  for (const [d, minutes, focus, tempo, feel, planned, timed] of [[0, 9, 'The riff at half speed, then full', 72, 4, 15, 552], [-1, 10, 'Chord changes without looking', 66, 3, 10, 600], [-2, 25, 'Intro of the song, clean strumming', 80, 5, null, null]]) {
    await api(rq, 'POST', `/api/apps/${riff.app.id}/records`, { values: { kind: 'session', date: iso(d), minutes, focus, tempo, feel, target_minutes: planned, timed_seconds: timed } });
  }
  await api(rq, 'POST', `/api/apps/${riff.app.id}/records`, { values: { kind: 'source', url: 'https://example.com/fingerpicked-riff', title: 'Fingerpicked riff (example)', source_note: 'That intro', source_kind: 'riff' } });
  const captions = ['Low sun on the brick wall by the station', 'Long shadows across the tram tracks', 'Backlit tree on the corner', 'Scaffolding stripes in the afternoon'];
  for (let i = 1; i <= 4; i++) {
    const media = await uploadPhoto(rq, path.join(MEDIA, `light-${i}.jpg`));
    await api(rq, 'POST', `/api/apps/${light.app.id}/records`, { values: { date: iso(-i + 1), photo: media.id, caption: captions[i - 1], light: ['golden', 'harsh', 'overcast', 'golden'][i - 1], keeper: i === 1 } });
  }
  for (const [person, action, d, done, context, channel] of [
    ['Priya', 'Send the deck', -2, false, 'She asked about pricing for small teams.', 'email'],
    ['Marcus', 'Intro to a design partner', 0, false, 'Mentioned a studio looking for a prototype partner.', 'linkedin'],
    ['Lena', 'Share the photo walk route', 2, false, 'Loved the shadows series.', 'text'],
    ['Sam', 'Confirm the SAFE questions', -5, true, 'Answered by email.', 'email'],
  ]) {
    await api(rq, 'POST', `/api/apps/${people.app.id}/records`, { values: { person, action, due: iso(d), done, context, channel } });
  }
  // Shares in the order they were made (the conversation reads oldest first, newest by the composer):
  // a sync ask, a follow-up, the guitar note with a link, then a photo with a note.
  await api(rq, 'POST', '/api/agent/captures', { text: 'Auto-sync my Spotify and Instagram into Riff' });
  const followUp = await api(rq, 'POST', '/api/agent/captures', { text: 'Follow up with Maya Thursday about the proposal' });
  const guitar = await api(rq, 'POST', '/api/agent/captures', { text: 'I like this sound and have 15 minutes to practice. It is a fingerpicked acoustic riff I keep coming back to.', url: 'https://www.instagram.com/reel/example/' });
  const shadows = await uploadPhoto(rq, path.join(MEDIA, 'light-3.jpg'));
  await api(rq, 'POST', '/api/agent/captures', { text: 'Hard shadows on the brick wall at 3 pm. I want to shoot more harsh midday light.', mediaId: shadows.id });
  const useRiff = guitar.reply?.proposals.find((p) => p.kind === 'use_app');
  const useMaya = followUp.reply?.proposals.find((p) => p.kind === 'use_app');
  await api(rq, 'POST', '/api/context/sample', { profile: 'founder-photographer' }).catch((e) => console.warn(`(example profile: ${e.message})`));
  await api(rq, 'POST', '/api/recommendations/generate', {}).catch((e) => console.warn(`(Playground ideas: ${e.message})`));
  const recs = await api(rq, 'GET', '/api/recommendations').catch(() => ({ recommendations: [] }));
  const newApp = recs.recommendations.find((r) => r.kind === 'new_app' && r.status === 'fresh');
  if (!newApp) missing.push('a new-app idea on the Playground');
  if (!useRiff) missing.push('the guitar note pointing to Riff');
  if (!useMaya) missing.push('the follow-up pointing to People');
  // The undo example: a field added, an entry that uses it, so undo has something to keep.
  await api(rq, 'POST', `/api/apps/${undoDemo.app.id}/revisions/apply`, { ops: [{ op: 'add_field', field: { id: 'song', label: 'Which song', type: 'text' } }], summary: 'Add a field for the song' });
  await api(rq, 'POST', `/api/apps/${undoDemo.app.id}/records`, { values: { kind: 'session', date: iso(0), minutes: 6, song: 'Blackbird', target_minutes: 15, timed_seconds: 371 } });
  await seedCtx.close();

  for (const vp of VIEWPORTS) {
    console.log(`${vp.name}px`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, deviceScaleFactor: SCALE, hasTouch: vp.mobile, timezoneId: TIME_ZONE, ...(vp.userAgent ? { userAgent: vp.userAgent } : {}) });
    const page = await ctx.newPage();
    page.on('dialog', (d) => void d.accept());
    const go = async (url, ready, opts) => {
      await page.goto(`${BASE}${url}`);
      return ready ? waitFor(page, ready, opts) : true;
    };
    const wide = vp.width >= MAKE_WIDE_MIN;

    // ---------- signed out ----------
    if (await go('/', 'landing-scene')) await shot(page, `landing-${vp.name}`);
    if (await go('/signup', 'auth-submit')) await shot(page, `signup-${vp.name}`);
    if (await go('/login', 'auth-submit')) await shot(page, `login-${vp.name}`);
    if (await go('/pricing', 'pricing-allowance')) await shot(page, `pricing-${vp.name}`);
    if (await go('/ori', 'ori-gallery')) await shot(page, `ori-gallery-${vp.name}`);

    // ---------- the Light journey, on a fresh account ----------
    await api(ctx.request, 'POST', '/api/auth/signup', { email: `shots-${stamp}-light-${vp.name}@example.test`, password, displayName: 'Zuyu' });
    if (await go('/agent', 'agent-starter-try')) await shot(page, `agent-first-${vp.name}`);
    await page.getByTestId('agent-file-input').setInputFiles(path.join(MEDIA, 'light-1.jpg'));
    await page.getByTestId('agent-text').fill(LIGHT_THOUGHT);
    if (await waitFor(page, 'agent-file')) await shot(page, `agent-compose-photo-${vp.name}`);
    await page.getByTestId('agent-send').click();
    if (await waitFor(page, 'agent-reply', { timeout: 60_000 })) {
      await shot(page, `agent-photo-${vp.name}`, { view: true });
      const previewLight = page.locator('[data-testid="proposal-card"][data-kind="new_app"] [data-testid="proposal-action"]').first();
      if (await previewLight.count()) {
        await previewLight.click();
        if (await waitFor(page, 'make-mine', { timeout: 90_000, enabled: true })) {
          await shot(page, `make-light-${vp.name}`);
          if (!wide) {
            await page.getByTestId('make-preview-more').click();
            if (await waitFor(page, 'make-preview')) await shot(page, `make-light-preview-${vp.name}`);
          }
          await page.getByTestId('make-mine').click();
          if (await waitFor(page, 'make-ready', { timeout: 60_000 })) {
            await shot(page, `make-ready-${vp.name}`);
            await page.getByTestId('make-ready-open').click();
            if (await waitFor(page, 'rt-gallery-tile')) await shot(page, `light-first-photo-${vp.name}`);
          }
        }
      } else {
        missing.push(`a Light card after the photo share (${vp.name}px)`);
      }
    }
    await api(ctx.request, 'POST', '/api/auth/logout');

    // ---------- the review account, signed in through the form ----------
    await go('/login', 'auth-email');
    await page.getByTestId('auth-email').fill(email);
    await page.getByTestId('auth-password').fill(password);
    await page.getByTestId('auth-submit').click();
    await page.waitForURL(/\/playground|\/agent/, { timeout: 30_000 });

    const pages = [
      ['agent', '/agent', 'agent-reply'],
      ['playground', '/playground', 'pg-card'],
      ['apps', '/apps', 'app-actions'],
      ['make-use', useRiff ? `/make/${useRiff.id}` : null, 'make-use-open'],
      ['riff', `/apps/${riff.app.id}/`, 'rt-practice'],
      ['light', `/apps/${light.app.id}/`, 'rt-gallery-tile'],
      ['people', `/apps/${people.app.id}/`, 'rt-queue-item'],
      ['riff-settings', `/apps/${riff.app.id}/settings`, 'rt-settings'],
      ['memory', '/settings/memory', 'memory-count'],
      ['settings', '/settings', 'settings-import'],
      ['import', '/settings/import', 'store-sample-founder'],
    ];
    for (const [name, url, ready] of pages) {
      if (!url) continue;
      // The conversation opens at its newest exchange (the photo share): also photographed as seen.
      if (await go(url, ready)) await shot(page, `${name}-${vp.name}`, { view: name === 'agent' });
    }

    // The Make page: the preview designs itself; on phones the whole preview opens in place.
    if (newApp && (await go(`/make/${newApp.id}`, 'make-mine', { timeout: 90_000, enabled: true }))) {
      await shot(page, `make-${vp.name}`);
      if (!wide) {
        await page.getByTestId('make-preview-more').click();
        if (await waitFor(page, 'make-preview')) await shot(page, `make-preview-${vp.name}`);
      }
    }

    // My apps, the launcher: another tile selected (one tap), its actions ready.
    if (await go('/apps', 'app-actions')) {
      await page.locator(`[data-testid="app-tile"][data-app-id="${light.app.id}"]`).click();
      await page.locator(`[data-testid="app-actions"][data-app-id="${light.app.id}"]`).waitFor({ timeout: 10_000 }).catch(() => missing.push(`Light selected in My apps (${vp.name}px)`));
      await shot(page, `apps-selected-${vp.name}`, { view: true });
    }

    // Edit with Ori, in Light: the request, then the camera-settings change previewed (kept, not applied).
    if (await go(`/apps/${light.app.id}/`, 'rt-edit-with-ori')) {
      await page.getByTestId('rt-edit-with-ori').click();
      if (await waitFor(page, 'rt-edit-sheet')) {
        await shot(page, `flow-edit-ask-${vp.name}`);
        await page.getByTestId('rt-revise-input').fill('Add camera settings to my photo notes');
        await page.getByTestId('rt-revise-preview').click();
        if (await waitFor(page, 'rt-revise-card', { timeout: 60_000 })) await shot(page, `flow-edit-review-${vp.name}`);
        await page.getByTestId('rt-revise-decline').click().catch(() => undefined);
      }
    }

    // Add to home screen: the install sheet with this platform's steps (Safari on iPhone and iPad, the
    // desktop guide at 1440), and at 390 also as Chrome on Android sees it, in the same session.
    if (await go(`/apps/${light.app.id}/?install=1`, 'rt-install-sheet')) await shot(page, `flow-install-${vp.name}`);
    if (vp.name === '390') {
      const androidCtx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: SCALE, timezoneId: TIME_ZONE, storageState: await ctx.storageState() });
      const androidPage = await androidCtx.newPage();
      await androidPage.goto(`${BASE}/apps/${light.app.id}/?install=1`);
      if (await waitFor(androidPage, 'rt-install-sheet')) await shot(androidPage, `flow-install-android-${vp.name}`);
      await androidCtx.close();
    }

    // Use the app you have, from the Agent (Riff with the link to save; People with Maya drafted).
    if (useRiff && (await go(`/apps/${riff.app.id}/?from=${useRiff.id}`, 'rt-suggestion', { timeout: 15_000 }))) await shot(page, `flow-use-riff-${vp.name}`);
    if (useMaya && (await go(`/apps/${people.app.id}/?from=${useMaya.id}`, 'rt-record-form', { timeout: 15_000 }))) await shot(page, `flow-use-people-${vp.name}`);

    // An honest practice save: measured time, never the plan.
    if (await go(`/apps/${riff.app.id}/`, 'rt-practice-start')) {
      await page.getByTestId('rt-practice-start').click();
      await page.waitForTimeout(1600);
      await page.getByTestId('rt-practice-pause').click();
      await page.getByTestId('rt-practice-save').click();
      if (await waitFor(page, 'rt-form-note', { timeout: 10_000 })) await shot(page, `flow-practice-save-${vp.name}`);
      await page.getByTestId('rt-cancel-record').click().catch(() => undefined);
      await page.getByTestId('rt-practice-reset').click().catch(() => undefined);
    }

    // The data-safe undo plan.
    if (await go(`/apps/${undoDemo.app.id}/settings`, 'rt-undo')) {
      await page.getByTestId('rt-undo').click();
      if (await waitFor(page, 'rt-undo-plan', { timeout: 10_000 })) {
        await page.getByTestId('rt-undo-plan').scrollIntoViewIfNeeded().catch(() => undefined);
        await shot(page, `flow-undo-plan-${vp.name}`, { view: true });
      }
    }
    await ctx.close();
  }
  console.log(`Saved ${taken} screenshots to ${OUT}`);
  if (missing.length) {
    console.warn(`Not shown (${missing.length}):\n- ${missing.join('\n- ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
