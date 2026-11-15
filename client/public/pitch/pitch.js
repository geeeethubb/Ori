'use strict';
// Ori pitch engine. Renders the scenes in scenes.js (the single scene data source) through the slide
// registry (window.ORI_SLIDES, filled by slides/*.js) or a built-in renderer, fits every scene to one
// 1600 x 900 design stage, and runs navigation, step reveals, the overview, speaker notes, the timer, the
// appendix, the media slots (config.js), the companion, presentation mode and keyboard control.
// No dependencies, no build step and no calls to any server: it works from any static host (the Ori
// server at /pitch/, or `python -m http.server`). The contract for slide authors is in
// docs/ori-pitch-kit/PITCH_INTEGRATION.md ("16-slide revision").
(() => {
  const config = window.ORI_PITCH || {};
  const scenes = Array.isArray(window.ORI_SCENES) ? window.ORI_SCENES : [];
  const appendixNames = window.ORI_APPENDIX_SECTIONS || {};
  const registry = window.ORI_SLIDES && typeof window.ORI_SLIDES === 'object' ? window.ORI_SLIDES : {};
  const ICONS = window.ORI_ICONS || { app: {}, ui: {} };
  // 15 presented scenes, 238 s (3:58): the brief's slide 2 moved to the appendix and slide 8 runs 25 s.
  const TARGET_SECONDS = 238;
  const EXPECTED_SCENES = 15;
  const WORDS_PER_SECOND = 2.5; // about 150 spoken words a minute
  // The design stage: every scene is laid out at 1600 x 900 and scaled to fit (stage mode). Narrow and
  // portrait screens use flow mode instead: no scaling, the scene scrolls.
  const STAGE = Object.freeze({ width: 1600, height: 900 });
  const FLOW_QUERY = '(max-width: 767px), (max-height: 499px), (max-width: 1100px) and (orientation: portrait)';
  const flowMedia = window.matchMedia(FLOW_QUERY);
  const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
  // The four expressions of the identity board, each drawn by a canonical shared/oriArt.ts mood.
  const EXPRESSION_ART = Object.freeze({ Listening: 'attentive', Thinking: 'thinking', 'Found something': 'discovery', Ready: 'success' });
  const presenter = typeof config.presenter === 'string' && config.presenter.trim() ? config.presenter.trim() : 'Zuyu Liu';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------------------------------------------------------------------------------------- */
  /* DOM helpers                                                                               */
  /* ---------------------------------------------------------------------------------------- */

  function fill(el, attrs, children) {
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key === 'style' && typeof value === 'object') for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
        else el.setAttribute(key, value === true ? '' : String(value));
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }
  const h = (tag, attrs, ...children) => fill(document.createElement(tag), attrs, children);
  const svg = (tag, attrs, ...children) => fill(document.createElementNS(SVG_NS, tag), attrs, children);
  const sr = (text) => h('span', { class: 'sr-only' }, text);
  const cls = (...names) => names.filter(Boolean).join(' ');

  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (total) => {
    const s = Math.max(0, Math.floor(total));
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  };
  const formatNumber = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ',');
  let idCounter = 0;
  const uid = (prefix) => `${prefix}-${(idCounter += 1)}`;
  const warned = new Set();
  const warnOnce = (message) => {
    if (warned.has(message)) return;
    warned.add(message);
    console.warn(`[ori-pitch] ${message}`);
  };

  /* ---------------------------------------------------------------------------------------- */
  /* Spoken-word estimate (the same rule as the rehearsal in docs/ori-pitch-kit/REHEARSAL.md)   */
  /* ---------------------------------------------------------------------------------------- */

  // Words as spoken: a hyphenated compound counts once ("AI-native"), a dash counts zero, and numbers
  // in digits count as said aloud (150 = "one hundred fifty", 3; 2027 = "twenty twenty-seven", 2).
  function numberWords(value) {
    let n = Math.floor(value);
    if (!Number.isFinite(n) || n <= 0) return 1;
    let words = 0;
    for (const size of [1e9, 1e6, 1e3]) {
      if (n >= size) {
        words += numberWords(Math.floor(n / size)) + 1;
        n %= size;
      }
    }
    if (n >= 100) {
      words += 2;
      n %= 100;
    }
    if (n > 0) words += 1;
    return words;
  }
  function spokenWordCount(text) {
    let count = 0;
    for (const raw of String(text || '').split(/\s+/)) {
      const token = raw.replace(/^[^A-Za-z0-9$]+/, '').replace(/[^A-Za-z0-9%]+$/, '');
      if (!token || !/[A-Za-z0-9]/.test(token)) continue;
      const m = /^(\$)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%)?$/.exec(token);
      if (!m) {
        count += 1;
        continue;
      }
      const whole = Number(m[2].replace(/,/g, ''));
      const isYear = !m[1] && !m[3] && !m[4] && m[2].length === 4 && whole >= 1900 && whole <= 2099;
      count += isYear ? 2 : numberWords(whole);
      if (m[3]) count += m[1] ? numberWords(Number(m[3])) : 1 + m[3].length;
      else if (m[1]) count += 1;
      if (m[4]) count += 1;
    }
    return count;
  }
  const speechSeconds = (words) => Math.round((words / WORDS_PER_SECOND) * 10) / 10;

  /* ---------------------------------------------------------------------------------------- */
  /* Scene data: timing                                                                         */
  /* ---------------------------------------------------------------------------------------- */

  const starts = [];
  let totalSeconds = 0;
  for (const scene of scenes) {
    starts.push(totalSeconds);
    totalSeconds += Number(scene.seconds) || 0;
  }
  const timing = scenes.map((scene, i) => {
    const words = spokenWordCount(scene.spoken);
    return Object.freeze({ scene: i + 1, id: scene.id, seconds: scene.seconds, start: starts[i], words, estimate: speechSeconds(words) });
  });
  // Read-only, for rehearsal tooling: budgets and spoken-track estimates as the notes show them.
  window.ORI_PITCH_TIMING = Object.freeze(timing);

  /* ---------------------------------------------------------------------------------------- */
  /* Icons: the project's own set (assets/icons.js, generated from shared/icons.ts and ui.tsx)  */
  /* ---------------------------------------------------------------------------------------- */

  // Two glyphs the product's set lacks, drawn in the same 24 x 24 stroke style (Lucide maximize-2 / minimize-2).
  const EXTRA_ICONS = {
    expand: { body: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>' },
    collapse: { body: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>' },
  };
  function glyphFor(name) {
    const text = String(name || '');
    const at = text.indexOf(':');
    if (at > 0) {
      const set = text.slice(0, at);
      const key = text.slice(at + 1);
      return (set === 'extra' ? EXTRA_ICONS : ICONS[set] || {})[key] || null;
    }
    return (ICONS.ui && ICONS.ui[text]) || (ICONS.app && ICONS.app[text]) || EXTRA_ICONS[text] || null;
  }
  // kit.icon('camera') → an inline 24 x 24 SVG in currentColor (decorative unless options.title is given).
  function icon(name, options = {}) {
    const glyph = glyphFor(name);
    const size = options.size || 24;
    if (!glyph) {
      warnOnce(`unknown icon "${name}"`);
      return h('span', { class: cls('kit-icon', 'is-missing', options.className), 'aria-hidden': 'true', style: { width: `${size}px`, height: `${size}px` } });
    }
    const el = svg('svg', {
      class: cls('kit-icon', options.className),
      viewBox: '0 0 24 24',
      width: String(size),
      height: String(size),
      fill: glyph.fill ? 'currentColor' : 'none',
      stroke: 'currentColor',
      'stroke-width': String(options.strokeWidth || glyph.strokeWidth || 2),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      focusable: 'false',
      'aria-hidden': options.title ? null : 'true',
      role: options.title ? 'img' : null,
    });
    el.innerHTML = glyph.body;
    if (options.title) el.prepend(svg('title', null, options.title));
    return el;
  }

  /* ---------------------------------------------------------------------------------------- */
  /* The kit: shared building blocks for slide renderers (window.ORI_KIT)                        */
  /* ---------------------------------------------------------------------------------------- */

  // The headline, with the scene's accent words in the accent colour (blue on light scenes, lime on ink).
  // A new sentence before the accent starts a new line (options.break === false keeps one line).
  function headline(scene, options = {}) {
    const tag = options.tag || 'h2';
    const text = String(scene.headline || '');
    const part = typeof scene.accent === 'string' ? scene.accent : '';
    const at = part ? text.lastIndexOf(part) : -1;
    const className = cls('headline', options.className);
    if (at < 0) return h(tag, { class: className }, text);
    const before = text.slice(0, at);
    const after = text.slice(at + part.length);
    const breakLine = options.break !== false && /[.!?]\s$/.test(before);
    return h(tag, { class: className }, before, breakLine ? h('br') : null, h('span', { class: 'accent' }, part), after);
  }
  const head = (scene, ...extra) => h('header', { class: 'scene-head' }, headline(scene), ...extra);
  // A small, unobtrusive label (the scene's short name). Optional: slides carry no section eyebrows by default.
  const sectionLabel = (scene, className) => h('p', { class: cls('kit-label', className) }, scene.label || '');
  // A compact qualifier that changes how a judge reads what they see: "Goal", "Proposed pricing",
  // "Product positioning", "Illustration". tone: 'quiet' (default), 'strong' (ink on lime), 'outline'.
  const tag = (text, options = {}) => h('span', { class: cls('kit-tag', options.tone ? `tone-${options.tone}` : '', options.className) }, text);
  const appendixLink = (id, text, label) => h('a', { class: 'ref-link', href: `#appendix-${id}`, 'data-appendix-link': id, 'aria-label': label || null }, text);
  const sourceLink = (href, text, className) => h('a', { class: className || 'source-link', href, target: '_blank', rel: 'noopener noreferrer' }, text, sr(' (opens a new tab)'));
  const arrowJoin = (items, render, options = {}) => items.flatMap((item, i) => [
    i ? h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, icon(options.arrow || 'arrowRight')) : null,
    i ? sr(options.joiner || ', then ') : null,
    render(item, i),
  ]);
  const flow = (items, options = {}) => h(options.tag || 'p', { class: cls('kit-flow', options.className) },
    arrowJoin(items, (item, i) => (options.render ? options.render(item, i) : h('span', { class: 'kit-flow-step' }, item)), options));
  const appIcon = (app, options = {}) => {
    const size = options.size || 64;
    return h('img', { class: cls('kit-app-icon', options.className), src: `assets/ori/app-${app}.svg`, alt: options.alt || '', width: String(size), height: String(size), decoding: 'async' });
  };
  // Ori inside a composition (the corner companion is separate): the canonical art for one of the four
  // expressions, on its lilac disc unless options.disc === false.
  function ori(expression, options = {}) {
    const art = EXPRESSION_ART[expression] || 'success';
    if (!EXPRESSION_ART[expression]) warnOnce(`unknown expression "${expression}" (use Listening, Thinking, Found something or Ready)`);
    const size = options.size || 160;
    return h('span', {
      class: cls('kit-ori', options.disc === false ? 'no-disc' : '', options.className),
      style: { '--ori-size': `${size}px` },
      role: options.label ? 'img' : null,
      'aria-label': options.label || null,
      'aria-hidden': options.label ? null : 'true',
      'data-expression': EXPRESSION_ART[expression] ? expression : 'Ready',
    },
    options.disc === false ? null : h('span', { class: 'kit-ori-disc' }),
    h('img', { class: 'kit-ori-art', src: `assets/ori/companion-${art}.svg`, alt: '', width: String(size), height: String(size), decoding: 'async' }));
  }
  // An image that downloads only when its scene (or the one before it) is shown.
  const lazyImage = (src, attrs = {}) => h('img', { decoding: 'async', ...attrs, 'data-src': src });
  // A real product screenshot outside a media slot, with its compact label (default "Product screenshot").
  const still = (src, options = {}) => h('figure', { class: cls('kit-still', options.className) },
    lazyImage(src, { alt: options.alt || '', width: options.width ? String(options.width) : null, height: options.height ? String(options.height) : null }),
    options.label === false ? null : h('figcaption', { class: 'kit-still-label' }, options.label || 'Product screenshot'));
  // Step reveals: mark an element to appear at step n (1-based) of a building slide. With ghost, it shows
  // dimmed until then instead of hidden.
  const reveal = (el, step, options = {}) => {
    el.setAttribute('data-reveal', String(step));
    if (options.ghost) el.classList.add('reveal-ghost');
    return el;
  };
  function placeholder(scene, note) {
    const index = scenes.indexOf(scene);
    return h('div', { class: 'kit-placeholder', 'data-placeholder': scene.layout },
      h('p', { class: 'kit-placeholder-tag' }, `Slide ${index + 1} · ${scene.group || 'core'} · layout “${scene.layout}”`),
      note ? h('p', { class: 'kit-placeholder-note' }, note) : null);
  }

  const kit = {
    version: 1,
    stage: STAGE,
    config,
    scenes,
    h,
    svg,
    sr,
    cls,
    pad2,
    clock,
    formatNumber,
    headline,
    head,
    sectionLabel,
    tag,
    label: tag,
    appendixLink,
    sourceLink,
    arrowJoin,
    flow,
    icon,
    hasIcon: (name) => Boolean(glyphFor(name)),
    appIcon,
    ori,
    expressions: Object.keys(EXPRESSION_ART),
    lazyImage,
    still,
    reveal,
    placeholder,
    reducedMotion: () => motionMedia.matches,
    isFlow: () => flowMedia.matches,
    // Filled in below: media slots, the step controls and the current scale.
    media: null,
    mediaControl: null,
    setStep: null,
    showAll: null,
    scale: () => 1,
  };
  window.ORI_KIT = kit;

  /* ---------------------------------------------------------------------------------------- */
  /* Media slots (config.js "media"): recordings, posters, stills, labels, cues, expand          */
  /* ---------------------------------------------------------------------------------------- */

  const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg' };
  const videoType = (src) => {
    const m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(src);
    return m ? VIDEO_TYPES[m[1].toLowerCase()] || '' : '';
  };
  function playableUrl(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    try {
      const url = new URL(text, location.href);
      return ['http:', 'https:', 'file:', 'blob:'].includes(url.protocol) ? text : '';
    } catch {
      return '';
    }
  }
  const MEDIA = config.media && typeof config.media === 'object' ? config.media : {};
  function slotSpec(key, overrides) {
    const base = MEDIA[key] || {};
    const pick = (name) => (overrides && overrides[name] !== undefined ? overrides[name] : base[name]);
    const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);
    return {
      key,
      title: pick('title') || key,
      sources: list(pick('sources')).map(playableUrl).filter(Boolean).map((src) => ({ src, type: videoType(src) })),
      poster: playableUrl(pick('poster') || ''),
      still: playableUrl(pick('still') || ''),
      label: pick('label') || 'Recorded product demo',
      stillLabel: pick('stillLabel') || 'Product screenshot',
      aspect: pick('aspect') || '390 / 844',
      cues: list(pick('cues')).map(Number).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b),
      describe: pick('describe') || '',
      alt: pick('alt') || '',
    };
  }

  const slotRecords = [];
  const slotsByKey = new Map();
  let expandedSlot = null;

  function setSlotState(record, state) {
    record.state = state;
    record.el.dataset.state = state;
    record.frame.dataset.state = state;
    const showVideo = state === 'video' || state === 'local';
    const showStill = state === 'still' || state === 'failed';
    record.video.hidden = !showVideo;
    record.still.hidden = !showStill;
    record.empty.hidden = state !== 'empty';
    record.playButton.hidden = !showVideo;
    record.replayButton.hidden = !showVideo;
    record.expandButton.hidden = !(showVideo || showStill);
    let text;
    if (state === 'local') text = 'Local preview · this tab only, not published';
    else if (showVideo) text = record.spec.label;
    else if (showStill) text = record.spec.stillLabel;
    else if (state === 'empty') text = 'Media unavailable';
    else text = record.spec.sources.length ? record.spec.label : record.spec.stillLabel;
    const [main, ...rest] = String(text).split(' · ');
    record.labelMain.textContent = main;
    record.labelRest.textContent = rest.length ? ` · ${rest.join(' · ')}` : '';
    syncPlayButton(record);
    record.el.dispatchEvent(new CustomEvent('ori:media', { bubbles: true, detail: { key: record.key, state } }));
  }

  function syncPlayButton(record) {
    const v = record.video;
    const playing = !v.paused && !v.ended;
    record.playButton.replaceChildren(icon(playing ? 'pause' : 'play'));
    record.playButton.setAttribute('aria-label', playing ? 'Pause' : v.ended ? 'Play again' : 'Play');
    record.playButton.title = playing ? 'Pause (Space)' : v.ended ? 'Play again' : 'Play (Space)';
    record.el.classList.toggle('is-playing', playing);
  }

  function showStill(record, failed) {
    if (!record.spec.still) {
      setSlotState(record, 'empty');
      return;
    }
    // A still downloads only here: when the slot has no recording, or its recording failed.
    if (record.still.getAttribute('src') !== record.spec.still) record.still.src = record.spec.still;
    setSlotState(record, failed ? 'failed' : 'still');
  }

  function failSlot(record) {
    if (record.state === 'failed' || record.state === 'empty' || record.state === 'still') return;
    record.video.pause();
    showStill(record, true);
    if (record.slideIndex === current) notify(record.state === 'failed'
      ? 'That recording could not load here, so the slot shows a product screenshot instead.'
      : 'That recording could not load here, and there is no screenshot to show.');
  }

  function loadSources(record, sources, mode, eager) {
    const video = record.video;
    video.pause();
    for (const old of $$('source', video)) old.remove();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    record.generation += 1;
    const generation = record.generation;
    record.cueIndex = -1;
    setSlotState(record, mode);
    if (mode === 'video' && record.spec.poster) video.poster = record.spec.poster;
    let failures = 0;
    for (const { src, type } of sources) {
      const source = h('source', { src, type: type || null });
      // A source the browser cannot play fires 'error' on the <source>, not on the video; the next source is
      // tried. Only when every source has failed does the slot fall back to its still.
      source.addEventListener('error', () => {
        if (generation !== record.generation) return;
        failures += 1;
        if (failures >= sources.length) failSlot(record);
      });
      video.append(source);
    }
    video.preload = eager ? 'auto' : 'metadata';
    video.load();
  }

  // Nothing downloads before a slot's scene is current (eager: the whole clip) or next (warm: metadata,
  // the poster, or a still that is the slot's own content).
  function prepareSlot(record, eager) {
    if (record.prepared) {
      if (eager && record.state === 'video' && record.video.preload !== 'auto') record.video.preload = 'auto';
      return;
    }
    record.prepared = true;
    if (record.local) loadSources(record, [record.local], 'local', true);
    else if (record.spec.sources.length) loadSources(record, record.spec.sources, 'video', eager);
    else showStill(record, false);
  }

  function resetSlot(record) {
    record.video.pause();
    for (const old of $$('source', record.video)) old.remove();
    record.video.removeAttribute('src');
    record.video.removeAttribute('poster');
    record.generation += 1;
    record.prepared = false;
    setSlotState(record, 'idle');
  }

  function playRecord(record) {
    const v = record.video;
    if (v.hidden) return;
    if (v.ended) v.currentTime = 0;
    const promise = v.play();
    if (promise) promise.catch(() => notify('Use the play button to start this clip.'));
  }
  function toggleRecord(record) {
    const v = record.video;
    if (v.hidden) return;
    if (v.paused || v.ended) playRecord(record);
    else v.pause();
  }
  function replayRecord(record) {
    const v = record.video;
    if (v.hidden) return;
    v.currentTime = 0;
    playRecord(record);
  }

  function updateCue(record) {
    const cues = record.spec.cues;
    if (!cues.length) return;
    const t = record.video.currentTime;
    let index = -1;
    cues.forEach((cue, i) => {
      if (t >= cue) index = i;
    });
    if (index === record.cueIndex) return;
    record.cueIndex = index;
    record.el.dispatchEvent(new CustomEvent('ori:cue', { bubbles: true, detail: { key: record.key, index, time: t, cues } }));
  }

  // Expand moves the frame (recording, label and controls) into a lightbox over the whole stage, so it
  // never depends on the slide's own layout; the slot keeps its size meanwhile. Collapse moves it back.
  function lightboxFor(stage) {
    let box = Array.from(stage.children).find((el) => el.classList.contains('media-lightbox'));
    if (!box) {
      const close = h('button', { type: 'button', class: 'media-lightbox-close', 'aria-label': 'Close the expanded view' }, icon('close'));
      close.addEventListener('click', () => collapseMedia());
      box = h('div', { class: 'media-lightbox', hidden: true }, h('div', { class: 'media-lightbox-inner' }), close);
      box.addEventListener('click', (e) => {
        if (e.target === box) collapseMedia();
      });
      stage.append(box);
    }
    return box;
  }
  function expandSlot(record, byKeyboard = false) {
    collapseMedia();
    record.returnFocus = byKeyboard;
    const stage = record.el.closest('.stage');
    if (!stage) return;
    const box = lightboxFor(stage);
    record.el.style.width = `${record.frame.offsetWidth}px`;
    record.el.style.height = `${record.frame.offsetHeight}px`;
    $('.media-lightbox-inner', box).append(record.frame);
    box.hidden = false;
    expandedSlot = record;
    record.frame.classList.add('is-expanded');
    record.expandButton.replaceChildren(icon('collapse'));
    record.expandButton.setAttribute('aria-expanded', 'true');
    record.expandButton.setAttribute('aria-label', 'Close the expanded view');
    document.body.classList.add('media-expanded');
    // From the keyboard, focus follows the frame; after a click the deck keeps the keys, so Space plays the clip.
    if (byKeyboard) record.expandButton.focus({ preventScroll: true });
    else deck.focus({ preventScroll: true });
  }
  function collapseMedia() {
    const record = expandedSlot;
    if (!record) return false;
    expandedSlot = null;
    const box = record.frame.closest('.media-lightbox');
    const restore = Boolean(record.returnFocus && box && box.contains(document.activeElement));
    record.returnFocus = false;
    record.el.append(record.frame);
    record.el.style.removeProperty('width');
    record.el.style.removeProperty('height');
    if (box) box.hidden = true;
    record.frame.classList.remove('is-expanded');
    record.expandButton.replaceChildren(icon('expand'));
    record.expandButton.setAttribute('aria-expanded', 'false');
    record.expandButton.setAttribute('aria-label', 'Expand');
    document.body.classList.remove('media-expanded');
    if (restore) record.expandButton.focus({ preventScroll: true });
    return true;
  }

  // kit.media('create', { height: 640 }) → a <figure class="media-slot"> for the config.js slot "create".
  // options: height or width (design px of the visible media), fit ('contain' | 'cover'), className, and any
  // config field to override for this placement (still, stillLabel, label, alt, cues …).
  function createSlot(key, options = {}) {
    if (!MEDIA[key]) warnOnce(`media slot "${key}" is not listed in config.js`);
    const spec = slotSpec(key, options);
    const id = uid(`media-${key}`);
    const video = h('video', { playsinline: true, muted: true, preload: 'none', hidden: true, 'aria-label': `Recording: ${spec.describe || spec.title}` });
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('webkit-playsinline', '');
    const stillImage = h('img', { class: 'media-still', alt: spec.alt || `Product screenshot: ${spec.describe || spec.title}`, hidden: true, decoding: 'async' });
    const empty = h('div', { class: 'media-empty', hidden: true }, icon('image', { size: 40 }));
    const viewport = h('div', { class: cls('media-viewport', options.fit === 'cover' ? 'fit-cover' : 'fit-contain') }, stillImage, video, empty);
    const labelMain = h('b', { class: 'label-main' });
    const labelRest = h('span', { class: 'label-rest' });
    const label = h('p', { class: 'media-label', id: `${id}-label` }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), h('span', { class: 'label-text' }, labelMain, labelRest));
    const playButton = h('button', { type: 'button', class: 'media-button media-play', 'aria-label': 'Play', title: 'Play (Space)', hidden: true });
    const replayButton = h('button', { type: 'button', class: 'media-button media-replay', 'aria-label': 'Replay from the start', title: 'Replay', hidden: true }, icon('reset'));
    const expandButton = h('button', { type: 'button', class: 'media-button media-expand', 'aria-label': 'Expand', 'aria-expanded': 'false', 'aria-controls': `${id}-frame`, title: 'Expand', hidden: true }, icon('expand'));
    // Size and state live on the frame, which moves into the lightbox when expanded.
    const sizeClass = options.height ? 'size-height' : options.width ? 'size-width' : 'size-fill';
    const style = { '--slot-aspect': spec.aspect };
    if (options.height) style['--slot-h'] = `${options.height}px`;
    if (options.width) style['--slot-w'] = `${options.width}px`;
    const frame = h('div', { class: cls('media-frame', sizeClass), id: `${id}-frame`, 'data-state': 'idle', style }, viewport, h('div', { class: 'media-bar' }, label, h('div', { class: 'media-controls' }, playButton, replayButton, expandButton)));
    const el = h('figure', { class: cls('media-slot', sizeClass, options.className), id, 'data-slot': key, 'data-state': 'idle', 'aria-labelledby': `${id}-label` }, frame);
    const record = { key, spec, el, frame, viewport, video, still: stillImage, empty, labelMain, labelRest, playButton, replayButton, expandButton, state: 'idle', prepared: false, generation: 0, cueIndex: -1, slideIndex: -1, local: null, playedThisVisit: false };

    // A mouse click on Play or Replay hands the keys back to the deck (as the toolbar does): the next Space then
    // pauses the clip, or moves on once it has ended, instead of pressing Play again and rewinding it.
    playButton.addEventListener('click', (e) => { toggleRecord(record); deckAfterPointer(e); });
    replayButton.addEventListener('click', (e) => { replayRecord(record); deckAfterPointer(e); });
    expandButton.addEventListener('click', (e) => (expandedSlot === record ? collapseMedia() : expandSlot(record, e.detail === 0)));
    video.addEventListener('click', () => toggleRecord(record));
    for (const type of ['play', 'pause', 'ended']) {
      video.addEventListener(type, () => {
        syncPlayButton(record);
        record.el.dispatchEvent(new CustomEvent('ori:playback', { bubbles: true, detail: { key, type, time: video.currentTime } }));
      });
    }
    // One clip at a time on a slide: starting one pauses any other that is playing there.
    video.addEventListener('play', () => {
      record.playedThisVisit = true;
      for (const other of slotRecords) if (other !== record && other.slideIndex === record.slideIndex && !other.video.paused) other.video.pause();
    });
    video.addEventListener('timeupdate', () => updateCue(record));
    video.addEventListener('seeked', () => updateCue(record));
    // A selected source that cannot be decoded fails on the video element itself.
    video.addEventListener('error', () => {
      if (video.error && (record.state === 'video' || record.state === 'local')) failSlot(record);
    });
    stillImage.addEventListener('error', () => {
      const recordingFailed = record.state === 'failed';
      if (record.state === 'still' || record.state === 'failed') setSlotState(record, 'empty');
      if (recordingFailed && record.slideIndex === current) notify('That recording and its screenshot could not load here.');
    });
    setSlotState(record, 'idle');
    slotRecords.push(record);
    if (!slotsByKey.has(key)) slotsByKey.set(key, record);
    return el;
  }

  function mediaControl(key) {
    const record = slotsByKey.get(key);
    if (!record) return null;
    return {
      key,
      el: record.el,
      video: record.video,
      get state() {
        return record.state;
      },
      get cues() {
        return record.spec.cues.slice();
      },
      get activeCue() {
        return record.cueIndex;
      },
      play: () => playRecord(record),
      pause: () => record.video.pause(),
      toggle: () => toggleRecord(record),
      replay: () => replayRecord(record),
      seek: (seconds) => {
        if (!record.video.hidden) record.video.currentTime = Math.max(0, Number(seconds) || 0);
      },
      expand: () => expandSlot(record),
      collapse: () => collapseMedia(),
    };
  }
  kit.media = createSlot;
  kit.mediaControl = mediaControl;

  /* ---------------------------------------------------------------------------------------- */
  /* Built-in scene compositions (slide 1 and the final slide); the rest come from slides/*.js   */
  /* ---------------------------------------------------------------------------------------- */

  const R = {};

  R.promise = (scene) => {
    const o = scene.onScreen || {};
    const title = scene.headline === 'Your phone, your story.'
      ? h('h1', { class: 'headline hero-title' }, 'Your phone,', h('br'), ' your ',
        h('span', { class: 'accent-word' }, 'story',
          svg('svg', { viewBox: '0 0 340 25', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: 'M4 15Q170 0 334 12' }))), '.')
      : h('h1', { class: 'headline hero-title' }, scene.headline);
    const collection = o.collection || [];
    const apps = collection.map((a) => h('div', { class: `phone-app app-${a.app}` }, appIcon(a.app, { className: 'phone-icon', size: 64 }), h('b', null, a.name), h('span', null, a.note)));
    const spark = h('div', { class: 'phone-app is-spark' }, h('span', { class: 'spark-slot' }, h('span', { class: 'spark-dot' })), h('b', null, 'Spark'), h('span', null, o.spark));
    const description = `Illustration: Ori beside a personal collection on a phone: ${collection.map((a) => `${a.name} for ${a.note}`).join(', ')}, and ${String(o.spark || '').replace(/…$/, '')}.`;
    const chips = o.chips || [];
    return {
      head: null,
      bodyClass: 'hero-body',
      body: [
        h('div', { class: 'hero-copy' },
          title,
          h('p', { class: 'lead' }, (String(o.lead || '').match(/[^.!?]+[.!?]+/g) || [o.lead]).flatMap((sentence, i) => [i ? ' ' : null, h('span', { class: 'lead-line' }, String(sentence).trim())])),
          h('div', { class: 'hero-meta' }, h('span', { class: 'pill' }, o.support), h('span', { class: 'byline' }, presenter))),
        h('div', { class: 'hero-world', role: 'img', 'aria-label': description },
          h('div', { class: 'world-ring ring-one' }), h('div', { class: 'world-ring ring-two' }),
          h('div', { class: 'phone-glimpse' }, h('div', { class: 'phone-notch' }), h('div', { class: 'phone-grid' }, apps, spark)),
          chips[0] ? h('div', { class: 'world-chip chip-one' }, chips[0]) : null,
          chips[1] ? h('div', { class: 'world-chip chip-two' }, chips[1]) : null,
          h('div', { class: 'world-caption' }, h('span', null, o.caption), o.illustration ? tag(o.illustration, { className: 'world-tag' }) : null)),
      ],
    };
  };

  // The close: Ori's wordmark over the signature line and the contact details; the QR code (linking to the
  // product) with Ori's happy face and “Try Ori now” under it.
  // The wordmark is the canonical asset, inlined so that on ink it takes its light variant (white letters, the
  // i's dot lime in its cobalt ring, as shared/oriArt.ts paints it); the cobalt file shows until it loads.
  const signatureLogo = () => {
    const holder = h('span', { class: 'signature-logo', 'aria-hidden': 'true' },
      h('img', { src: 'assets/ori/wordmark-cobalt.svg', alt: '', width: '136', height: '88', decoding: 'async' }));
    if (typeof fetch === 'function' && typeof DOMParser === 'function') {
      fetch('assets/ori/wordmark-ink.svg')
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((text) => {
          const svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg');
          if (!svg) return;
          svg.setAttribute('focusable', 'false');
          holder.replaceChildren(document.importNode(svg, true));
        })
        .catch(() => { /* the cobalt file stays */ });
    }
    return holder;
  };
  R.signature = (scene) => {
    const o = scene.onScreen || {};
    const line = String(o.line || scene.headline);
    const qr = o.qr || {};
    const c = o.contact || {};
    // "Your phone," / "your story." on two lines under the wordmark (which already says ori), as a callback
    // to the opening; the text stays exactly the one line (the space between the blocks is part of it).
    const m = /^(Your phone,)\s+(your )(story)(\.)$/.exec(line);
    const lineEl = m
      ? h('h2', { class: 'signature-line' }, h('span', { class: 'sig-row' }, m[1]), ' ', h('span', { class: 'sig-row' }, m[2], h('span', { class: 'accent' }, m[3]), m[4]))
      : h('h2', { class: 'signature-line' }, line);
    const qrHref = /^https:\/\//.test(String(qr.href || '')) ? qr.href : '';
    const qrImage = h('img', { src: qr.src, alt: qr.alt || 'QR code', width: '384', height: '384', decoding: 'async' });
    // Ori inside the slide (the scene's companion has corner: false), in its Ready expression unless the scene names another.
    const face = ori((scene.companion && scene.companion.expression) || 'Ready', { size: 112, className: 'signature-ori' });
    return {
      head: null,
      bodyClass: 'signature-body',
      companion: false,
      body: [h('div', { class: 'signature' },
        h('div', { class: 'signature-text' },
          signatureLogo(),
          lineEl,
          h('address', { class: 'signature-contact' },
            h('span', { class: 'contact-name' }, c.name),
            h('a', { class: 'contact-link', href: `mailto:${c.email}` }, c.email),
            h('a', { class: 'contact-link', href: `tel:${c.tel}` }, c.phone))),
        h('div', { class: 'signature-try' },
          qrHref
            ? h('a', { class: 'signature-qr', href: qrHref, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${qr.alt || 'QR code'} (opens a new tab)` }, qrImage)
            : h('span', { class: 'signature-qr' }, qrImage),
          h('p', { class: 'signature-cta' }, face, qr.caption ? h('span', { class: 'signature-cta-text' }, qr.caption) : null)))],
    };
  };

  const fallbackRender = (scene) => ({ body: [placeholder(scene, `No renderer is registered for the layout “${scene.layout}”.`)] });
  const rendererFor = (scene) => (typeof registry[scene.layout] === 'function' ? registry[scene.layout] : R[scene.layout]) || null;

  /* ---------------------------------------------------------------------------------------- */
  /* Scene data: a consistency check (console warnings only)                                    */
  /* ---------------------------------------------------------------------------------------- */

  (() => {
    const problems = [];
    const names = new Set();
    scenes.forEach((scene, i) => {
      for (const name of [scene.id, ...(scene.aliases || [])]) {
        if (!name || names.has(name) || /^\d+$/.test(name)) problems.push(`scene ${i + 1}: missing, numeric or duplicate id or alias "${name}"`);
        names.add(name);
      }
      if (scene.companion && !EXPRESSION_ART[scene.companion.expression]) problems.push(`${scene.id}: unknown expression "${scene.companion.expression}"`);
      if (timing[i].estimate > scene.seconds) problems.push(`${scene.id}: spoken track ≈ ${timing[i].estimate}s exceeds its ${scene.seconds}s budget`);
      if (!rendererFor(scene)) problems.push(`${scene.id}: no renderer for layout "${scene.layout}"`);
    });
    if (scenes.length !== EXPECTED_SCENES) problems.push(`expected ${EXPECTED_SCENES} scenes, found ${scenes.length}`);
    if (totalSeconds !== TARGET_SECONDS) problems.push(`scene budgets total ${totalSeconds}s, expected ${TARGET_SECONDS}s`);
    if (problems.length) console.warn('[ori-pitch] scene data:', problems.join('; '));
  })();

  /* ---------------------------------------------------------------------------------------- */
  /* Fit: one 1600 x 900 stage, scaled to the space between the bars (or the whole screen)       */
  /* ---------------------------------------------------------------------------------------- */

  const deck = $('#deck');
  // A mouse click or tap on a control hands the keys back to the deck (e.detail > 0): otherwise the next Space or
  // Enter would press that control again, and its :focus-visible ring would pin a presentation bar over the scenes.
  const pointerOpener = (e) => (e.detail > 0 ? deck : e.currentTarget);
  const deckAfterPointer = (e) => { if (e && e.detail > 0) deck.focus({ preventScroll: true }); };
  let stageScale = 1;
  function fit() {
    const flowMode = flowMedia.matches;
    const root = document.documentElement;
    root.classList.toggle('is-flow', flowMode);
    root.classList.toggle('is-stage', !flowMode);
    if (flowMode) {
      stageScale = 1;
      deck.style.removeProperty('--stage-scale');
      return;
    }
    const width = deck.clientWidth;
    const height = deck.clientHeight;
    if (!width || !height) return;
    stageScale = Math.min(width / STAGE.width, height / STAGE.height);
    deck.style.setProperty('--stage-scale', stageScale.toFixed(4));
  }
  kit.scale = () => stageScale;
  fit();

  /* ---------------------------------------------------------------------------------------- */
  /* Build the deck                                                                             */
  /* ---------------------------------------------------------------------------------------- */

  deck.setAttribute('aria-label', `Ori pitch, ${scenes.length} scenes`);
  const slides = [];
  const slideState = [];
  const asFunction = (value) => (typeof value === 'function' ? value : null);
  scenes.forEach((scene, i) => {
    const render = rendererFor(scene) || fallbackRender;
    let result;
    try {
      result = render(scene, kit);
    } catch (error) {
      console.error(`[ori-pitch] the "${scene.layout}" renderer failed on scene ${i + 1}; showing its placeholder.`, error);
      result = fallbackRender(scene);
    }
    if (result instanceof Node || Array.isArray(result)) result = { body: result };
    if (!result || typeof result !== 'object') result = fallbackRender(scene);
    const headEl = result.head === undefined ? head(scene) : result.head;
    const corner = Boolean(scene.companion && scene.companion.corner !== false && result.companion !== false);
    const large = Boolean(scene.companion && scene.companion.size === 'large');
    const slide = h('section', {
      class: cls('slide', `layout-${scene.layout}`, `scene-${scene.id}`, scene.theme === 'ink' ? 'theme-ink' : 'theme-light', corner ? 'has-companion' : '', corner && large ? 'companion-large' : '', result.className),
      id: `scene-${scene.id}`,
      role: 'group',
      'aria-roledescription': 'slide',
      'aria-label': `Scene ${i + 1} of ${scenes.length}: ${scene.headline}`,
      'data-index': String(i),
      'data-layout': scene.layout,
      hidden: true,
    }, h('div', { class: 'stage' }, h('div', { class: 'scene' }, headEl, h('div', { class: cls('scene-body', result.bodyClass) }, result.body))));
    deck.append(slide);
    slides.push(slide);
    const steps = Math.max(1, Math.floor(Number(result.steps) || 1));
    // Every slide exposes its build (complete until the presenter arrives with Next).
    slide.dataset.steps = String(steps);
    slide.dataset.step = String(steps);
    slideState.push({
      steps,
      step: steps,
      stepLabels: Array.isArray(result.stepLabels) ? result.stepLabels : [],
      onStep: asFunction(result.onStep),
      onEnter: asFunction(result.onEnter),
      onLeave: asFunction(result.onLeave),
      corner,
    });
  });
  if (!slides.length) deck.append(h('p', { class: 'noscript' }, 'The scene data (scenes.js) did not load.'));
  for (const record of slotRecords) record.slideIndex = slides.findIndex((slide) => slide.contains(record.el));

  // One companion for the whole deck, in the same upper corner of every scene that shows it. It moves into
  // the active stage (so it scales with the scene and scrolls with it on phones) and crossfades between
  // the four expressions; under reduced motion the change is instant.
  const companion = h('div', { class: 'companion', 'aria-hidden': 'true', hidden: true },
    h('span', { class: 'companion-disc' }),
    Object.entries(EXPRESSION_ART).map(([expression, art]) => h('img', { class: 'companion-art', src: `assets/ori/companion-${art}.svg`, alt: '', width: '100', height: '100', 'data-expression': expression, decoding: 'async' })));

  function placeCompanion(index) {
    const scene = scenes[index];
    const state = slideState[index];
    const stage = $('.stage', slides[index]);
    if (!state.corner) {
      companion.hidden = true;
      return;
    }
    const c = scene.companion || {};
    const expression = EXPRESSION_ART[c.expression] ? c.expression : 'Listening';
    if (companion.parentNode !== stage) stage.append(companion);
    companion.hidden = false;
    companion.dataset.size = c.size === 'large' ? 'large' : 'small';
    const previous = companion.dataset.expression || '';
    if (previous === expression) {
      // Same expression on the next scene: no fade (re-inserting the element would replay it).
      companion.classList.remove('is-changing');
      for (const img of $$('.companion-art', companion)) img.classList.remove('was-active');
      return;
    }
    companion.dataset.expression = expression;
    for (const img of $$('.companion-art', companion)) {
      img.classList.toggle('is-active', img.dataset.expression === expression);
      img.classList.toggle('was-active', Boolean(previous) && img.dataset.expression === previous);
    }
    companion.classList.remove('is-changing');
    if (previous) {
      void companion.offsetWidth; // restart the crossfade
      companion.classList.add('is-changing');
    }
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Progress dots and overview                                                                 */
  /* ---------------------------------------------------------------------------------------- */

  const dotsHolder = $('#progress-dots');
  const overviewGrid = $('#overview-grid');
  scenes.forEach((scene, i) => {
    dotsHolder.append(h('button', { type: 'button', class: 'dot-button', 'aria-label': `Scene ${i + 1}: ${scene.label || scene.headline}`, title: `${i + 1}. ${scene.label || scene.headline}`, onclick: (e) => { go(i); deckAfterPointer(e); } }));
    const tile = h('button', {
      type: 'button',
      class: cls('overview-tile', scene.id === 'velocity' ? 'is-velocity' : '', scene.theme === 'ink' ? 'is-ink' : ''),
      'aria-label': `Scene ${i + 1}: ${scene.label}. ${scene.headline} ${scene.seconds} seconds.`,
    },
    h('span', { class: 'tile-meta' }, h('span', null, `Scene ${pad2(i + 1)}`), h('span', null, `${scene.seconds}s · ${clock(starts[i])}`)),
    h('span', { class: 'tile-section' }, scene.label),
    h('b', { class: 'tile-title' }, scene.headline));
    tile.addEventListener('click', (e) => {
      if (e.detail > 0) openers.set(dialogs.overview, deck);
      dialogs.overview.close();
      go(i);
    });
    overviewGrid.append(tile);
  });

  /* ---------------------------------------------------------------------------------------- */
  /* Navigation and step reveals                                                                */
  /* ---------------------------------------------------------------------------------------- */

  let current = -1;

  const announce = (text) => {
    $('#slide-announcement').textContent = text;
  };

  function replaceHash(hash) {
    if (location.hash === hash) return;
    try {
      history.replaceState(null, '', hash);
    } catch {
      /* file:// in some browsers */
    }
  }

  function pauseVideos(root = document) {
    for (const video of $$('video', root)) video.pause();
  }

  const contextFor = (index, via) => ({
    scene: scenes[index],
    index,
    slide: slides[index],
    stage: $('.stage', slides[index]),
    step: slideState[index].step,
    steps: slideState[index].steps,
    via: via || null,
    reducedMotion: motionMedia.matches,
    flow: flowMedia.matches,
    kit,
  });
  function callHook(index, name, via) {
    const state = slideState[index];
    const hook = state && state[name];
    if (!hook) return;
    try {
      if (name === 'onStep') hook(state.step, contextFor(index, via));
      else hook(contextFor(index, via));
    } catch (error) {
      console.error(`[ori-pitch] ${name} failed on scene ${index + 1}`, error);
    }
  }

  // A building slide reveals one step per Next when the presenter arrives with Next from the scene before;
  // any other arrival (a hash, the overview, a dot, Previous, a refresh) shows its complete state.
  function applyStep(index, via) {
    const state = slideState[index];
    const slide = slides[index];
    const building = state.steps > 1 && state.step < state.steps;
    slide.dataset.step = String(state.step);
    slide.dataset.steps = String(state.steps);
    slide.classList.toggle('is-building', building);
    for (const el of $$('[data-reveal]', slide)) el.classList.toggle('is-revealed', Number(el.getAttribute('data-reveal')) <= state.step);
    callHook(index, 'onStep', via);
  }
  function setStep(step, via = 'step') {
    if (current < 0) return;
    const state = slideState[current];
    if (state.steps < 2) return;
    state.step = Math.max(1, Math.min(state.steps, Math.floor(Number(step) || 1)));
    applyStep(current, via);
    const label = state.stepLabels[state.step - 1];
    announce(state.step < state.steps ? `Step ${state.step} of ${state.steps}${label ? `: ${label}` : ''}` : `All ${state.steps} steps shown${label ? `: ${label}` : ''}.`);
    updateChrome(false);
  }
  kit.setStep = setStep;
  kit.showAll = () => {
    if (current >= 0) setStep(slideState[current].steps, 'show-all');
  };

  function prepareScene(index, eager) {
    const slide = slides[index];
    if (!slide) return;
    for (const img of $$('img[data-src]', slide)) {
      if (!img.getAttribute('src')) img.src = img.dataset.src;
    }
    for (const record of slotRecords) if (record.slideIndex === index) prepareSlot(record, eager);
  }

  function go(index, options = {}) {
    if (!slides.length) return;
    const via = options.via || 'jump';
    const target = Math.max(0, Math.min(slides.length - 1, Number(index) || 0));
    const previous = current;
    current = target;
    collapseMedia();
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.hidden = !active;
      slide.classList.toggle('active', active);
      if (!active) pauseVideos(slide);
    });
    const slide = slides[current];
    slide.scrollTop = 0;
    const state = slideState[current];
    state.step = state.steps > 1 && via === 'next' && previous === current - 1 ? 1 : state.steps;
    prepareScene(current, true);
    prepareScene(current + 1, false);
    placeCompanion(current);
    // Each visit starts fresh: the first Next on a scene starts its clip again only if it has not played on this visit.
    if (previous !== current) for (const r of slotRecords) r.playedThisVisit = false;
    if (previous !== current && previous >= 0) callHook(previous, 'onLeave', via);
    if (previous !== current) callHook(current, 'onEnter', via);
    applyStep(current, via);
    updateChrome(true);
    if (options.updateHash !== false) replaceHash(`#${current + 1}`);
  }

  function next() {
    const state = slideState[current];
    if (state && state.steps > 1 && state.step < state.steps) {
      setStep(state.step + 1, 'next');
      return;
    }
    // A clicker sends → or PageDown, not Space: like a build step, the first Next on a scene starts its clip when
    // the clip has not played on this visit; the following Next moves on, whether or not the clip is still playing.
    const rec = currentRecording();
    if (rec && !rec.playedThisVisit && !rec.video.ended) {
      rec.playedThisVisit = true;
      toggleRecord(rec);
      return;
    }
    if (current < slides.length - 1) go(current + 1, { via: 'next' });
  }

  function previous() {
    if (current > 0) go(current - 1, { via: 'previous' });
  }

  function updateChrome(announceScene) {
    if (current < 0) return;
    const scene = scenes[current];
    const state = slideState[current];
    const building = state.steps > 1 && state.step < state.steps;
    $('#slide-count').replaceChildren(sr('Scene '), `${pad2(current + 1)} / ${scenes.length}`);
    $('#slide-name').textContent = scene.label || '';
    $$('#progress-dots button').forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
    $$('#overview-grid button').forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
    $('#deck-progress-fill').style.width = `${((current + 1) / scenes.length) * 100}%`;
    $('#prev-btn').disabled = current === 0;
    $('#next-btn').disabled = current === scenes.length - 1 && !building;
    $('#next-btn').setAttribute('aria-label', building ? 'Reveal the next step' : 'Next scene');
    document.body.dataset.scene = scene.id;
    document.body.classList.toggle('on-ink', scene.theme === 'ink');
    document.title = `Ori — ${scene.headline}`;
    if (announceScene) announce(`Scene ${current + 1} of ${scenes.length}. ${scene.label}: ${scene.headline}${building ? ` Step ${state.step} of ${state.steps}.` : ''}`);
    syncNotes();
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Dialogs: overview, notes, setup, appendix                                                  */
  /* ---------------------------------------------------------------------------------------- */

  const dialogs = { overview: $('#overview'), notes: $('#notes'), setup: $('#setup'), appendix: $('#appendix') };
  const openers = new Map();
  const switching = new Set();
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

  function openDialog(dialog, opener) {
    collapseMedia();
    pauseVideos();
    let origin = opener instanceof HTMLElement ? opener : document.activeElement;
    for (const other of $$('dialog[open]')) {
      if (other === dialog) continue;
      // Switching dialogs: focus returns to whatever opened the first one.
      if (origin instanceof Element && other.contains(origin)) origin = openers.get(other) || null;
      switching.add(other);
      other.close();
    }
    if (!dialog.open) {
      openers.set(dialog, origin instanceof HTMLElement ? origin : null);
      dialog.showModal();
    }
  }

  for (const dialog of Object.values(dialogs)) {
    dialog.addEventListener('close', () => {
      const back = openers.get(dialog);
      openers.delete(dialog);
      if (dialog === dialogs.appendix && current >= 0) replaceHash(`#${current + 1}`);
      if (switching.has(dialog)) {
        switching.delete(dialog);
        return;
      }
      if ($('dialog[open]')) return;
      const usable = back && back.isConnected && !back.closest('[hidden]') && back.getClientRects().length > 0;
      (usable ? back : deck).focus({ preventScroll: true });
    });
    // Focus stays inside an open dialog: Tab and Shift+Tab wrap around.
    dialog.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = $$(FOCUSABLE, dialog).filter((el) => el.getClientRects().length > 0 && !el.closest('[hidden]'));
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    });
    // A click on the backdrop closes the dialog.
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
  }
  for (const button of $$('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());

  function openAppendix(section, opener) {
    const dialog = dialogs.appendix;
    // The appendix's return clip gets its poster only when the appendix opens: nothing downloads before it is needed.
    for (const v of dialog.querySelectorAll('video[data-poster]:not([poster])')) v.poster = v.dataset.poster;
    openDialog(dialog, opener);
    const target = section ? document.getElementById(`appendix-${section}`) : null;
    if (target && dialog.contains(target)) {
      const heading = target.matches('section') ? $('h3', target) : null;
      target.scrollIntoView({ block: 'start' });
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    } else {
      dialog.scrollTop = 0;
    }
    replaceHash(target ? `#appendix-${section}` : '#appendix');
  }

  // Links to the appendix anywhere on the page (sources on slides, notes, the appendix contents).
  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest('[data-appendix-link]') : null;
    if (!link) return;
    e.preventDefault();
    openAppendix(link.getAttribute('data-appendix-link'), e.detail > 0 && !link.closest('dialog') ? deck : link);
  });

  $('#overview-btn').addEventListener('click', (e) => openDialog(dialogs.overview, pointerOpener(e)));
  $('#appendix-btn').addEventListener('click', (e) => openAppendix(null, pointerOpener(e)));
  $('#setup-btn').addEventListener('click', (e) => openDialog(dialogs.setup, pointerOpener(e)));
  $('#notes-btn').addEventListener('click', (e) => openDialog(dialogs.notes, pointerOpener(e)));
  $('#overview-appendix').addEventListener('click', (e) => openAppendix(null, e.currentTarget));
  $('#overview-setup').addEventListener('click', (e) => openDialog(dialogs.setup, e.currentTarget));

  /* ---------------------------------------------------------------------------------------- */
  /* Speaker notes and timer                                                                    */
  /* ---------------------------------------------------------------------------------------- */

  function syncNotes() {
    const scene = scenes[current];
    if (!scene) return;
    const t = timing[current];
    const state = slideState[current];
    $('#notes-title').textContent = scene.headline;
    $('#slide-timing').textContent = `Scene ${current + 1} / ${scenes.length} · ${scene.label} · ${scene.seconds} s · planned ${clock(starts[current])}–${clock(starts[current] + scene.seconds)} · spoken track ${t.words} words ≈ ${t.estimate} s at 150 words a minute${state.steps > 1 ? ` · ${state.steps} steps (Next reveals each)` : ''}`;
    $('#notes-body').textContent = scene.spoken;
    $('#notes-cue').textContent = scene.cue;
    $('#notes-companion').textContent = scene.companion
      ? `Ori’s expression: ${scene.companion.expression}${scene.companion.corner === false ? ', inside the slide' : ''}. A story cue only; Ori does not sense emotions.`
      : 'No companion on this slide.';
    const related = (scene.appendix || []).filter((id) => appendixNames[id]);
    $('#notes-appendix').replaceChildren(...(related.length
      ? [h('span', { class: 'notes-label' }, 'In the appendix'), ...related.map((id) => appendixLink(id, appendixNames[id]))]
      : []));
    $('#notes-prev').disabled = current === 0;
    const building = state.steps > 1 && state.step < state.steps;
    $('#notes-next').disabled = current === scenes.length - 1 && !building;
    $('#notes-next').textContent = building ? 'Next step →' : 'Next scene →';
  }
  $('#notes-prev').addEventListener('click', () => previous());
  // Like the main Next button: it reveals the next step while a scene builds, then moves on.
  $('#notes-next').addEventListener('click', () => next());

  let elapsed = 0;
  let startedAt = null;
  const timerSeconds = () => Math.floor(elapsed + (startedAt === null ? 0 : (performance.now() - startedAt) / 1000));
  function renderTimer() {
    const seconds = timerSeconds();
    const over = seconds > TARGET_SECONDS;
    $('#timer-display').textContent = clock(seconds);
    $('#timer-target').textContent = over ? `over the ${clock(TARGET_SECONDS)} target by ${clock(seconds - TARGET_SECONDS)}` : `/ ${clock(TARGET_SECONDS)} target`;
    $('#timer-bar').classList.toggle('over-time', over);
    const running = startedAt !== null;
    $('#timer-toggle').textContent = running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start timer';
    $('#timer-toggle').setAttribute('aria-pressed', String(running));
  }
  $('#timer-toggle').addEventListener('click', () => {
    if (startedAt === null) startedAt = performance.now();
    else {
      elapsed += (performance.now() - startedAt) / 1000;
      startedAt = null;
    }
    renderTimer();
  });
  $('#timer-reset').addEventListener('click', () => {
    elapsed = 0;
    startedAt = null;
    renderTimer();
  });
  setInterval(renderTimer, 250);
  renderTimer();

  /* ---------------------------------------------------------------------------------------- */
  /* Toast                                                                                       */
  /* ---------------------------------------------------------------------------------------- */

  const notify = (() => {
    let timeout;
    return (message) => {
      clearTimeout(timeout);
      const toast = $('#toast');
      toast.textContent = message;
      toast.hidden = false;
      timeout = setTimeout(() => {
        toast.hidden = true;
      }, 4500);
    };
  })();

  /* ---------------------------------------------------------------------------------------- */
  /* Setup: links, and a local preview of a new recording for any media slot                    */
  /* ---------------------------------------------------------------------------------------- */

  const safeUrl = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    try {
      const url = new URL(text, location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };
  const setupLinks = $('#setup-links');
  if (setupLinks) {
    const items = [];
    if (safeUrl(config.productUrl)) items.push(sourceLink(safeUrl(config.productUrl), 'The live product'));
    if (safeUrl(config.githubUrl)) items.push(sourceLink(safeUrl(config.githubUrl), 'Source code on GitHub'));
    setupLinks.replaceChildren(...items.flatMap((item, i) => [i ? ' · ' : null, item]));
  }
  const localClips = new Map();
  const setupMedia = $('#setup-media');
  const fileName = (src) => String(src).split('/').pop();
  function describeSlot(key) {
    const spec = slotSpec(key);
    if (localClips.has(key)) return 'Previewing a local file in this tab only';
    if (spec.sources.length) return `Recording: ${spec.sources.map((s) => fileName(s.src)).join(', ')}`;
    if (spec.still) return `No recording yet. Screenshot: ${fileName(spec.still)}`;
    return 'No recording or screenshot yet';
  }
  function setLocalClip(key, source) {
    for (const record of slotRecords.filter((r) => r.key === key)) {
      record.local = source;
      resetSlot(record);
      if (record.slideIndex === current || record.slideIndex === current + 1 || source) prepareSlot(record, record.slideIndex === current || Boolean(source));
    }
    const row = setupMedia && $(`[data-slot-row="${key}"]`, setupMedia);
    if (row) {
      $('.slot-status', row).textContent = describeSlot(key);
      $('.remove-clip', row).hidden = !localClips.has(key);
    }
  }
  if (setupMedia) {
    for (const key of Object.keys(MEDIA)) {
      const spec = slotSpec(key);
      const input = h('input', { type: 'file', accept: 'video/*', 'data-upload': key });
      const remove = h('button', { class: 'remove-clip', type: 'button', 'data-remove': key, 'aria-label': `Remove the local preview for ${spec.title}`, hidden: true }, '×');
      setupMedia.append(h('div', { class: 'upload-row', 'data-slot-row': key },
        h('div', null, h('b', null, `${spec.title} · slide ${MEDIA[key].slide || '?'}`), h('span', { class: 'slot-status' }, describeSlot(key))),
        h('label', { class: 'upload-button' }, 'Preview a video', input),
        remove));
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
          notify('Choose a video file (H.264 MP4 or WebM).');
          input.value = '';
          return;
        }
        if (localClips.has(key)) URL.revokeObjectURL(localClips.get(key));
        const url = URL.createObjectURL(file);
        localClips.set(key, url);
        setLocalClip(key, { src: url, type: file.type || videoType(file.name) });
        notify('Previewing this clip in this tab only. Nothing was uploaded or published.');
      });
      remove.addEventListener('click', () => {
        if (localClips.has(key)) {
          URL.revokeObjectURL(localClips.get(key));
          localClips.delete(key);
        }
        input.value = '';
        setLocalClip(key, null);
      });
    }
  }
  window.addEventListener('pagehide', () => pauseVideos());

  /* ---------------------------------------------------------------------------------------- */
  /* Presentation mode: full screen (or a fallback layout); the bars hide until the pointer moves */
  /* ---------------------------------------------------------------------------------------- */

  let peekTimer = 0;
  function hideChrome() {
    clearTimeout(peekTimer);
    document.body.classList.remove('chrome-peek');
  }
  function peekChrome() {
    if (!document.body.classList.contains('in-presentation')) return;
    document.body.classList.add('chrome-peek');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => document.body.classList.remove('chrome-peek'), 2200);
  }
  document.addEventListener('pointermove', (e) => {
    if (e.movementX || e.movementY || e.pointerType !== 'mouse') peekChrome();
  }, { passive: true });
  // A press on a stage media control (play, replay, expand) leaves the toolbars hidden: no flash over the slide.
  document.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('.media-button')) return;
    peekChrome();
  }, { passive: true });

  function updatePresentLabel() {
    const on = document.body.classList.contains('in-presentation');
    $('.present-label').textContent = document.fullscreenElement ? 'Exit full screen' : on ? 'Exit presentation' : 'Present';
    $('#present-btn').setAttribute('aria-pressed', String(on));
  }
  function setPresentationLayout(on) {
    document.body.classList.toggle('in-presentation', on);
    if (!on) hideChrome();
    updatePresentLabel();
    fit();
  }
  async function present() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* already left */
      }
      return;
    }
    if (document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
        return;
      } catch {
        /* denied: fall back to the presentation layout */
      }
    }
    const on = !document.body.classList.contains('in-presentation');
    setPresentationLayout(on);
    notify(on ? 'Full screen is unavailable here, so the presentation layout is on. Press Esc to leave it.' : 'Presentation layout closed.');
  }
  $('#present-btn').addEventListener('click', (e) => { deckAfterPointer(e); present(); });
  // The browser keeps Esc in full screen: leaving it also closes an expanded clip, so no lightbox is left behind.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) collapseMedia();
    setPresentationLayout(Boolean(document.fullscreenElement));
  });

  if ('ResizeObserver' in window) new ResizeObserver(() => fit()).observe(deck);
  else window.addEventListener('resize', fit);
  const onFlowChange = () => {
    collapseMedia();
    fit();
  };
  if (flowMedia.addEventListener) flowMedia.addEventListener('change', onFlowChange);
  else if (flowMedia.addListener) flowMedia.addListener(onFlowChange);

  /* ---------------------------------------------------------------------------------------- */
  /* Buttons and keyboard                                                                       */
  /* ---------------------------------------------------------------------------------------- */

  $('#next-btn').addEventListener('click', (e) => { next(); deckAfterPointer(e); });
  $('#prev-btn').addEventListener('click', (e) => { previous(); deckAfterPointer(e); });
  $('[data-go]').addEventListener('click', (e) => { go(0); deckAfterPointer(e); });

  // Keys never act while someone types, uses media controls or works in a dialog.
  const ownsKeys = (target) => target instanceof Element && (target.isContentEditable || Boolean(target.closest('input, textarea, select, video[controls], audio, [contenteditable="true"]')));
  // A dialog opened with its shortcut (O, N, A) returns focus to where the presenter was, usually the deck,
  // not to the toolbar button: otherwise the next Space would press that button and reopen the dialog
  // instead of playing a clip or moving on.
  const keyOpener = () => {
    const el = document.activeElement;
    return el instanceof HTMLElement && el !== document.body && el.isConnected ? el : deck;
  };
  // Space reaches the clip that is playing, else the first that has not finished. Once every clip on the scene has
  // ended (each holds its last frame), Space moves on instead of rewinding the clip in front of the room.
  const currentRecording = () => {
    const here = slotRecords.filter((r) => r.slideIndex === current && (r.state === 'video' || r.state === 'local') && !r.video.hidden);
    return here.find((r) => !r.video.paused && !r.video.ended) || here.find((r) => !r.video.ended) || null;
  };

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ($('dialog[open]')) return;
    if (ownsKeys(e.target)) return;
    const key = e.key;
    if ((key === ' ' || key === 'Enter') && e.target instanceof Element && e.target.closest('button, a, summary, label')) return;
    // A bar control that kept focus would turn :focus-visible on the next clicker key and pin its bar over every
    // scene, the closing QR scene included: navigation keys hand focus back to the deck.
    if (document.body.classList.contains('in-presentation') && ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End'].includes(key) && e.target instanceof Element && e.target.closest('.topbar, .controls')) deck.focus({ preventScroll: true });
    if (key === 'Escape') {
      if (collapseMedia()) {
        e.preventDefault();
        return;
      }
      if (!document.fullscreenElement && document.body.classList.contains('in-presentation')) setPresentationLayout(false);
      return;
    }
    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (key === 'ArrowRight' || key === 'PageDown') {
      e.preventDefault();
      hideChrome();
      next();
    } else if (key === 'ArrowLeft' || key === 'PageUp') {
      e.preventDefault();
      hideChrome();
      previous();
    } else if (key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (key === 'End') {
      e.preventDefault();
      go(slides.length - 1);
    } else if (key === ' ') {
      e.preventDefault();
      const record = currentRecording();
      if (record) toggleRecord(record);
      else {
        hideChrome();
        next();
      }
    } else if (lower === 'o') {
      e.preventDefault();
      openDialog(dialogs.overview, keyOpener());
    } else if (lower === 'n') {
      e.preventDefault();
      openDialog(dialogs.notes, keyOpener());
    } else if (lower === 'a') {
      e.preventDefault();
      openAppendix(null, keyOpener());
    } else if (lower === 'f') {
      e.preventDefault();
      present();
    }
  });

  /* ---------------------------------------------------------------------------------------- */
  /* Hash: #1 to #15, a scene id or alias (#velocity), #appendix and #appendix-<section>         */
  /* ---------------------------------------------------------------------------------------- */

  // Scenes that moved into the appendix: their old hashes open the appendix panel instead.
  const RETIRED_SCENES = Object.freeze({ evidence: 'research', research: 'research', 'scene-evidence': 'research' });

  function parseHash(hash) {
    let raw = '';
    try {
      raw = decodeURIComponent(String(hash || '').replace(/^#/, '')).trim().toLowerCase();
    } catch {
      return null;
    }
    if (!raw) return null;
    const appendix = /^appendix(?:-([a-z0-9-]+))?$/.exec(raw);
    if (appendix) return { appendix: true, section: appendix[1] || null };
    if (/^\d{1,3}$/.test(raw)) {
      const n = Number(raw);
      return n >= 1 && n <= scenes.length ? { index: n - 1 } : null;
    }
    const byId = scenes.findIndex((scene) => scene.id === raw || `scene-${scene.id}` === raw || (scene.aliases || []).includes(raw));
    if (byId < 0 && Object.prototype.hasOwnProperty.call(RETIRED_SCENES, raw)) return { appendix: true, section: RETIRED_SCENES[raw] };
    return byId >= 0 ? { index: byId } : null;
  }

  function applyHash(initial) {
    const target = parseHash(location.hash);
    if (target && target.appendix) {
      if (initial) go(0, { updateHash: false });
      openAppendix(target.section, null);
      return;
    }
    if (target) {
      if (dialogs.appendix.open) dialogs.appendix.close();
      if (target.index !== current) go(target.index, { updateHash: false });
      replaceHash(`#${target.index + 1}`); // #velocity and #04 become the canonical #14 and #4
      return;
    }
    if (initial) go(0, { updateHash: false });
  }
  window.addEventListener('hashchange', () => applyHash(false));

  // For rehearsal and check tooling (1-based scene numbers).
  window.ORI_DECK = Object.freeze({
    go: (n) => go(Number(n) - 1),
    next,
    previous,
    get current() {
      return current + 1;
    },
    get step() {
      return current >= 0 ? slideState[current].step : 0;
    },
    get steps() {
      return current >= 0 ? slideState[current].steps : 0;
    },
    get scale() {
      return stageScale;
    },
  });

  document.documentElement.classList.add('js');
  applyHash(true);
})();
