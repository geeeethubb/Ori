'use strict';
// Ori pitch engine. Renders the scenes in scenes.js (the single scene data source) and runs navigation,
// the overview, speaker notes, the timer, the appendix, the three demo recordings, the corner companion,
// full screen and keyboard control. No dependencies, no build step, no network calls: it works from any
// static host (the Ori server at /pitch/, or the standalone export in deploy/pitch/).
(() => {
  const config = window.ORI_PITCH || {};
  const scenes = Array.isArray(window.ORI_SCENES) ? window.ORI_SCENES : [];
  const appendixNames = window.ORI_APPENDIX_SECTIONS || {};
  const TARGET_SECONDS = 240;
  const EXPECTED_SCENES = 15;
  const WORDS_PER_SECOND = 2.5; // about 150 spoken words a minute
  // The four expressions of the identity board, each drawn by a canonical shared/oriArt.ts mood.
  const EXPRESSION_ART = { Listening: 'attentive', Thinking: 'thinking', 'Found something': 'discovery', Ready: 'success' };
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

  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (total) => {
    const s = Math.max(0, Math.floor(total));
    return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
  };
  const formatNumber = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ',');

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
  /* Scene data: timing and a consistency check                                                */
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
  (() => {
    const problems = [];
    const ids = new Set();
    scenes.forEach((scene, i) => {
      if (!scene.id || ids.has(scene.id)) problems.push(`missing or duplicate id "${scene.id}"`);
      ids.add(scene.id);
      if (!EXPRESSION_ART[scene.companion && scene.companion.expression]) problems.push(`${scene.id}: unknown expression`);
      if (timing[i].estimate > scene.seconds) problems.push(`${scene.id}: spoken track ≈ ${timing[i].estimate}s exceeds its ${scene.seconds}s budget`);
    });
    if (scenes.length !== EXPECTED_SCENES) problems.push(`expected ${EXPECTED_SCENES} scenes, found ${scenes.length}`);
    if (totalSeconds !== TARGET_SECONDS) problems.push(`scene budgets total ${totalSeconds}s, expected ${TARGET_SECONDS}s`);
    if (problems.length) console.warn('[ori-pitch] scene data:', problems.join('; '));
  })();

  /* ---------------------------------------------------------------------------------------- */
  /* Shared slide parts                                                                         */
  /* ---------------------------------------------------------------------------------------- */

  // The part of each headline drawn in cobalt (styling only; the words come from scenes.js).
  const ACCENT = {
    research: 'only the beginning.',
    stages: 'between a spark and a habit.',
    bring: 'We will shape what comes next.',
    create: 'somewhere to begin.',
    'use-revise': 'Make it yours.',
    reopen: 'still here.',
    why: 'built around you.',
    foundation: 'A shared foundation.',
    gtm: 'a community I already help lead.',
    roadmap: 'Earn the right to expand.',
    business: 'Choose to keep it.',
    velocity: 'Sharper behavioral tests.',
    ask: 'somewhere to grow.',
  };

  function headline(scene, tag = 'h2') {
    const text = scene.headline;
    const part = ACCENT[scene.id];
    const at = part ? text.lastIndexOf(part) : -1;
    if (at < 0) return h(tag, { class: 'headline' }, text);
    const before = text.slice(0, at);
    const newSentence = /[.!?]\s$/.test(before);
    return h(tag, { class: 'headline' }, before, newSentence ? h('br') : null, h('span', { class: 'accent' }, part));
  }

  const sectionLabel = (scene, cls = 'eyebrow') => h('p', { class: `${cls} section-label` },
    h('span', { class: 'section-num' }, `Section ${scene.section.number}`),
    h('span', { class: 'section-sep', 'aria-hidden': 'true' }, ' · '),
    sr(': '),
    h('span', { class: 'section-name' }, scene.section.name));

  // Extra lines go between the section label and the headline (the discovery question); headThen puts
  // them after the headline (the roadmap's subheading).
  const headOf = (scene, ...extra) => h('header', { class: 'scene-head' }, sectionLabel(scene), ...extra, headline(scene));
  const headThen = (scene, ...after) => h('header', { class: 'scene-head' }, sectionLabel(scene), headline(scene), ...after);

  const slideBottom = (scene) => h('footer', { class: 'slide-bottom' },
    h('span', { class: 'slide-bottom-label' }, (scene.footer && scene.footer[0]) || ''),
    h('span', { class: 'slide-bottom-note' }, (scene.footer && scene.footer[1]) || ''));

  const appendixLink = (id, text, label) => h('a', { class: 'ref-link', href: `#appendix-${id}`, 'data-appendix-link': id, 'aria-label': label || null }, text);

  const appIcon = (app, cls, size) => h('img', { class: cls, src: `assets/ori/app-${app}.svg`, alt: '', width: size, height: size, decoding: 'async' });

  const arrowJoin = (items, render) => items.flatMap((item, i) => [
    i ? h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→') : null,
    i ? sr(', then ') : null,
    render(item, i),
  ]);

  function sparkCard(spark) {
    const label = h('span', { class: 'spark-label' }, spark.label);
    if (spark.kind === 'reel') {
      return h('div', { class: 'spark spark-reel' }, h('span', { class: 'reel-frame', 'aria-hidden': 'true' }, h('span', { class: 'reel-play' })), label);
    }
    const text = spark.kind === 'sentence' ? `“${spark.text}”` : spark.text;
    return h('div', { class: `spark spark-${spark.kind}` }, h('p', { class: 'spark-text' }, text), label);
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Scene compositions                                                                         */
  /* ---------------------------------------------------------------------------------------- */

  const R = {};

  R.promise = (scene) => {
    const o = scene.onScreen;
    const title = scene.headline === 'Your phone, your story.'
      ? h('h1', { class: 'headline hero-title' }, 'Your phone,', h('br'), ' your ',
        h('span', { class: 'accent-word' }, 'story',
          svg('svg', { viewBox: '0 0 340 25', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' }, svg('path', { d: 'M4 15Q170 0 334 12' }))), '.')
      : h('h1', { class: 'headline hero-title' }, scene.headline);
    const apps = o.collection.map((a) => h('div', { class: `phone-app app-${a.app}` }, appIcon(a.app, 'phone-icon', 64), h('b', null, a.name), h('span', null, a.note)));
    const spark = h('div', { class: 'phone-app is-spark' }, h('span', { class: 'spark-slot' }, h('span', { class: 'spark-dot' })), h('b', null, 'Spark'), h('span', null, o.spark));
    const description = `Illustration: Ori beside a personal collection on a phone: ${o.collection.map((a) => `${a.name} for ${a.note}`).join(', ')}, and ${o.spark.replace(/…$/, '')}.`;
    return {
      head: null,
      bodyClass: 'hero-body',
      body: [
        h('div', { class: 'hero-copy' },
          sectionLabel(scene),
          title,
          h('p', { class: 'lead' }, (o.lead.match(/[^.!?]+[.!?]+/g) || [o.lead]).flatMap((sentence, i) => [i ? ' ' : null, h('span', { class: 'lead-line' }, sentence.trim())])),
          h('div', { class: 'hero-meta' }, h('span', { class: 'pill' }, o.support), h('span', { class: 'byline' }, presenter))),
        h('div', { class: 'hero-world', role: 'img', 'aria-label': description },
          h('div', { class: 'world-ring ring-one' }), h('div', { class: 'world-ring ring-two' }),
          h('div', { class: 'phone-glimpse' }, h('div', { class: 'phone-notch' }), h('div', { class: 'phone-grid' }, apps, spark)),
          h('div', { class: 'world-chip chip-one' }, 'a new interest'),
          h('div', { class: 'world-chip chip-two' }, 'a little more you'),
          h('div', { class: 'world-caption' }, h('span', null, o.caption), h('span', { class: 'world-star' }, '✦'))),
      ],
    };
  };

  R.research = (scene) => ({
    head: headOf(scene),
    body: [h('div', { class: 'research-cards' }, scene.onScreen.cards.map((card, i) => h('article', { class: `research-card card-${i + 1}`, 'aria-label': `${card.ref}, ${card.source.label}` },
      h('p', { class: 'card-tag' }, h('span', { class: 'ref-chip' }, card.ref), h('span', null, card.tag)),
      h('p', { class: 'card-figure' }, card.figure, card.unit ? h('span', { class: 'card-unit' }, ` ${card.unit}`) : null),
      h('p', { class: 'card-text' }, card.text),
      h('p', { class: 'card-source' },
        h('a', { href: card.source.href, target: '_blank', rel: 'noopener noreferrer' }, card.source.label, sr(' (opens a new tab)')),
        ' · ', card.detail, ' ',
        appendixLink('sources', `[${card.ref}]`, `${card.ref}: full source and limits in the appendix`)))))],
  });

  R.discovery = (scene) => {
    const o = scene.onScreen;
    const dots = Array.from({ length: o.total }, (_, i) => h('span', { class: i < o.yes ? 'dot is-yes' : 'dot' }));
    return {
      head: headOf(scene, h('p', { class: 'discovery-question' }, o.question)),
      body: [h('div', { class: 'discovery-layout' },
        h('div', { class: 'discovery-count' },
          h('div', { class: 'dot-grid', role: 'img', 'aria-label': `${o.yes} of ${o.total} students said yes` }, dots),
          h('p', { class: 'dot-legend', 'aria-hidden': 'true' },
            h('span', { class: 'dot is-yes' }), `${o.yes} said yes`,
            h('span', { class: 'dot' }), `${o.total - o.yes} others`,
            h('span', { class: 'legend-note' }, 'one dot per student asked')),
          h('p', { class: 'footnote' }, o.footnote, ' ', appendixLink('discovery', 'More', 'More about this discovery in the appendix'))),
        h('div', { class: 'discovery-turn' },
          h('p', { class: 'turn-line' }, o.turn),
          h('div', { class: 'insight' }, h('p', { class: 'insight-label' }, o.insightLabel), h('p', { class: 'insight-text' }, o.insight)),
          h('div', { class: 'spark-row' }, o.sparks.map(sparkCard)),
          h('p', { class: 'illustrative-label' }, o.sparksLabel)))],
    };
  };

  R.stages = (scene) => {
    const o = scene.onScreen;
    const list = h('ol', { class: 'stage-list' }, o.stages.map((stage, i) => h('li', { class: 'stage is-revealed', style: { '--i': String(i) } },
      h('span', { class: 'stage-num', 'aria-hidden': 'true' }, pad2(i + 1)),
      h('h3', { class: 'stage-name' }, sr(`Stage ${i + 1}: `), stage.name),
      h('p', { class: 'stage-task' }, sr(`${o.taskLabel}: `), stage.task),
      h('p', { class: 'stage-role' }, sr(`${o.roleLabel}: `), stage.role))));
    const showAll = h('button', { class: 'quiet-button build-all', type: 'button' }, 'Show all five');
    showAll.addEventListener('click', () => setStageStep(o.stages.length, true));
    return {
      head: headOf(scene),
      body: [h('div', { class: 'stages' },
        h('p', { class: 'stage-legend', 'aria-hidden': 'true' }, h('span', { class: 'key key-task' }, o.taskLabel), h('span', { class: 'key key-role' }, o.roleLabel)),
        list,
        h('div', { class: 'stage-loop' }, h('span', { class: 'loop-line', 'aria-hidden': 'true' }), h('p', { class: 'loop-label' }, h('span', { class: 'loop-icon', 'aria-hidden': 'true' }, '↺'), o.loop)),
        h('p', { class: 'stage-bottom' }, h('span', null, o.bottomLine)),
        h('div', { class: 'build-controls' }, h('span', { class: 'build-status' }), showAll))],
    };
  };

  R.bring = (scene) => {
    const o = scene.onScreen;
    const label = `${o.illustrative}: ${o.scraps.map((s) => s.label.toLowerCase()).join(', ')} become one direction, ${o.direction.title.toLowerCase()}, after one clarifying question.`;
    return {
      head: headOf(scene),
      body: [h('div', { class: 'bring-layout' },
        h('div', { class: 'moodboard', role: 'img', 'aria-label': label },
          h('span', { class: 'illustrative-tag' }, o.illustrative),
          h('div', { class: 'scrap-pile' }, o.scraps.map(sparkCard)),
          h('div', { class: 'converge' }, h('span')),
          h('div', { class: 'shape-col' },
            h('p', { class: 'bubble bubble-ori' }, h('span', { class: 'who' }, 'Ori'), o.clarify.ask),
            h('p', { class: 'bubble bubble-you' }, h('span', { class: 'who' }, 'You'), o.clarify.answer),
            h('div', { class: 'direction-card' }, appIcon('light', 'direction-icon', 52), h('span', { class: 'direction-label' }, o.direction.label), h('b', null, o.direction.title)))),
        h('div', { class: 'bring-copy' },
          h('p', { class: 'bring-intro' }, o.intro),
          h('ul', { class: 'bring-lines' }, o.lines.map((line) => h('li', null, line))),
          h('p', { class: 'area-flow' }, arrowJoin(o.areas, (area) => h('span', { class: 'area' }, area)))))],
    };
  };

  // Demo slots (scenes 6–8): a portrait phone recording beside the story. The label above the recording
  // says what it is; the concept image only appears when no recording can play, labelled as a concept.
  R.demo = (scene) => {
    const o = scene.onScreen;
    const statusId = `media-status-${o.clip}`;
    const frameId = `media-frame-${o.clip}`;
    const video = h('video', {
      controls: true, playsinline: true, muted: true, preload: 'metadata', hidden: true,
      'aria-label': `Demo recording: ${o.caption.split(/\s*→\s*/).join(', then ')}`, 'aria-describedby': statusId,
    });
    video.muted = true;
    video.setAttribute('webkit-playsinline', '');
    return {
      head: null,
      bodyClass: 'demo-body',
      body: [h('div', { class: 'demo-grid', 'data-clip': o.clip, 'data-state': 'none' },
        h('div', { class: 'demo-head' }, sectionLabel(scene), h('span', { class: 'demo-index' }, o.index)),
        h('p', { class: 'media-status', id: statusId }, h('span', { class: 'status-dot', 'aria-hidden': 'true' }), h('span', { class: 'media-label' })),
        h('div', { class: 'media-frame', id: frameId },
          h('p', { class: 'media-frame-label', 'aria-hidden': 'true' }),
          h('div', { class: 'media-viewport' },
            h('img', { class: 'media-fallback', src: o.image, alt: o.alt, decoding: 'async', loading: 'lazy' }),
            video)),
        h('div', { class: 'demo-copy' },
          headline(scene),
          o.quote ? h('p', { class: 'demo-quote' }, o.quote) : null,
          h('ul', { class: 'demo-lines' }, o.lines.map((line) => h('li', null, line)))),
        h('div', { class: 'demo-foot' },
          h('p', { class: 'demo-caption' }, arrowJoin(o.caption.split(/\s*→\s*/), (part) => h('span', { class: 'caption-step' }, part))),
          h('button', { class: 'quiet-button media-expand', type: 'button', 'aria-expanded': 'false', 'aria-controls': frameId }, 'Expand ↗')))],
    };
  };

  R.why = (scene) => {
    const o = scene.onScreen;
    return {
      head: headOf(scene),
      body: [
        h('p', { class: 'flow-line' }, arrowJoin(o.flow, (step, i) => h('span', { class: 'flow-step' }, i === o.flow.length - 1 ? `${step}.` : step))),
        h('div', { class: 'benefits' }, o.benefits.map((b, i) => h('article', { class: 'benefit' },
          h('span', { class: 'benefit-num', 'aria-hidden': 'true' }, pad2(i + 1)),
          h('h3', null, b.title),
          h('p', null, b.text)))),
      ],
    };
  };

  R.foundation = (scene) => {
    const o = scene.onScreen;
    const minis = {
      light: () => h('div', { class: 'mini mini-gallery', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(() => h('span'))),
      riff: () => h('div', { class: 'mini mini-session', 'aria-hidden': 'true' }, h('span', { class: 'session-ring' }, h('b', null, '12:00')), h('span', { class: 'session-bars' }, [1, 2, 3, 4, 5, 6].map(() => h('i')))),
      people: () => h('div', { class: 'mini mini-queue', 'aria-hidden': 'true' }, [1, 2, 3].map(() => h('span', null, h('i'), h('b')))),
    };
    return {
      head: headOf(scene),
      body: [
        h('p', { class: 'lead foundation-line' }, o.line),
        h('div', { class: 'foundation-stack' },
          h('div', { class: 'foundation-apps' }, o.apps.map((a) => h('article', { class: `foundation-app app-${a.app}` },
            h('div', { class: 'foundation-app-top' }, appIcon(a.app, 'foundation-icon', 44), h('h3', null, a.name)),
            minis[a.app] ? minis[a.app]() : null,
            h('p', null, a.interaction)))),
          h('div', { class: 'foundation-base' },
            h('span', { class: 'base-label' }, o.foundationLabel),
            h('p', null, o.capabilities.flatMap((c, i) => [i ? h('span', { class: 'bullet', 'aria-hidden': 'true' }, ' • ') : null, i ? sr(', ') : null, c])))),
      ],
    };
  };

  // Founder-led GTM: the founder at the centre of four relationships, how access becomes learning, and the
  // proposed pilot targets. Personal access only: no logos, member counts or endorsements.
  R.gtm = (scene) => {
    const o = scene.onScreen;
    const hub = h('div', { class: 'founder-hub' },
      svg('svg', { class: 'hub-spokes', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
        // Spokes to the four relationships; the last (friend introductions, still to be requested) is dashed.
        [[0, 24], [100, 24], [0, 76], [100, 76]].map(([x, y], i) => svg('line', { class: i === 3 ? 'is-intro' : null, x1: 50, y1: 50, x2: x, y2: y, 'vector-effect': 'non-scaling-stroke' }))),
      h('p', { class: 'founder-node' }, h('b', null, o.founder.name), h('span', null, o.founder.role)));
    const cards = o.relations.map((r, i) => h('article', { class: `relation relation-${i + 1}` },
      h('h3', { class: 'relation-role' }, r.role),
      h('p', { class: 'relation-enables' }, r.enables),
      h('p', { class: 'relation-count' }, h('b', null, String(r.invitations)), h('span', null, ' invitations'))));
    return {
      head: headOf(scene),
      body: [h('div', { class: 'gtm-grid' },
        h('section', { class: 'relations', 'aria-label': o.relationsLabel },
          h('p', { class: 'strip-label', 'aria-hidden': 'true' }, o.relationsLabel),
          h('div', { class: 'relations-map' }, hub, cards),
          h('p', { class: 'relations-total' }, h('b', null, String(o.total.invitations)), ` ${o.total.label}`)),
        h('section', { class: 'gtm-chain', 'aria-label': o.chainLabel },
          h('p', { class: 'strip-label', 'aria-hidden': 'true' }, o.chainLabel),
          h('ol', { class: 'chain' }, o.chain.map((c) => h('li', null, h('b', null, c.step), sr(': '), h('span', null, c.note))))),
        h('section', { class: 'pilot', 'aria-label': o.pilotLabel },
          h('p', { class: 'plan-label' }, o.pilotLabel),
          h('ol', { class: 'pilot-steps' }, o.pilot.map((p, i) => h('li', null,
            i ? h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→') : null,
            h('b', null, String(p.n)), h('span', { class: 'pilot-label' }, ` ${p.label}`))))))],
    };
  };

  // Growth roadmap: a dashed target trajectory on a true linear scale, a milestone strip that keeps the
  // early targets legible, the channel branches with their gate, and the YC ambition kept apart.
  R.roadmap = (scene) => {
    const o = scene.onScreen;
    const c = o.chart;
    const n = c.points.length;
    const xPct = (i) => ((i + 0.5) * 100) / n; // centre of the i-th of n equal columns: aligns with the strip
    const yPct = (v) => Math.max(0, Math.min(100, (v / c.max) * 100));
    const tickText = (v) => (v === 0 ? '0' : v >= 1000 ? `${formatNumber(v / 1000)}K` : formatNumber(v));
    const description = `${c.flag}. ${c.title}, on a linear scale from 0 to ${formatNumber(c.max)}: ${c.points.map((p) => `${p.month}, ${formatNumber(p.value)}`).join('; ')}.`;
    const labelled = new Set(c.labelled || []);
    const tip = h('div', { class: 'chart-tip', hidden: true }, h('b', { class: 'tip-value' }), h('span', { class: 'tip-month' }), h('span', { class: 'tip-gate' }));
    const crosshair = h('span', { class: 'chart-crosshair', hidden: true });
    const plot = h('div', { class: 'chart-plot', 'aria-hidden': 'true' },
      c.ticks.map((t) => h('span', { class: `chart-grid${t === 0 ? ' is-base' : ''}`, style: { '--y': `${yPct(t)}%` } }, h('span', { class: 'chart-tick' }, tickText(t)))),
      svg('svg', { class: 'chart-line', viewBox: '0 0 100 100', preserveAspectRatio: 'none', focusable: 'false' },
        svg('polyline', { points: c.points.map((p, i) => `${xPct(i)},${100 - yPct(p.value)}`).join(' '), 'vector-effect': 'non-scaling-stroke' })),
      crosshair,
      c.points.map((p, i) => h('span', { class: 'chart-point', 'data-i': String(i), style: { '--x': `${xPct(i)}%`, '--y': `${yPct(p.value)}%` } })),
      c.points.map((p, i) => (labelled.has(i) ? h('span', { class: `chart-label${i === n - 1 ? ' is-end' : ''}`, style: { '--x': `${xPct(i)}%`, '--y': `${yPct(p.value)}%` } }, formatNumber(p.value)) : null)),
      tip);
    const strip = h('ol', { class: 'milestones' }, c.points.map((p, i) => h('li', { class: 'milestone', 'data-i': String(i) },
      h('span', { class: 'ms-month' }, p.short), sr(': '),
      h('b', { class: 'ms-value' }, formatNumber(p.value)), sr(' registered users. '),
      h('span', { class: 'ms-gate' }, p.gate))));

    function highlight(i) {
      const show = i !== null && i >= 0 && i < n;
      tip.hidden = !show;
      crosshair.hidden = !show;
      $$('.chart-point', plot).forEach((el, k) => el.classList.toggle('is-hot', k === i));
      $$('.milestone', strip).forEach((el, k) => el.classList.toggle('is-hot', k === i));
      if (!show) return;
      const p = c.points[i];
      $('.tip-value', tip).textContent = formatNumber(p.value);
      $('.tip-month', tip).textContent = `${p.month} · stretch target`;
      $('.tip-gate', tip).textContent = p.gate;
      tip.style.setProperty('--x', `${xPct(i)}%`);
      tip.style.setProperty('--y', `${yPct(p.value)}%`);
      tip.classList.toggle('is-left', xPct(i) > 60);
      tip.classList.toggle('is-below', yPct(p.value) > 60);
      crosshair.style.setProperty('--x', `${xPct(i)}%`);
    }
    plot.addEventListener('pointermove', (e) => {
      const r = plot.getBoundingClientRect();
      if (!r.width) return;
      const at = ((e.clientX - r.left) / r.width) * n - 0.5;
      highlight(Math.max(0, Math.min(n - 1, Math.round(at))));
    });
    plot.addEventListener('pointerleave', () => highlight(null));
    for (const item of $$('.milestone', strip)) {
      item.addEventListener('pointerenter', () => highlight(Number(item.dataset.i)));
      item.addEventListener('pointerleave', () => highlight(null));
    }

    return {
      head: headThen(scene, h('p', { class: 'lead roadmap-sub' }, o.sub)),
      body: [h('div', { class: 'roadmap-grid' },
        h('figure', { class: 'growth-chart' },
          h('figcaption', { class: 'chart-head' }, h('span', { class: 'chart-title' }, c.title), h('span', { class: 'target-flag' }, c.flag)),
          h('p', { class: 'sr-only' }, description),
          h('div', { class: 'chart-body' }, plot, strip)),
        h('div', { class: 'roadmap-side' },
          h('section', { class: 'channels', 'aria-label': o.channelsLabel },
            h('p', { class: 'strip-label', 'aria-hidden': 'true' }, o.channelsLabel),
            h('div', { class: 'channel-tree' },
              h('div', { class: 'channel-node is-root' }, h('b', null, o.root.title), sr(': '), h('span', null, o.root.text)),
              h('p', { class: 'channel-gate' }, h('span', null, o.gate)),
              h('div', { class: 'channel-branches' }, o.branches.map((b) => h('div', { class: 'channel-node' }, h('b', null, b.title), sr(': '), h('span', null, b.text))))),
            h('p', { class: 'channels-note' }, o.channelsNote)),
          h('aside', { class: 'yc-ambition', 'aria-label': 'Application ambition' },
            h('img', { class: 'yc-logo', src: o.yc.logo, alt: 'Y Combinator logo', width: '40', height: '40', decoding: 'async' }),
            h('p', null, h('b', null, o.yc.text), ' ', h('span', null, o.yc.note)))))],
    };
  };

  R.business = (scene) => {
    const o = scene.onScreen;
    return {
      head: headOf(scene),
      body: [h('div', { class: 'business-grid' },
        h('div', { class: 'offer' },
          h('div', { class: 'offer-head' }, h('p', { class: 'plan-label' }, o.offerLabel), h('p', { class: 'offer-note' }, o.offerNote)),
          h('ol', { class: 'price-strip' }, o.ladder.map((step, i) => h('li', { class: 'price-step' },
            i ? h('span', { class: 'price-arrow', 'aria-hidden': 'true' }, '→') : null,
            h('span', { class: 'price-label' }, step.label), sr(': '),
            h('p', { class: 'price' }, h('b', null, step.figure), step.unit ? h('span', { class: 'price-unit' }, step.unit) : null, ' ', h('span', { class: 'price-rest' }, step.rest)))))),
        h('div', { class: 'reasons' },
          h('p', { class: 'strip-label' }, o.reasonsLabel),
          h('ol', { class: 'reason-list' }, o.reasons.map((reason, i) => h('li', { class: 'reason' }, h('span', { class: 'reason-num', 'aria-hidden': 'true' }, pad2(i + 1)), h('p', null, reason))))),
        h('p', { class: 'measure-strip' }, h('span', { class: 'measure-label' }, o.measureLabel), sr(': '), arrowJoin(o.measure, (m) => h('span', { class: 'measure-step' }, m))))],
    };
  };

  R.velocity = (scene) => {
    const o = scene.onScreen;
    return {
      head: h('header', { class: 'scene-head velocity-head' },
        h('p', { class: 'velocity-kicker' }, h('span', { class: 'section-chip' }, `Section ${scene.section.number}`), sr(': '), h('span', { class: 'velocity-title' }, o.title)),
        headline(scene)),
      body: [
        h('p', { class: 'velocity-inputs' }, o.inputs),
        h('table', { class: 'velocity-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, o.headers[0]), h('th', { scope: 'col' }, o.headers[1]))),
          h('tbody', null, o.rows.map(([assumption, decision]) => h('tr', null, h('td', null, assumption), h('td', null, h('strong', null, decision)))))),
        h('p', { class: 'velocity-closing' }, h('span', null, o.closing), ' ', appendixLink('velocity', 'How we used it, expanded', 'How we used Velocity AI, expanded, in the appendix')),
      ],
    };
  };

  R.ask = (scene) => {
    const o = scene.onScreen;
    const column = (title, items) => h('section', { class: 'ask-col' }, h('h3', null, title), h('ul', null, items.map((item) => h('li', null, item))));
    return {
      head: null,
      bodyClass: 'ask-body',
      body: [h('div', { class: 'ask-content' },
        sectionLabel(scene),
        headline(scene),
        h('div', { class: 'ask-box' }, h('p', { class: 'ask-label' }, o.askLabel), h('p', { class: 'ask-line' }, o.ask)),
        h('div', { class: 'ask-columns' }, column(o.fundsLabel, o.funds), column(o.evidenceLabel, o.evidence)),
        h('p', { class: 'ask-not' }, o.notFunded),
        h('div', { class: 'ask-close' },
          h('div', { class: 'ask-callback', 'aria-hidden': 'true' },
            h('span', { class: 'callback-spark' }, h('span', { class: 'spark-dot' }), 'a spark'),
            h('span', { class: 'flow-arrow' }, '→'),
            appIcon('light', 'callback-icon', 40),
            h('span', { class: 'callback-name' }, 'Light, still growing')),
          h('p', { class: 'ask-signature' }, o.signature),
          h('div', { class: 'closing-links', id: 'closing-links' })))],
    };
  };

  /* ---------------------------------------------------------------------------------------- */
  /* Build the deck                                                                             */
  /* ---------------------------------------------------------------------------------------- */

  const deck = $('#deck');
  deck.setAttribute('aria-label', `Ori pitch, ${scenes.length} scenes`);
  const slides = scenes.map((scene, i) => {
    const render = R[scene.layout] || ((sc) => ({ head: headOf(sc), body: [] }));
    const { head, body, bodyClass } = render(scene, i);
    const large = scene.companion && scene.companion.size === 'large';
    const slide = h('section', {
      class: `slide layout-${scene.layout} scene-${scene.id}${large ? ' companion-large' : ''}`,
      id: `scene-${scene.id}`,
      role: 'group',
      'aria-roledescription': 'slide',
      'aria-label': `Scene ${i + 1} of ${scenes.length}: ${scene.headline}`,
      'data-index': String(i),
      hidden: true,
    }, h('div', { class: 'scene' }, head, h('div', { class: `scene-body${bodyClass ? ` ${bodyClass}` : ''}` }, body), slideBottom(scene)));
    deck.append(slide);
    return slide;
  });
  if (!slides.length) deck.append(h('p', { class: 'noscript' }, 'The scene data (scenes.js) did not load.'));

  // One companion for the whole deck, in the same upper corner of every scene. It moves into the active
  // scene (so it scrolls with that scene on small screens and never covers content) and crossfades
  // between the four expressions; under reduced motion the change is instant.
  const companion = h('div', { class: 'companion', 'aria-hidden': 'true', 'data-size': 'small' },
    h('span', { class: 'companion-disc' }),
    Object.entries(EXPRESSION_ART).map(([expression, art]) => h('img', { class: 'companion-art', src: `assets/ori/companion-${art}.svg`, alt: '', width: '100', height: '100', 'data-expression': expression, decoding: 'async' })));

  function placeCompanion(scene, slide) {
    const c = scene.companion || {};
    const expression = EXPRESSION_ART[c.expression] ? c.expression : 'Listening';
    if (companion.parentNode !== slide) slide.append(companion);
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
    dotsHolder.append(h('button', { type: 'button', class: 'dot-button', 'aria-label': `Scene ${i + 1}: ${scene.headline}`, title: `${i + 1}. ${scene.headline}`, onclick: () => go(i) }));
    const tile = h('button', {
      type: 'button',
      class: `overview-tile${scene.section.number === 8 ? ' is-velocity' : ''}`,
      'aria-label': `Scene ${i + 1}: ${scene.headline}. Section ${scene.section.number}, ${scene.section.name}. ${scene.seconds} seconds.`,
    },
      h('span', { class: 'tile-meta' }, h('span', null, `Scene ${pad2(i + 1)}`), h('span', null, `${scene.seconds}s · ${clock(starts[i])}`)),
      h('span', { class: 'tile-section' }, `Section ${scene.section.number} · ${scene.section.name}`),
      h('b', { class: 'tile-title' }, scene.headline));
    tile.addEventListener('click', () => {
      dialogs.overview.close();
      go(i);
    });
    overviewGrid.append(tile);
  });

  /* ---------------------------------------------------------------------------------------- */
  /* Navigation                                                                                 */
  /* ---------------------------------------------------------------------------------------- */

  let current = -1;
  const stagesIndex = scenes.findIndex((scene) => scene.layout === 'stages');
  const stageCount = stagesIndex >= 0 ? scenes[stagesIndex].onScreen.stages.length : 0;
  let stageStep = stageCount;

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

  function collapseMedia() {
    let collapsed = false;
    for (const frame of $$('.media-frame.expanded')) {
      frame.classList.remove('expanded');
      const button = $(`[aria-controls="${frame.id}"]`);
      if (button) {
        button.textContent = 'Expand ↗';
        button.setAttribute('aria-expanded', 'false');
      }
      collapsed = true;
    }
    document.body.classList.toggle('media-expanded', false);
    return collapsed;
  }

  // The five stages build one at a time when the presenter arrives with Next; any other arrival
  // (a hash, the overview, a dot, Previous, a refresh) shows the complete static version.
  function setStageStep(step, fromButton = false) {
    if (stagesIndex < 0) return;
    const wrap = $('.stages', slides[stagesIndex]);
    stageStep = Math.max(1, Math.min(stageCount, step));
    const building = stageStep < stageCount;
    wrap.classList.toggle('is-building', building);
    wrap.dataset.step = String(stageStep);
    $$('.stage', wrap).forEach((el, i) => el.classList.toggle('is-revealed', i < stageStep));
    $('.build-status', wrap).textContent = building ? `Stage ${stageStep} of ${stageCount} · Next reveals the next stage` : '';
    const names = scenes[stagesIndex].onScreen.stages;
    if (current === stagesIndex) announce(building ? `Stage ${stageStep} of ${stageCount}: ${names[stageStep - 1].name}` : `All ${stageCount} stages shown.`);
    if (fromButton && !building) $('.stage-list', wrap).setAttribute('tabindex', '-1');
    if (fromButton && !building) $('.stage-list', wrap).focus({ preventScroll: true });
    updateChrome(false);
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
    if (current === stagesIndex) {
      stageStep = via === 'next' && previous === current - 1 ? 1 : stageCount;
      setStageStep(stageStep);
    }
    placeCompanion(scenes[current], slide);
    warmClips(current);
    updateChrome(true);
    if (options.updateHash !== false) replaceHash(`#${current + 1}`);
  }

  function next() {
    if (current === stagesIndex && stageStep < stageCount) {
      setStageStep(stageStep + 1);
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
    const building = current === stagesIndex && stageStep < stageCount;
    $('#slide-count').replaceChildren(sr('Scene '), `${pad2(current + 1)} / ${scenes.length}`);
    $('#slide-name').textContent = `Section ${scene.section.number} · ${scene.section.name}`;
    $$('#progress-dots button').forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
    $$('#overview-grid button').forEach((b, i) => b.setAttribute('aria-current', String(i === current)));
    $('#deck-progress-fill').style.width = `${((current + 1) / scenes.length) * 100}%`;
    $('#prev-btn').disabled = current === 0;
    $('#next-btn').disabled = current === scenes.length - 1 && !building;
    $('#next-btn').setAttribute('aria-label', building ? 'Reveal the next stage' : 'Next scene');
    document.title = `Ori — ${scene.headline}`;
    if (announceScene) announce(`Scene ${current + 1} of ${scenes.length}. Section ${scene.section.number}, ${scene.section.name}: ${scene.headline}`);
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
    openAppendix(link.getAttribute('data-appendix-link'), link);
  });

  $('#overview-btn').addEventListener('click', (e) => openDialog(dialogs.overview, e.currentTarget));
  $('#appendix-btn').addEventListener('click', (e) => openAppendix(null, e.currentTarget));
  $('#setup-btn').addEventListener('click', (e) => openDialog(dialogs.setup, e.currentTarget));
  $('#notes-btn').addEventListener('click', (e) => openDialog(dialogs.notes, e.currentTarget));
  $('#overview-appendix').addEventListener('click', (e) => openAppendix(null, e.currentTarget));
  $('#overview-setup').addEventListener('click', (e) => openDialog(dialogs.setup, e.currentTarget));

  /* ---------------------------------------------------------------------------------------- */
  /* Speaker notes and timer                                                                    */
  /* ---------------------------------------------------------------------------------------- */

  function syncNotes() {
    const scene = scenes[current];
    if (!scene) return;
    const t = timing[current];
    $('#notes-title').textContent = scene.headline;
    $('#slide-timing').textContent = `Scene ${current + 1} / ${scenes.length} · Section ${scene.section.number} · ${scene.section.name} · ${scene.seconds} s · planned ${clock(starts[current])}–${clock(starts[current] + scene.seconds)} · spoken track ${t.words} words ≈ ${t.estimate} s at 150 words a minute`;
    $('#notes-body').textContent = scene.spoken;
    $('#notes-cue').textContent = scene.cue;
    $('#notes-companion').textContent = `Ori’s expression: ${scene.companion.expression}. A story cue only; Ori does not sense emotions.`;
    const related = (scene.appendix || []).filter((id) => appendixNames[id]);
    $('#notes-appendix').replaceChildren(...(related.length
      ? [h('span', { class: 'notes-label' }, 'In the appendix'), ...related.map((id) => appendixLink(id, appendixNames[id]))]
      : []));
    $('#notes-prev').disabled = current === 0;
    $('#notes-next').disabled = current === scenes.length - 1;
  }
  $('#notes-prev').addEventListener('click', () => previous());
  $('#notes-next').addEventListener('click', () => {
    if (current < slides.length - 1) go(current + 1, { via: 'next' });
  });

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
  /* Links (config.js, optionally overridden in this browser through Setup)                     */
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
  // The hosted Ori product is only linked where config.js names it (the Ori server's own /pitch/). The
  // standalone static export sets appUrl to '' and then nothing on the page points to a product:
  // no "Open Ori" link, and Setup offers no product address either.
  const productLinked = Boolean(safeUrl(config.appUrl));
  const LINKS_KEY = 'ori-pitch-links-v1';
  const readSaved = () => {
    try {
      const value = JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  };
  const saved = readSaved();
  const links = {
    appUrl: productLinked ? safeUrl(typeof saved.appUrl === 'string' ? saved.appUrl : config.appUrl) : '',
    githubUrl: safeUrl(typeof saved.githubUrl === 'string' ? saved.githubUrl : config.githubUrl),
  };
  if (!productLinked) {
    const row = $('#app-url-row');
    if (row) row.remove();
  }
  function renderLinks() {
    const holder = $('#closing-links');
    if (holder) {
      holder.replaceChildren();
      // Unavailable destinations are not shown at all.
      for (const [key, label] of [['appUrl', 'Open Ori'], ['githubUrl', 'View the code on GitHub']]) {
        if (!links[key]) continue;
        holder.append(h('a', { href: links[key], target: '_blank', rel: 'noopener noreferrer' }, label, h('span', { 'aria-hidden': 'true' }, ' ↗'), sr(' (opens a new tab)')));
      }
    }
    if ($('#app-url')) $('#app-url').value = links.appUrl;
    $('#github-url').value = links.githubUrl;
  }
  renderLinks();
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const appRaw = $('#app-url') ? $('#app-url').value : '';
    const githubRaw = $('#github-url').value;
    const app = safeUrl(appRaw);
    const github = safeUrl(githubRaw);
    if ((appRaw.trim() && !app) || (githubRaw.trim() && !github)) {
      $('#save-status').textContent = 'Use a complete http:// or https:// address.';
      return;
    }
    if (productLinked) links.appUrl = app;
    links.githubUrl = github;
    let persistent = true;
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(links));
    } catch {
      persistent = false;
    }
    renderLinks();
    $('#save-status').textContent = persistent ? 'Saved in this browser only.' : 'Set for this tab; browser storage is unavailable.';
  });

  /* ---------------------------------------------------------------------------------------- */
  /* Demo recordings                                                                            */
  /* ---------------------------------------------------------------------------------------- */

  // [what it is, the qualifier]; the label reads "<what> · <qualifier>".
  const MEDIA_LABEL = {
    none: ['Concept reference', 'Recording not added. A generated design, not the product.'],
    published: ['Recorded product demo', 'Sample mode: scripted responses, not live AI'],
    local: ['Local preview', 'This tab only. Not published.'],
    failed: ['Recording could not load', 'Concept reference: a generated design, not the product.'],
  };
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
  // A clip in config.js is one path or a list of paths in order of preference (MP4 for Safari and
  // iPhones first, then WebM); each becomes a <source>.
  const configuredSources = (key) => {
    const value = config.clips && config.clips[key];
    return (Array.isArray(value) ? value : [value]).map(playableUrl).filter(Boolean).map((src) => ({ src, type: videoType(src) }));
  };

  const slots = new Map($$('.demo-grid[data-clip]').map((grid) => [grid.dataset.clip, {
    key: grid.dataset.clip,
    grid,
    video: $('video', grid),
    image: $('.media-fallback', grid),
    frame: $('.media-frame', grid),
    generation: 0,
  }]));
  const localClips = new Map();

  function setMediaState(slot, state) {
    const [what, qualifier] = MEDIA_LABEL[state];
    slot.grid.dataset.state = state;
    $('.media-label', slot.grid).replaceChildren(h('b', { class: 'label-main' }, what), sr(' · '), h('span', { class: 'label-rest' }, qualifier));
    $('.media-frame-label', slot.grid).textContent = `${what} · ${qualifier}`;
    const showVideo = state === 'published' || state === 'local';
    slot.video.hidden = !showVideo;
    slot.image.hidden = showVideo;
  }

  function failSlot(slot) {
    if (slot.grid.dataset.state === 'failed') return;
    slot.video.pause();
    setMediaState(slot, 'failed');
    if (slides[current] && slides[current].contains(slot.grid)) {
      notify('That recording could not load here, so the slot shows a concept reference image instead.');
    }
  }

  function setClip(key, sources, mode, fileName) {
    const slot = slots.get(key);
    if (!slot) return;
    const video = slot.video;
    video.pause();
    for (const old of $$('source', video)) old.remove();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    slot.generation += 1;
    const generation = slot.generation;
    if (sources.length) {
      setMediaState(slot, mode);
      const poster = mode === 'published' ? playableUrl(config.posters && config.posters[key]) : '';
      if (poster) video.poster = poster;
      let failures = 0;
      for (const { src, type } of sources) {
        const source = h('source', { src, type: type || null });
        // A source the browser cannot play fires 'error' on the <source>, not on the video; the next
        // source is tried. Only when every source has failed does the slot fall back.
        source.addEventListener('error', () => {
          if (generation !== slot.generation) return;
          failures += 1;
          if (failures >= sources.length) failSlot(slot);
        });
        video.append(source);
      }
    } else {
      setMediaState(slot, 'none');
    }
    video.load();
    const remove = $(`[data-remove="${key}"]`);
    if (remove) remove.hidden = mode !== 'local';
    const input = $(`[data-upload="${key}"]`);
    const row = input && input.closest('.upload-row');
    const caption = row && $('span', row);
    if (caption) {
      if (!caption.dataset.defaultText) caption.dataset.defaultText = caption.textContent;
      caption.textContent = mode === 'local' ? `Previewing ${fileName} in this tab only` : caption.dataset.defaultText;
    }
  }

  // The scene's own recording (and the next one) buffer fully once the presenter arrives.
  function warmClips(index) {
    for (const i of [index, index + 1]) {
      const grid = slides[i] && $('.demo-grid[data-clip]', slides[i]);
      const slot = grid && slots.get(grid.dataset.clip);
      if (slot && slot.grid.dataset.state === 'published' && slot.video.preload !== 'auto') slot.video.preload = 'auto';
    }
  }

  for (const [key, slot] of slots) {
    // A recording that was selected but cannot be decoded fails on the video element itself.
    slot.video.addEventListener('error', () => {
      if (slot.video.error && slot.grid.dataset.state !== 'none') failSlot(slot);
    });
    const expand = $('.media-expand', slot.grid);
    expand.addEventListener('click', () => {
      const wasExpanded = slot.frame.classList.contains('expanded');
      collapseMedia();
      if (!wasExpanded) {
        slot.frame.classList.add('expanded');
        document.body.classList.add('media-expanded');
        expand.textContent = 'Close ✕';
        expand.setAttribute('aria-expanded', 'true');
      }
    });
    const sources = configuredSources(key);
    if (sources.length) setClip(key, sources, 'published');
    else setMediaState(slot, 'none');
  }

  for (const input of $$('[data-upload]')) {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
        notify('Choose a video file (H.264 MP4 or WebM).');
        input.value = '';
        return;
      }
      const key = input.dataset.upload;
      if (localClips.has(key)) URL.revokeObjectURL(localClips.get(key));
      const url = URL.createObjectURL(file);
      localClips.set(key, url);
      setClip(key, [{ src: url, type: file.type || videoType(file.name) }], 'local', file.name);
      notify('Previewing this clip in this tab only. Nothing was uploaded or published.');
    });
  }
  for (const button of $$('[data-remove]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.remove;
      if (localClips.has(key)) {
        URL.revokeObjectURL(localClips.get(key));
        localClips.delete(key);
      }
      $(`[data-upload="${key}"]`).value = '';
      const sources = configuredSources(key);
      setClip(key, sources, sources.length ? 'published' : undefined);
    });
  }
  window.addEventListener('pagehide', () => pauseVideos());

  /* ---------------------------------------------------------------------------------------- */
  /* Full screen                                                                                */
  /* ---------------------------------------------------------------------------------------- */

  function updatePresentLabel() {
    const on = document.body.classList.contains('in-presentation');
    $('.present-label').textContent = document.fullscreenElement ? 'Exit full screen' : on ? 'Exit presentation' : 'Present';
    $('#present-btn').setAttribute('aria-pressed', String(on));
  }
  function setPresentationLayout(on) {
    document.body.classList.toggle('in-presentation', on);
    updatePresentLabel();
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
  $('#present-btn').addEventListener('click', present);
  document.addEventListener('fullscreenchange', () => setPresentationLayout(Boolean(document.fullscreenElement)));

  /* ---------------------------------------------------------------------------------------- */
  /* Buttons and keyboard                                                                       */
  /* ---------------------------------------------------------------------------------------- */

  $('#next-btn').addEventListener('click', next);
  $('#prev-btn').addEventListener('click', previous);
  $('[data-go]').addEventListener('click', () => go(0));

  // Keys never act while someone types, uses media controls or works in a dialog.
  const ownsKeys = (target) => target instanceof Element && (target.isContentEditable || Boolean(target.closest('input, textarea, select, video, audio, [contenteditable="true"]')));
  // A dialog opened with its shortcut (O, N, A) returns focus to where the presenter was, usually the deck,
  // not to the toolbar button: otherwise the next Space would press that button and reopen the dialog
  // instead of playing a clip or moving on.
  const keyOpener = () => {
    const el = document.activeElement;
    return el instanceof HTMLElement && el !== document.body && el.isConnected ? el : deck;
  };

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ($('dialog[open]')) return;
    if (ownsKeys(e.target)) return;
    const key = e.key;
    if ((key === ' ' || key === 'Enter') && e.target instanceof Element && e.target.closest('button, a, summary, label')) return;
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
      next();
    } else if (key === 'ArrowLeft' || key === 'PageUp') {
      e.preventDefault();
      previous();
    } else if (key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (key === 'End') {
      e.preventDefault();
      go(slides.length - 1);
    } else if (key === ' ') {
      e.preventDefault();
      const video = slides[current] && $('video:not([hidden])', slides[current]);
      if (video) {
        if (video.paused) video.play().catch(() => notify('Use the video’s play button to start this clip.'));
        else video.pause();
      } else next();
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
  /* Hash: #1 to #15, a scene id (#roadmap), #appendix and #appendix-<section>                  */
  /* ---------------------------------------------------------------------------------------- */

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
    const byId = scenes.findIndex((scene) => scene.id === raw || `scene-${scene.id}` === raw);
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
  document.documentElement.classList.add('js');
  applyHash(true);
})();
