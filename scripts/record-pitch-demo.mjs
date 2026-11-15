#!/usr/bin/env node
/**
 * Records the pitch's three product clips from the REAL app (one account, one Light app, one saved photo):
 *   01-create.webm         share a photo thought → Ori's reply → Preview Light → choose a focus → Make mine → Ready → Light
 *   02-use-and-revise.webm save an observation → Ask (Edit with Ori) → Review → Apply → Keep going: the same entry, new fields
 *   03-reopen.webm         a fresh browser session opens Light by its own link → the same entry is there
 *
 * Run against a server in Sample mode on a throwaway database (the clips say "Sample mode: scripted
 * responses, not live AI"). Phone viewport, rendered at 2x for readable text. A caption strip above the
 * app names each step; it is the only thing added to the page, and it never covers the app.
 *
 *   node scripts/record-pitch-demo.mjs --base http://localhost:8840 --out <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : [])).filter((x) => x.length));
const BASE = (args.base ?? 'http://localhost:8840').replace(/\/$/, '');
const OUT = path.resolve(args.out ?? 'recordings');
fs.mkdirSync(OUT, { recursive: true });

const VIEW = { width: 390, height: 844 };
const SCALE = 2;
const LABEL = 'Recorded product demo · Sample mode: scripted responses, not live AI';
const PHOTO = path.resolve('server/fixtures/media/light-1.jpg');
const THOUGHT = 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.';
const OBSERVATION = 'Low sun turns the brick wall gold';
const ASK = 'Add camera settings to my photo notes';
const timings = {};

/** The caption strip: injected on every document, above the app's own content (the body moves down). */
const STRIP = (label) => `(() => {
  const mount = () => {
    if (document.getElementById('demo-strip') || !document.body) return;
    const s = document.createElement('div');
    s.id = 'demo-strip';
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;height:58px;box-sizing:border-box;padding:8px 14px;background:#162039;color:#fff;font:600 17px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;justify-content:center;gap:3px;';
    s.innerHTML = '<span id="demo-step"></span><span style="font:500 11px/1.2 system-ui,-apple-system,Segoe UI,sans-serif;color:#DFFF76">${label}</span>';
    document.body.appendChild(s);
    document.documentElement.style.scrollPaddingTop = '64px';
    document.body.style.paddingTop = '58px';
    const step = sessionStorage.getItem('demo-step');
    if (step) document.getElementById('demo-step').textContent = step;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.__demoStep = (t) => { sessionStorage.setItem('demo-step', t); const el = document.getElementById('demo-step'); if (el) el.textContent = t; };
})();`;

let clock = Date.now();
const mark = (what) => { console.log(`  +${((Date.now() - clock) / 1000).toFixed(1)}s ${what}`); };
async function step(page, text, holdMs = 0) {
  mark(text);
  await page.evaluate((t) => window.__demoStep?.(t), text);
  if (holdMs) await page.waitForTimeout(holdMs);
}

async function recordContext(browser, storageState, name) {
  const dir = path.join(OUT, `raw-${name}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true,
    storageState, reducedMotion: 'no-preference',
    recordVideo: { dir, size: { width: VIEW.width * SCALE, height: VIEW.height * SCALE } },
  });
  await ctx.addInitScript(STRIP(LABEL));
  return { ctx, dir };
}

async function finish(ctx, page, dir, file) {
  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  fs.copyFileSync(raw, path.join(OUT, file));
  fs.rmSync(dir, { recursive: true, force: true });
}

const browser = await chromium.launch();
try {
  // Off camera: a fresh account, so Ori proposes a new app for this spark.
  const setup = await browser.newContext({ viewport: VIEW });
  const email = `pitch-demo-${Date.now().toString(36)}@example.test`;
  const r = await setup.request.post(`${BASE}/api/auth/signup`, { data: { email, password: 'walks-and-brick-walls', displayName: 'Zuyu' } });
  if (!r.ok()) throw new Error(`signup ${r.status()} ${await r.text()}`);
  const state = await setup.storageState();
  await setup.close();

  // ---------- 01 create ----------
  let { ctx, dir } = await recordContext(browser, state, 'create');
  let page = await ctx.newPage();
  let t0 = Date.now();
  await page.goto(`${BASE}/agent`);
  await step(page, 'A spark: a photo and a thought', 600);
  await page.getByTestId('agent-file-input').setInputFiles(PHOTO);
  await page.getByTestId('agent-text').fill(THOUGHT);
  await page.waitForTimeout(1300);
  await page.getByTestId('agent-send').click();
  const reply = page.getByTestId('agent-item').last().getByTestId('agent-reply');
  await reply.waitFor({ timeout: 60_000 });
  await step(page, 'Ori reads the note and suggests a place for it');
  const card = reply.locator('[data-testid="proposal-card"][data-kind="new_app"]').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2400);
  await card.getByTestId('proposal-action').click();
  await page.getByTestId('make-title').waitFor({ timeout: 60_000 });
  await step(page, 'Preview it, then shape one detail');
  await page.waitForTimeout(1200);
  const focus = page.getByTestId('make-instructions');
  if (await focus.count()) {
    await focus.scrollIntoViewIfNeeded();
    await focus.fill('Focus on shadows and reflections');
    await page.waitForTimeout(700);
    const update = page.getByTestId('make-preview-button');
    if (await update.count()) { await update.click(); await page.waitForTimeout(1500); }
  }
  const mine = page.getByTestId('make-mine').first();
  await mine.scrollIntoViewIfNeeded();
  await step(page, 'Make mine');
  await page.waitForTimeout(500);
  await mine.click();
  await page.getByTestId('make-ready').waitFor({ timeout: 60_000 });
  await step(page, 'Light is ready: its own app, its own link', 2200);
  const appHref = await page.getByTestId('make-ready-open').getAttribute('href');
  await page.getByTestId('make-ready-open').click();
  await page.getByTestId('rt-gallery-tile').first().waitFor({ timeout: 60_000 });
  await step(page, 'Light opens with your photo in it', 1800);
  timings.create = (Date.now() - t0) / 1000;
  await finish(ctx, page, dir, '01-create.webm');

  // ---------- 02 use and revise ----------
  ({ ctx, dir } = await recordContext(browser, state, 'revise'));
  page = await ctx.newPage();
  t0 = Date.now(); clock = t0; console.log('revise:');
  await page.goto(`${BASE}${appHref}`);
  await page.getByTestId('rt-gallery-tile').first().waitFor({ timeout: 60_000 });
  await step(page, 'Use it: write what you noticed', 900);
  await page.getByTestId('rt-gallery-tile').first().click();
  await page.getByTestId('rt-lightbox').waitFor();
  await page.getByTestId('rt-lightbox-edit').click();
  const form = page.getByTestId('rt-record-form');
  await form.waitFor();
  await form.getByLabel('What caught your eye?').fill(OBSERVATION);
  await page.waitForTimeout(900);
  await page.getByTestId('rt-save-record').click();
  await form.waitFor({ state: 'detached' });
  mark('observation saved');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(900);
  await step(page, 'Ask: change the app, not the photo');
  await page.getByTestId('rt-edit-with-ori').click();
  const edit = page.getByTestId('rt-edit-sheet');
  await edit.waitFor();
  await edit.getByTestId('rt-revise-input').fill(ASK);
  await page.waitForTimeout(900);
  await edit.getByTestId('rt-revise-preview').click();
  await edit.getByTestId('rt-revise-accept').waitFor({ timeout: 60_000 });
  await step(page, 'Review: the change, shown on your own photo');
  const preview = edit.getByTestId('rt-change-preview');
  if (await preview.count()) await preview.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);
  await edit.getByTestId('rt-revise-accept').click();
  mark('apply clicked');
  await edit.waitFor({ state: 'detached', timeout: 30_000 });
  mark('sheet closed');
  await step(page, 'Keep going: the same photo and note, now with camera settings');
  await page.waitForTimeout(1200);
  await page.getByTestId('rt-gallery-tile').first().click();
  await page.getByTestId('rt-lightbox').waitFor();
  await page.waitForTimeout(1200);
  await page.getByTestId('rt-lightbox-edit').click();
  await form.waitFor();
  const camera = form.getByLabel(/camera/i).first();
  await camera.scrollIntoViewIfNeeded();
  await camera.fill('Fuji X100V');
  await page.waitForTimeout(800);
  await page.getByTestId('rt-save-record').click();
  await form.waitFor({ state: 'detached' });
  mark('camera saved');
  // Show the saved photo once more: the same note, now with its camera setting.
  const box = page.getByTestId('rt-lightbox');
  if (!(await box.isVisible())) {
    await page.getByTestId('rt-gallery-tile').first().click();
    await box.waitFor();
  }
  await page.waitForTimeout(2400);
  timings.revise = (Date.now() - t0) / 1000;
  await finish(ctx, page, dir, '02-use-and-revise.webm');

  // ---------- 03 reopen ----------
  ({ ctx, dir } = await recordContext(browser, state, 'reopen'));
  page = await ctx.newPage();
  t0 = Date.now(); clock = t0; console.log('reopen:');
  await page.goto(`${BASE}${appHref}`);
  await step(page, 'Later: open Light directly by its own link');
  await page.getByTestId('rt-gallery-tile').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.getByTestId('rt-gallery-tile').first().click();
  await page.getByTestId('rt-lightbox').waitFor();
  await step(page, 'The same photo, note and camera settings', 3600);
  timings.reopen = (Date.now() - t0) / 1000;
  await finish(ctx, page, dir, '03-reopen.webm');

  fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify({ base: BASE, label: LABEL, seconds: timings, app: appHref, recordedAt: new Date().toISOString() }, null, 2));
  console.log('recorded', JSON.stringify(timings));
} finally {
  await browser.close();
}
