#!/usr/bin/env node
// Is the pitch visual, not text-heavy? Measures every presented slide and builds a storyboard.
//
// Usage: node scripts/check-pitch-density.mjs --dir client/public/pitch [--port 8890] [--out <folder>] [--scenes 15]
//        node scripts/check-pitch-density.mjs --base https://ori-fjrx.onrender.com/pitch/ [...]
//        [--size 1600x900] [--budget <scene-id>=<words> ...]
//
// For each slide (arrived at by its hash, so step reveals show their complete state) it measures, inside the slide
// only (not the deck's header, footer or navigation, not hidden or screen-reader-only text):
//   words        visible words; budget 35, or a per-slide budget for slides the brief makes denser
//                (promise 50, kept from the original deck; discovery 50; create 40, the founder's home-screen callout; grow 45, the brief requires its takeaway; growth 50, founder 70, positioning map 70, Velocity 60); --budget overrides
//   headline     words in the headline; at most 12
//   longest      the longest single text block other than the headline; at most 16 words (no paragraphs in cards)
//   visual       share of the slide covered by visuals (images, SVG, video, canvas, background images and text-free
//                shapes such as dots, bars and rings); fails under 15%, warns under 25% (not judged on the minimal signature slide)
//   text         share of the slide covered by text boxes (reported, not judged)
// It saves a screenshot of every slide and storyboard.png (all slides in order, small) to judge the visual story.
// Exit code 1 if any slide fails.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIR = opt('dir', '') ? resolve(opt('dir', '')) : '';
const PORT = Number(opt('port', '8890'));
const OUT = resolve(opt('out', join(tmpdir(), `ori-pitch-density-${process.pid}`)));
const EXPECTED = Number(opt('scenes', '15'));
const [W, H] = opt('size', '1600x900').split('x').map(Number);
let BASE = opt('base', '');
const budgets = [];
args.forEach((a, i) => { if (a === '--budget' && args[i + 1]) { const [k, v] = args[i + 1].split('='); budgets.push([k, Number(v)]); } });
const DEFAULT_BUDGET = 35;
const DENSE = [[/promise/, 50], [/discover/, 50], [/^feeling$/, 45], [/^create$/, 40], [/^grow$/, 45], [/growth|roadmap|goal/, 50], [/founder|gtm|community/, 70], [/position|map|compet/, 70], [/velocity/, 60]];
const budgetFor = (id) => {
  for (const [k, v] of budgets) if (id === k || id.includes(k)) return v;
  for (const [rx, v] of DENSE) if (rx.test(id)) return v;
  return DEFAULT_BUDGET;
};
if (!BASE && !DIR) {
  console.error('Usage: node scripts/check-pitch-density.mjs --dir <folder> | --base <url of the deck> [--port 8890] [--out <folder>] [--scenes 15] [--size 1600x900] [--budget id=words]');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server = null;
if (!BASE) {
  server = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', DIR], { stdio: 'ignore' });
  server.on('error', (e) => { console.error(`Could not start python -m http.server: ${e.message}`); process.exit(2); });
  BASE = `http://127.0.0.1:${PORT}/`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(BASE)).ok; } catch { /* not yet */ } if (!up) await sleep(250); }
  if (!up) { server.kill(); console.error('the static server did not start'); process.exit(2); }
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: 'reduce' })).newPage();
const errors = [];
let currentSlide = 'load';
page.on('pageerror', (e) => errors.push(`slide ${currentSlide}: ${String(e.stack || e).split(/\r?\n/).slice(0, 3).join(' | ')}`));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.slide');
const total = await page.evaluate(() => document.querySelectorAll('.slide').length);

const rows = [];
for (let n = 1; n <= total; n++) {
  currentSlide = String(n);
  await page.evaluate((h) => { location.hash = h; }, `#${n}`);
  await page.waitForFunction((i) => document.querySelector('.slide:not([hidden])')?.dataset.index === String(i), n - 1, { timeout: 5000 }).catch(() => {});
  await sleep(700);
  const m = await page.evaluate(() => {
    const slide = document.querySelector('.slide:not([hidden])');
    if (!slide) return null;
    const sr = slide.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    // The visible stage: the slide clipped to the viewport.
    const stage = { l: Math.max(sr.left, 0), t: Math.max(sr.top, 0), r: Math.min(sr.right, vw), b: Math.min(sr.bottom, vh) };
    const stageArea = Math.max(1, (stage.r - stage.l) * (stage.b - stage.t));
    const clipArea = (r) => Math.max(0, Math.min(r.right, stage.r) - Math.max(r.left, stage.l)) * Math.max(0, Math.min(r.bottom, stage.b) - Math.max(r.top, stage.t));
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      for (let e = el; e && e !== slide; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.clip && cs.clip !== 'auto' && /rect\(0/.test(cs.clip)) return false; // screen-reader-only
        if (cs.clipPath && cs.clipPath.includes('inset(50%')) return false;
        if (Number(cs.opacity) < 0.05) return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 3 && r.height > 3 && clipArea(r) > 0;
    };
    const wordsOf = (s) => (s.match(/[A-Za-z0-9$%][^\s]*/g) || []).length;
    // Text: visible text nodes, grouped by their nearest block-level element.
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    const blocks = new Map();
    let words = 0;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.textContent.replace(/\s+/g, ' ').trim();
      if (!text || !visible(t.parentElement)) continue;
      const w = wordsOf(text);
      if (!w) continue;
      words += w;
      let b = t.parentElement;
      while (b && b !== slide && /^(inline|contents)$/.test(getComputedStyle(b).display)) b = b.parentElement;
      blocks.set(b, (blocks.get(b) || 0) + w);
    }
    const head = slide.querySelector('h1, h2, .headline, [class*="headline"]');
    let headline = 0, longest = 0, longestText = '', textArea = 0;
    for (const [b, w] of blocks) {
      const r = b.getBoundingClientRect();
      textArea += clipArea(r);
      if (head && (b === head || head.contains(b) || b.contains(head))) { headline = Math.max(headline, w); continue; }
      if (w > longest) { longest = w; longestText = b.innerText.replace(/\s+/g, ' ').trim().slice(0, 110); }
    }
    // Visuals: media, SVG, canvas, background images and text-free shapes; outermost only, so nothing is counted twice.
    const cands = [];
    for (const el of slide.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const a = clipArea(r);
      if (a < stageArea * 0.0008) continue;
      const media = ['img', 'svg', 'video', 'canvas', 'picture'].includes(tag) || el.getAttribute('role') === 'img';
      const bgImage = cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage);
      const textFree = !el.innerText || !el.innerText.trim();
      const painted = (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none');
      const shape = textFree && painted && a < stageArea * 0.6;
      if (media || bgImage || shape) cands.push({ el, a });
    }
    const outer = cands.filter((c) => !cands.some((o) => o !== c && o.el.contains(c.el)));
    const visualArea = Math.min(stageArea, outer.reduce((s, c) => s + c.a, 0));
    return {
      id: (slide.id || '').replace(/^scene-/, ''),
      words, headline, longest, longestText,
      visual: visualArea / stageArea, text: Math.min(1, textArea / stageArea),
      overflowY: Math.max(0, Math.round(sr.bottom - vh)),
    };
  });
  if (!m) { rows.push({ n, id: '?', fail: ['the slide did not render'] }); continue; }
  const budget = budgetFor(m.id);
  const fail = [], warn = [];
  if (m.words > budget) fail.push(`${m.words} words > ${budget}`);
  if (m.headline > 12) fail.push(`headline ${m.headline} words > 12`);
  if (m.longest > 16) fail.push(`a ${m.longest}-word text block: "${m.longestText}"`);
  const minimal = /signature/.test(m.id); // the brief's closing slide is deliberately just a line, a QR and contact details
  if (minimal) { /* no visual-share minimum */ }
  else if (m.visual < 0.15) fail.push(`visual ${(m.visual * 100).toFixed(0)}% < 15%`);
  else if (m.visual < 0.25) warn.push(`visual only ${(m.visual * 100).toFixed(0)}%`);
  rows.push({ n, ...m, budget, fail, warn });
  await page.screenshot({ path: join(OUT, `slide-${String(n).padStart(2, '0')}.png`) });
}

// Storyboard: every slide in order, small, to read the story from the visuals alone.
page.removeAllListeners('pageerror');
const cols = 5, tw = 480, th = Math.round((480 * H) / W);
const tiles = rows.map((r) => `<figure><img src="data:image/png;base64,${readFileSync(join(OUT, `slide-${String(r.n).padStart(2, '0')}.png`)).toString('base64')}"><figcaption>#${r.n} ${r.id || ''}</figcaption></figure>`).join('');
await page.setViewportSize({ width: cols * (tw + 12) + 12, height: Math.ceil(rows.length / cols) * (th + 40) + 12 });
await page.setContent(`<style>body{margin:0;padding:6px;background:#fff;font:14px system-ui;display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:12px}figure{margin:0}img{width:${tw}px;height:${th}px;border:1px solid #ccc;display:block}figcaption{padding:4px 2px}</style>${tiles}`);
await page.screenshot({ path: join(OUT, 'storyboard.png'), fullPage: true });
await browser.close();
if (server) server.kill();

console.log(`Pitch density at ${W}x${H}: ${BASE}`);
console.log('  #  slide                words/budget  headline  longest  visual  text   result');
for (const r of rows) {
  const verdict = r.fail.length ? `FAIL ${r.fail.join('; ')}` : r.warn.length ? `PASS (warn: ${r.warn.join('; ')})` : 'PASS';
  console.log(`${String(r.n).padStart(3)}  ${(r.id || '').padEnd(20).slice(0, 20)} ${String(r.words).padStart(5)}/${String(r.budget).padEnd(6)} ${String(r.headline).padStart(8)} ${String(r.longest).padStart(8)} ${(r.visual * 100).toFixed(0).padStart(6)}% ${(r.text * 100).toFixed(0).padStart(5)}%  ${verdict}${r.overflowY ? ` · overflows ${r.overflowY}px` : ''}`);
}
if (total !== EXPECTED) console.log(`NOTE: ${total} slides found, ${EXPECTED} expected`);
if (errors.length) console.log(`page errors: ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(join(OUT, 'density.json'), JSON.stringify({ base: BASE, size: `${W}x${H}`, rows }, null, 2));
console.log(`Screenshots and storyboard.png: ${OUT}`);
const failed = rows.filter((r) => r.fail.length).length;
console.log(`${rows.length - failed}/${rows.length} slides pass`);
process.exit(failed ? 1 : 0);
