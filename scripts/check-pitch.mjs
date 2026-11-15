#!/usr/bin/env node
// Check the pitch the way a judge sees it, in real browsers, against a running site.
//
// Usage: node scripts/check-pitch.mjs --base <url of the deck> [--out <folder>] [--scenes 15]
//        node scripts/check-pitch.mjs --dir <folder with the deck's files> [--port 8870] [...]
//   --base  the deck's address, e.g. https://ori-fjrx.onrender.com/pitch/ or http://localhost:8787/pitch/
//   --dir   serve a folder with `python -m http.server` on 127.0.0.1:<port> instead, and stop it afterwards
//   --out   where screenshots and results.json go (default: a folder in the system temp directory)
//
// Checks, in Chromium and Microsoft Edge (each plays the MP4 or falls back to the WebM):
//   navigation by buttons, keys and #1..#N; Next on the second-to-last scene reaches the last one and Next is then
//   disabled; a refresh keeps the scene; step reveals build with Next and arrive complete by hash; the notes follow
//   the scene; every spoken track fits its budget and the budgets total 238 s; the timer starts, pauses and resets;
//   every media slot either plays its recording (labelled Sample mode) or shows its real screenshot (labelled
//   Product screenshot); a playing clip pauses when its scene changes; the closing scene shows only the signature
//   line, the QR code (linking to the product) and the contact links; same-origin links open, nothing links to a
//   developer machine; no failed requests, no requests to other hosts, no console errors; every scene fits its stage
//   at 1366x768, 1600x900 and 1920x1080 in the normal page and in presentation mode (no vertical overflow, the bars
//   hidden in presentation mode); no horizontal overflow at 768x1024, 390x844 and 320x568; screenshots.
// Browser viewport sizes are emulated: this is not a check on a physical phone or projector.

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
// 15 presented scenes and 238 s (3:58): the brief's slide 2 moved to the appendix; slide 8 (presented #7) runs 25 s.
const EXPECTED_SCENES = Number(opt('scenes', '15'));
const EXPECTED_SECONDS = Number(opt('seconds', '238'));
const PRODUCT = 'https://ori-fjrx.onrender.com/';
const SIGNATURE = { line: 'Ori. Your phone, your story.', name: 'Zuyu Liu', email: 'zliu2017@illinois.edu', phone: '847-962-2868', links: ['mailto:zliu2017@illinois.edu', 'tel:+18479622868', PRODUCT] };
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
      step: Number(slide?.dataset.step || 1),
      steps: Number(slide?.dataset.steps || 1),
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

// Does the active scene fit its stage? Every visible element inside the scene must lie within the stage box, and the
// scene must not scroll. Also reports horizontal page overflow and the bars' opacity.
const fitReport = (page) => page.evaluate(() => {
  const slide = document.querySelector('.slide:not([hidden])');
  const stage = slide.querySelector('.stage');
  const scene = slide.querySelector('.scene');
  const s = stage.getBoundingClientRect();
  const d = document.getElementById('deck').getBoundingClientRect();
  const outside = [];
  for (const el of scene.querySelectorAll('*')) {
    if (el.closest('.sr-only, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1) outside.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`);
  }
  return {
    stageInDeck: s.left >= d.left - 1 && s.right <= d.right + 1 && s.top >= d.top - 1 && s.bottom <= d.bottom + 1 && s.height > 0,
    sceneScroll: scene.scrollHeight - scene.clientHeight,
    outside,
    hScroll: document.documentElement.scrollWidth - window.innerWidth,
    bars: ['.topbar', '.controls'].map((sel) => Number(getComputedStyle(document.querySelector(sel)).opacity)),
    stageMode: document.documentElement.classList.contains('is-stage'),
  };
});

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
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
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
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /\[ori-pitch\]/.test(m.text()))) consoleErrors.push(m.text()); });
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

  // The last two scenes: Next on the second-to-last reaches the last; the last stays (Q&A) with Next disabled.
  await goScene(page, total - 1);
  await page.click('#next-btn');
  await sleep(250);
  const last = await active(page);
  const nextDisabled = await page.isDisabled('#next-btn');
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  const stillLast = (await active(page)).index;
  record(name, `Next on ${total - 1} reaches ${total}; ${total} stays for Q&A`, last.index === total && last.hash === `#${total}` && nextDisabled && stillLast === total, `→ ${last.index} ${last.hash}; Next disabled ${nextDisabled}; → again ${stillLast}`);

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

  // Step reveals: arriving with Next from the scene before starts the build at step 1; each Next reveals a step and
  // then moves on; a hash arrival shows the complete scene.
  const builders = await page.evaluate(() => [...document.querySelectorAll('.slide')].filter((sl) => Number(sl.dataset.steps || 1) > 1).map((sl) => ({ n: Number(sl.dataset.index) + 1, steps: Number(sl.dataset.steps) })));
  for (const b of builders.filter((x) => x.n > 1)) {
    await goScene(page, b.n - 1);
    await page.click('#next-btn');
    await sleep(200);
    const first = await active(page);
    for (let i = 1; i < b.steps; i++) {
      await page.click('#next-btn');
      await sleep(120);
    }
    const full = await active(page);
    await page.click('#next-btn');
    await sleep(200);
    const moved = (await active(page)).index;
    await goScene(page, b.n);
    const byHash = await active(page);
    record(name, `scene ${b.n} builds in ${b.steps} steps with Next`, first.index === b.n && first.step === 1 && full.step === b.steps && moved === Math.min(total, b.n + 1) && byHash.step === b.steps,
      `arrive step ${first.step}; after ${b.steps - 1} Next step ${full.step}; then scene ${moved}; by hash step ${byHash.step}`);
  }
  if (!builders.length) note(name, 'step reveals', 'no scene builds in steps');

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

  // Every spoken track fits its budget (about 150 words a minute); the budgets total four minutes.
  const timing = await page.evaluate(() => (window.ORI_PITCH_TIMING || []).map((t) => ({ ...t })));
  const over = timing.filter((t) => t.estimate > t.seconds).map((t) => `${t.scene} ${t.id} ${t.estimate}s > ${t.seconds}s`);
  const budget = timing.reduce((sum, t) => sum + t.seconds, 0);
  record(name, `spoken tracks fit their budgets; budgets total ${EXPECTED_SECONDS} s`, timing.length === total && over.length === 0 && budget === EXPECTED_SECONDS, `${budget} s budgeted; ${timing.reduce((sum, t) => sum + t.words, 0)} words${over.length ? `; over: ${over.join(', ')}` : ''}`);

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

  // Media slots: each recording plays and says Sample mode; each screenshot loads and says Product screenshot.
  const slotScenes = await page.evaluate(() => [...document.querySelectorAll('.slide')]
    .filter((sl) => sl.querySelector('[data-slot]'))
    .map((sl) => Number(sl.dataset.index) + 1));
  let recordings = 0;
  let screenshots = 0;
  const recordingScenes = [];
  for (const n of slotScenes) {
    await goScene(page, n);
    await sleep(600);
    const slots = await page.evaluate(() => [...document.querySelectorAll('.slide:not([hidden]) [data-slot]')].map((el) => ({ key: el.dataset.slot, state: el.dataset.state })));
    for (const slot of slots) {
      if (slot.state === 'video') {
        recordings += 1;
        if (!recordingScenes.includes(n)) recordingScenes.push(n);
        const clip = await page.evaluate(async (key) => {
          const shell = document.querySelector(`.slide:not([hidden]) [data-slot="${key}"]`);
          const video = shell.querySelector('video');
          const label = (shell.querySelector('.media-label')?.textContent || '').trim();
          let playError = '';
          video.muted = true;
          // play() never settles on a video with no source, so give it a few seconds.
          try {
            await Promise.race([video.play(), new Promise((_, reject) => setTimeout(() => reject(new Error('play() did not start within 4 s')), 4000))]);
          } catch (e) { playError = String(e); }
          return { label, playError };
        }, slot.key);
        await sleep(1800);
        const media = await page.evaluate((key) => {
          const video = document.querySelector(`.slide:not([hidden]) [data-slot="${key}"] video`);
          return { t: video.currentTime, src: video.currentSrc, error: video.error ? video.error.code : 0, hidden: video.hidden, w: video.videoWidth, state: video.closest('[data-slot]').dataset.state };
        }, slot.key);
        await page.evaluate((key) => document.querySelector(`.slide:not([hidden]) [data-slot="${key}"] video`).pause(), slot.key);
        // The founder's context recording is labelled Live AI (its UI shows the badge); the others are Sample mode.
        const ok = media.state === 'video' && !media.hidden && media.t > 0.5 && media.error === 0 && /Sample mode|Live AI/.test(clip.label);
        record(name, `scene ${n} "${slot.key}" recording plays with an honest label`, ok,
          `label "${clip.label}"; ${media.src.split('/').pop()} at ${media.t.toFixed(1)} s, ${media.w}px wide${clip.playError ? `; play(): ${clip.playError}` : ''}`);
      } else {
        screenshots += 1;
        const still = await page.evaluate((key) => {
          const shell = document.querySelector(`.slide:not([hidden]) [data-slot="${key}"]`);
          const img = shell.querySelector('.media-still');
          return { state: shell.dataset.state, label: (shell.querySelector('.media-label')?.textContent || '').trim(), src: img.getAttribute('src') || '', loaded: img.complete && img.naturalWidth > 0, hidden: img.hidden };
        }, slot.key);
        record(name, `scene ${n} "${slot.key}" shows its real screenshot, labelled`, still.state === 'still' && still.loaded && !still.hidden && /^Product screenshot/.test(still.label) && /media\/stills\//.test(still.src),
          `state ${still.state}; label "${still.label}"; ${still.src}`);
      }
    }
  }
  record(name, 'media slots: the three demo recordings (create, grow, context), each labelled', recordings >= 3, `${recordings} recordings, ${screenshots} screenshots, scenes ${slotScenes.join(', ') || 'none'}`);
  if (recordingScenes.length) {
    const n = recordingScenes[0];
    await goScene(page, n);
    await page.evaluate(async () => {
      const v = document.querySelector('.slide:not([hidden]) [data-slot] video:not([hidden])');
      if (v) { v.muted = true; try { await Promise.race([v.play(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* checked above */ } }
    });
    await sleep(600);
    const wasPlaying = await page.evaluate(() => {
      const v = document.querySelector('.slide:not([hidden]) [data-slot] video:not([hidden])');
      return !!v && !v.paused && v.currentTime > 0;
    });
    await goScene(page, n + 1);
    const pausedAway = await page.evaluate((i) => {
      const v = document.querySelector(`.slide[data-index="${i}"] [data-slot] video`);
      return v ? v.paused : null;
    }, n - 1);
    record(name, 'a playing clip pauses when the scene changes', wasPlaying && pausedAway === true, `playing before=${wasPlaying}, paused after=${pausedAway}`);
  }

  // The closing scene: only the signature line, the QR code (to the product, no visible URL) and the contact links.
  await goScene(page, total);
  await sleep(400);
  const close = await page.evaluate(() => {
    const slide = document.querySelector('.slide:not([hidden])');
    const texts = [];
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent.trim();
      const el = walker.currentNode.parentElement;
      if (t && !el.closest('.sr-only, [hidden]') && el.getClientRects().length) texts.push(t);
    }
    const qr = slide.querySelector('a img[src*="qr"]');
    const companion = document.querySelector('.companion');
    return {
      line: slide.querySelector('h1, h2')?.textContent || '',
      text: texts.join(' ').replace(/\s+/g, ' ').trim(),
      links: [...slide.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).sort(),
      images: [...slide.querySelectorAll('img')].filter((i) => i.getClientRects().length).length,
      qrHref: qr ? qr.closest('a').getAttribute('href') : '',
      qrSize: qr ? Math.round(qr.getBoundingClientRect().width) : 0,
      companion: !!companion && !companion.hidden && slide.contains(companion),
    };
  });
  // The founder's closing slide: the signature line, Ori's logo and happy face, the QR with "Try Ori now" under it,
  // and the contact details; no other text, no visible URL.
  let rest = close.text.replace(/ \./g, '.');
  const missing = [SIGNATURE.line, SIGNATURE.name, SIGNATURE.email, SIGNATURE.phone, 'Try Ori now'].filter((part) => {
    const at = rest.indexOf(part);
    if (at < 0) return true;
    rest = rest.slice(0, at) + rest.slice(at + part.length);
    return false;
  });
  const extra = rest.replace(/\s+/g, ' ').trim();
  record(name, 'closing scene: the signature line, the QR with "Try Ori now", Ori\'s face and the contact details, nothing else',
    close.line === SIGNATURE.line && !missing.length && !extra && close.images >= 2 && close.images <= 3 && !close.companion && JSON.stringify(close.links) === JSON.stringify([...SIGNATURE.links].sort()) && close.qrHref === PRODUCT,
    `line "${close.line}"; text "${close.text}"${missing.length ? `; missing ${missing.join(' | ')}` : ''}${extra ? `; extra "${extra}"` : ''}; images ${close.images}; links ${close.links.join(', ')}; QR ${close.qrSize}px → ${close.qrHref}; corner companion ${close.companion}`);

  // Links: same-origin links must open (the QR's product link too, when the deck is served from the product); nothing
  // may point at a developer's machine.
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({
    text: a.textContent.replace(/\s+/g, ' ').trim() || a.getAttribute('aria-label') || '',
    href: a.href,
    raw: a.getAttribute('href') || '',
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
    else if (l.href === PRODUCT && !/id="root"/.test(body)) broken.push(`${l.text} → ${l.href} is not the Ori product`);
  }
  record(name, 'same-origin links open (the QR link reaches the product when served from it)', broken.length === 0, `${sameOrigin.length} checked${broken.length ? `; ${broken.join('; ')}` : ''}`);
  if (new URL(PRODUCT).origin !== pageOrigin) note(name, 'QR link', `${PRODUCT} is another origin from this deck; not fetched here`);

  // Fit on desktop and presentation screens, with screenshots of selected scenes.
  const shots = [1, 2, 3, 5, 6, 7, 9, 11, 14, 15].filter((n) => n <= total);
  for (const [w, h] of [[1366, 768], [1600, 900], [1920, 1080]]) {
    for (const mode of ['normal', 'presentation']) {
      const p = await context.newPage();
      watch(p);
      await p.setViewportSize({ width: w, height: h });
      await p.goto(BASE, { waitUntil: 'load' });
      await p.waitForSelector('.slide:not([hidden])');
      if (mode === 'presentation') {
        await p.keyboard.press('f');
        await p.waitForFunction(() => document.body.classList.contains('in-presentation'), null, { timeout: 5000 });
        await sleep(300);
      }
      const problems = [];
      for (let n = 1; n <= total; n++) {
        await goScene(p, n);
        const f = await fitReport(p);
        if (!f.stageMode) problems.push(`scene ${n} not in stage mode`);
        if (!f.stageInDeck) problems.push(`scene ${n} stage outside the screen`);
        if (f.sceneScroll > 1) problems.push(`scene ${n} overflows by ${f.sceneScroll}px`);
        if (f.outside.length) problems.push(`scene ${n} outside its stage: ${f.outside.slice(0, 3).join(', ')}`);
        if (f.hScroll > 1) problems.push(`scene ${n} +${f.hScroll}px wide`);
        if (mode === 'presentation' && f.bars.some((o) => o > 0)) problems.push(`scene ${n} bars visible (${f.bars.join(', ')})`);
        if (name === 'chromium' && (w === 1600 || (w === 1920 && mode === 'presentation')) && shots.includes(n)) {
          await p.screenshot({ path: join(OUT, `scene-${String(n).padStart(2, '0')}-${w}-${mode}.png`) });
        }
      }
      record(name, `every scene fits at ${w}x${h} (${mode})`, problems.length === 0, problems.slice(0, 6).join('; '));
      await p.close();
    }
  }
  // Narrow screens scroll within a scene, but never sideways.
  for (const [w, h] of [[768, 1024], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width: w, height: h });
    const overflow = [];
    for (let n = 1; n <= total; n++) {
      await goScene(page, n);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (extra > 1) overflow.push(`scene ${n} +${extra}px`);
      if (name === 'chromium' && w === 390 && shots.includes(n)) {
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
