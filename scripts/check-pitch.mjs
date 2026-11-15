#!/usr/bin/env node
// Check the pitch the way a judge sees it, in real browsers, against a running site.
//
// Usage: node scripts/check-pitch.mjs --base <url of the deck> [--out <folder>] [--scenes 15]
//        node scripts/check-pitch.mjs --dir <folder with the deck's files> [--port 8870] [...]
//   --base  the deck's address, e.g. https://ori-fjrx.onrender.com/pitch/ or http://localhost:8787/pitch/
//   --dir   serve a folder with `python -m http.server` on 127.0.0.1:<port> instead, and stop it afterwards
//   --out   where screenshots and results.json go (default: a folder in the system temp directory)
//
// Checks, in Chromium (the WebM clips) and Microsoft Edge (the MP4 clips; Playwright's Chromium cannot decode H.264):
//   navigation by buttons, keys and #1..#N; a refresh keeps the scene; the notes follow the scene; the timer starts,
//   pauses and resets; every clip plays and its scene says Sample mode; same-origin links open ("Open Ori" reaches
//   the product), no link to a developer machine, the GitHub link present; no failed requests, no requests to other
//   hosts, no console errors; no horizontal overflow at 1440x900, 768x1024, 390x844 and 320x568, with screenshots.
// Browser viewport sizes are emulated: this is not a check on a physical phone.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIR = opt('dir', '') ? resolve(opt('dir', '')) : '';
const PORT = Number(opt('port', '8870'));
const OUT = resolve(opt('out', join(tmpdir(), `ori-pitch-check-${process.pid}`)));
const EXPECTED_SCENES = Number(opt('scenes', '15'));
const GITHUB = 'https://github.com/geeeethubb/Ori';
let BASE = opt('base', '');
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (browser, check, ok, detail = '') => {
  results.push({ browser, check, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${browser}] ${check}${detail ? ` — ${detail}` : ''}`);
};
const note = (browser, check, detail) => {
  results.push({ browser, check, ok: null, detail });
  console.log(`NOTE  [${browser}] ${check} — ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
async function startServer() {
  server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', DIR], { stdio: 'ignore' });
  server.on('error', (e) => { console.error(`Could not start python -m http.server: ${e.message}`); process.exit(2); });
  BASE = `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('the static server did not start');
}

async function active(page) {
  return page.evaluate(() => {
    const slide = document.querySelector('.slide:not([hidden])');
    const label = slide ? slide.getAttribute('aria-label') || '' : '';
    return {
      index: slide ? Number(slide.dataset.index) + 1 : 0,
      total: document.querySelectorAll('.slide').length,
      count: (document.querySelector('#slide-count')?.textContent || '').replace(/\s+/g, ' ').trim(),
      hash: location.hash,
      headline: label.replace(/^Scene \d+ of \d+: /, ''),
    };
  });
}
async function goScene(page, n) {
  await page.evaluate((h) => { location.hash = h; }, `#${n}`);
  await page.waitForFunction((i) => document.querySelector('.slide:not([hidden])')?.dataset.index === String(i), n - 1, { timeout: 5000 });
  await sleep(150);
}
const dialogOpen = (page, id) => page.evaluate((sel) => {
  const d = document.querySelector(sel);
  return !!d && (d.open === true || d.hasAttribute('open') || (!d.hidden && getComputedStyle(d).display !== 'none' && d.getClientRects().length > 0));
}, id);

async function checkBrowser(name, launchOptions) {
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
  } catch (e) {
    note(name, 'launch', `not available here (${e.message.split('\n')[0]}); skipped`);
    return;
  }
  const origin = new URL(BASE).origin;
  const failures = [];
  const external = [];
  const consoleErrors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const watch = (page) => {
    page.on('requestfailed', (r) => {
      const why = r.failure()?.errorText || '';
      // A media element that stops downloading when its scene changes reports an aborted request; that is not a failure.
      if (/ERR_ABORTED/.test(why) && /\.(mp4|webm)(\?|$)/.test(r.url())) return;
      failures.push(`${r.url()} (${why})`);
    });
    page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.url()} → ${r.status()}`); });
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(origin) && !/^(data|blob):/.test(u)) external.push(u);
    });
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));
  };
  const page = await context.newPage();
  watch(page);

  // Loading and navigation.
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.slide:not([hidden])', { timeout: 10000 });
  let s = await active(page);
  record(name, 'opens at scene 1 with no hash', s.index === 1, `${s.count}, "${s.headline}"`);
  record(name, `has ${EXPECTED_SCENES} scenes`, s.total === EXPECTED_SCENES, `found ${s.total}`);
  const total = s.total;

  await page.keyboard.press('ArrowRight');
  await sleep(250);
  s = await active(page);
  record(name, 'ArrowRight goes to scene 2 and sets #2', s.index === 2 && s.hash === '#2', `${s.count} ${s.hash}`);
  await page.keyboard.press('ArrowLeft');
  await sleep(250);
  s = await active(page);
  record(name, 'ArrowLeft returns to scene 1', s.index === 1, s.count);
  await page.click('#next-btn');
  await sleep(250);
  const afterNext = (await active(page)).index;
  await page.click('#prev-btn');
  await sleep(250);
  const afterPrev = (await active(page)).index;
  record(name, 'Next and Previous buttons', afterNext === 2 && afterPrev === 1, `next → ${afterNext}, previous → ${afterPrev}`);
  await page.keyboard.press('End');
  await sleep(250);
  const atEnd = (await active(page)).index;
  await page.keyboard.press('Home');
  await sleep(250);
  const atHome = (await active(page)).index;
  record(name, 'End and Home keys', atEnd === total && atHome === 1, `End → ${atEnd}, Home → ${atHome}`);

  const badHashes = [];
  for (let n = 1; n <= total; n++) {
    try {
      await goScene(page, n);
      const a = await active(page);
      if (a.index !== n || !a.count.includes(`${String(n).padStart(2, '0')} / ${total}`)) badHashes.push(`#${n} → ${a.count}`);
    } catch {
      badHashes.push(`#${n} did not open`);
    }
  }
  record(name, `#1..#${total} each open their scene`, badHashes.length === 0, badHashes.join('; '));

  for (const n of [7, 12]) {
    if (n > total) continue;
    await page.goto(`${BASE}#${n}`, { waitUntil: 'load' });
    await page.waitForSelector('.slide:not([hidden])');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.slide:not([hidden])');
    await sleep(200);
    const a = await active(page);
    record(name, `refresh on #${n} keeps scene ${n}`, a.index === n, `${a.count} ${a.hash}`);
  }

  // Notes follow the scene.
  await goScene(page, 1);
  await page.click('#notes-btn');
  await sleep(300);
  const notesOpen = await dialogOpen(page, '#notes');
  const h1 = (await active(page)).headline;
  const t1 = (await page.textContent('#notes-title'))?.trim();
  await page.click('#notes-next');
  await sleep(300);
  const a2 = await active(page);
  const t2 = (await page.textContent('#notes-title'))?.trim();
  record(name, 'notes open and follow the scene', notesOpen && t1 === h1 && a2.index === 2 && t2 === a2.headline,
    `open=${notesOpen}; scene 1 notes "${t1}"; after Next scene ${a2.index} notes "${t2}"`);

  // Timer: start, pause, reset.
  await page.click('#timer-toggle');
  await sleep(2300);
  const running = (await page.textContent('#timer-display'))?.trim();
  await page.click('#timer-toggle');
  const paused1 = (await page.textContent('#timer-display'))?.trim();
  await sleep(1300);
  const paused2 = (await page.textContent('#timer-display'))?.trim();
  await page.click('#timer-reset');
  await sleep(150);
  const reset = (await page.textContent('#timer-display'))?.trim();
  record(name, 'timer starts, pauses and resets', running !== '0:00' && paused1 === paused2 && reset === '0:00',
    `after 2.3 s ${running}; paused ${paused1} → ${paused2}; reset ${reset}`);
  await page.keyboard.press('Escape');
  await sleep(200);

  // Clips: every media slot plays its recording, and its scene says Sample mode.
  const clipScenes = await page.evaluate(() => [...document.querySelectorAll('.slide')]
    .filter((sl) => sl.querySelector('.media-shell'))
    .map((sl) => Number(sl.dataset.index) + 1));
  record(name, 'scenes with a demo clip', clipScenes.length === 3, `scenes ${clipScenes.join(', ') || 'none'}`);
  for (const n of clipScenes) {
    await goScene(page, n);
    const clip = await page.evaluate(async () => {
      const slide = document.querySelector('.slide:not([hidden])');
      const shell = slide.querySelector('.media-shell');
      const video = shell.querySelector('video');
      const label = (shell.querySelector('.media-label')?.textContent || '').trim();
      const sceneText = slide.innerText;
      let playError = '';
      if (video) {
        video.muted = true;
        // play() never settles on a video with no source, so give it a few seconds.
        try {
          await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('play() did not start within 4 s')), 4000))]);
        } catch (e) { playError = String(e); }
      }
      return { state: shell.dataset.state || '', label, sampleMode: /Sample mode/i.test(sceneText), playError };
    });
    await sleep(1800);
    const media = await page.evaluate(() => {
      const video = document.querySelector('.slide:not([hidden]) .media-shell video');
      if (!video) return null;
      return { t: video.currentTime, ready: video.readyState, src: video.currentSrc, error: video.error ? video.error.code : 0, hidden: video.hidden, w: video.videoWidth };
    });
    const ok = !!media && clip.state === 'published' && !media.hidden && media.t > 0.5 && media.error === 0 && clip.sampleMode;
    record(name, `scene ${n} clip plays with a Sample-mode label`, ok,
      `state ${clip.state}; label "${clip.label}"; ${media ? `${media.src.split('/').pop()} at ${media.t.toFixed(1)} s, ${media.w}px wide` : 'no video'}${clip.playError ? `; play(): ${clip.playError}` : ''}${clip.sampleMode ? '' : '; no "Sample mode" text on the scene'}`);
  }
  if (clipScenes.length) {
    await goScene(page, clipScenes[0]);
    await page.evaluate(async () => {
      const v = document.querySelector('.slide:not([hidden]) .media-shell video');
      if (v) { v.muted = true; try { await Promise.race([v.play(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* checked above */ } }
    });
    await sleep(600);
    const wasPlaying = await page.evaluate(() => {
      const v = document.querySelector('.slide:not([hidden]) .media-shell video');
      return !!v && !v.paused && v.currentTime > 0;
    });
    await goScene(page, clipScenes[0] + 1);
    const pausedAway = await page.evaluate((i) => {
      const v = document.querySelector(`.slide[data-index="${i}"] .media-shell video`);
      return v ? v.paused : null;
    }, clipScenes[0] - 1);
    record(name, 'a playing clip pauses when the scene changes', wasPlaying && pausedAway === true, `playing before=${wasPlaying}, paused after=${pausedAway}`);
  }

  // Links: same-origin links must open ("Open Ori" must reach the product, not the deck or an error page);
  // nothing may point at a developer's machine; the GitHub link stays.
  await goScene(page, total);
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({
    text: a.textContent.replace(/\s+/g, ' ').trim(),
    href: a.href,
    raw: a.getAttribute('href') || '',
    visibleOnClosing: !!a.closest('.slide:not([hidden])'),
  })));
  const pageOrigin = new URL(page.url()).origin;
  const devMachine = links.filter((l) => /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:|\/|$)/.test(l.href) && new URL(l.href).origin !== pageOrigin);
  record(name, 'no link to a developer machine', devMachine.length === 0, devMachine.map((l) => `${l.text} → ${l.href}`).join('; '));
  const sameOrigin = [...new Map(links
    .filter((l) => !l.raw.startsWith('#') && /^https?:/.test(l.href) && new URL(l.href).origin === pageOrigin)
    .map((l) => [l.href.split('#')[0], l])).values()];
  const broken = [];
  for (const l of sameOrigin) {
    let status = 0;
    let body = '';
    try {
      const res = await fetch(l.href.split('#')[0]);
      status = res.status;
      body = await res.text();
    } catch (e) {
      body = String(e);
    }
    if (status === 0 || status >= 400) broken.push(`${l.text} → ${l.href} (${status || body})`);
    else if (/open ori/i.test(l.text) && !/id="root"/.test(body)) broken.push(`${l.text} → ${l.href} is not the Ori product`);
  }
  record(name, 'same-origin links open ("Open Ori" reaches the product)', broken.length === 0, `${sameOrigin.length} checked${broken.length ? `; ${broken.join('; ')}` : ''}`);
  const openOri = links.filter((l) => /open ori/i.test(l.text));
  note(name, '"Open Ori" link', openOri.length ? openOri.map((l) => l.href).join(', ') : 'not shown (config appUrl is empty)');
  const github = links.filter((l) => l.href.startsWith(GITHUB));
  record(name, 'GitHub link present on the closing scene', github.some((l) => l.visibleOnClosing), `${github.length} GitHub link(s)`);

  // Layout at four sizes, with screenshots of selected scenes.
  const shots = [1, 6, 7, 8, 11, 12, 13, 15].filter((n) => n <= total);
  for (const [w, h] of [[1440, 900], [768, 1024], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width: w, height: h });
    const overflow = [];
    for (let n = 1; n <= total; n++) {
      await goScene(page, n);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (extra > 1) overflow.push(`scene ${n} +${extra}px`);
      if (name === 'chromium' && (w === 1440 || w === 390) && shots.includes(n)) {
        await page.screenshot({ path: join(OUT, `scene-${String(n).padStart(2, '0')}-${w}.png`) });
      }
    }
    record(name, `no horizontal overflow at ${w}x${h}`, overflow.length === 0, overflow.join('; '));
  }

  record(name, 'no failed requests', failures.length === 0, failures.slice(0, 8).join('; '));
  record(name, 'no requests to other hosts', external.length === 0, [...new Set(external)].slice(0, 8).join('; '));
  record(name, 'no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  await browser.close();
}

if (!BASE && !DIR) {
  console.error('Usage: node scripts/check-pitch.mjs --base <url of the deck> | --dir <folder> [--port 8870] [--out <folder>] [--scenes 15]');
  process.exit(2);
}
try {
  if (!BASE) await startServer();
  console.log(`Checking ${BASE}${server ? ` (python -m http.server serving ${DIR})` : ''}; screenshots → ${OUT}`);
  await checkBrowser('chromium', {});
  await checkBrowser('msedge', { channel: 'msedge' });
} finally {
  if (server) server.kill();
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ base: BASE, dir: server ? DIR : null, results }, null, 2));
const failed = results.filter((r) => r.ok === false);
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed.length} failed, ${results.filter((r) => r.ok === null).length} notes. Results: ${join(OUT, 'results.json')}`);
process.exit(failed.length ? 1 : 0);
