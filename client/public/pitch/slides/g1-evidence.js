// Group 1 · the discovery slide (layout "discovery", presented #2, the brief's slide 3).
// The brief's slide 2 (the research evidence) is not presented: it is the appendix panel #appendix-research in
// index.html ("Research behind this"); slides/g1-evidence.css only refines how that panel reads.
// Contract: docs/ori-pitch-kit/PITCH_INTEGRATION.md, "16-slide revision". This file registers a renderer (pitch.js
// calls it once, as renderer(scene, kit), while it builds the deck). Styles: slides/g1-evidence.css.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  // A static SVG from markup (decorative: hidden from screen readers unless a label is given).
  const art = (markup, attrs = {}) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = markup.trim();
    const el = wrap.firstElementChild;
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
    if (!attrs.role) { el.setAttribute('aria-hidden', 'true'); el.setAttribute('focusable', 'false'); }
    return el;
  };

  /* ---------------------------------------------------------------------------------------------- */
  /* Discovery (presented #2): the question, 21 / 26 with its dots, the friend's insight, two sparks  */
  /* ---------------------------------------------------------------------------------------------- */

  // The friend's words on an ink card (lime on the words that matter), with no tail, so nothing on the slide reads
  // as the speaker: paraphrased, no name, no portrait.
  const BUBBLE = { w: 792, h: 312, tail: 40, r: 44 };
  const bubblePath = ({ w, h, tail, r }) =>
    `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;

  // A saved reel: a portrait thumbnail with a play symbol and a "saved" bookmark (no platform logo).
  const REEL_SVG = `<svg viewBox="0 0 104 172" width="104" height="172" class="ds-reel-art">
    <defs><linearGradient id="g1-reel-sky" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#ffd29a"/><stop offset="0.5" stop-color="#ef8f86"/><stop offset="1" stop-color="#5a4fa8"/>
    </linearGradient></defs>
    <rect width="104" height="172" rx="18" fill="url(#g1-reel-sky)"/>
    <circle cx="72" cy="50" r="15" fill="#fff4cf" opacity="0.9"/>
    <path d="M0 132 C 26 108 52 118 104 98 V154 a18 18 0 0 1 -18 18 H18 a18 18 0 0 1 -18 -18 Z" fill="#1f2b4d" opacity="0.55"/>
    <circle cx="52" cy="86" r="23" fill="#fff" opacity="0.92"/>
    <path d="M45 74 L65 86 L45 98 Z" fill="#162039"/>
    <path d="M80 10 h13 v21 l-6.5 -4.6 l-6.5 4.6 Z" fill="#fff"/>
    <rect x="12" y="146" width="54" height="7" rx="3.5" fill="#fff" opacity="0.8"/>
    <rect x="12" y="158" width="36" height="6" rx="3" fill="#fff" opacity="0.55"/>
  </svg>`;

  // A note that trails off: a warm note bubble (the words are real text on top of it).
  const NOTE = { w: 352, h: 132, tail: 22, r: 26 };
  const notePath = ({ w, h, tail, r }) =>
    `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w},${r} V${h - r} A${r},${r} 0 0 1 ${w - r},${h} H92 L58,${h + tail} L62,${h} H${r} A${r},${r} 0 0 1 0,${h - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`;

  slides.discovery = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const yes = Number(o.yes) || 21;
    const total = Number(o.total) || 26;
    const question = o.question || scene.headline;

    const dots = Array.from({ length: total }, (_, i) => h('span', {
      class: i < yes ? 'ds-dot is-yes' : 'ds-dot',
      style: { '--i': String(i) },
    }));

    const insight = String(o.insight || '');
    const emphasis = o.insightEmphasis || 'what the idea even is.';
    const at = insight.lastIndexOf(emphasis);
    const insightText = at >= 0
      ? [insight.slice(0, at), h('span', { class: 'ds-em' }, emphasis), insight.slice(at + emphasis.length)]
      : [insight];

    const bubbleArt = art(`<svg viewBox="0 0 ${BUBBLE.w} ${BUBBLE.h + BUBBLE.tail}" width="${BUBBLE.w}" height="${BUBBLE.h + BUBBLE.tail}" class="ds-bubble-art"><path d="${bubblePath(BUBBLE)}"/></svg>`);
    const noteArt = art(`<svg viewBox="0 0 ${NOTE.w} ${NOTE.h + NOTE.tail}" width="${NOTE.w}" height="${NOTE.h + NOTE.tail}" class="ds-note-art"><path d="${notePath(NOTE)}"/></svg>`);

    const examples = (o.examples || []).slice(0, 2).map((x) => (x.kind === 'reel'
      ? h('figure', { class: 'ds-example ds-reel' },
        art(REEL_SVG),
        h('figcaption', { class: 'ds-example-label' }, x.label))
      : h('figure', { class: 'ds-example ds-note' },
        noteArt,
        h('p', { class: 'ds-note-text' }, x.text))));

    return {
      head: h('header', { class: 'scene-head' },
        h('h2', { class: 'headline ds-question' },
          h('span', { class: 'ds-quote', 'aria-hidden': 'true' }, '“'), question, h('span', { class: 'ds-quote', 'aria-hidden': 'true' }, '”'))),
      bodyClass: 'ds-body',
      body: h('div', { class: 'ds-grid' },
        h('div', { class: 'ds-count' },
          h('p', { class: 'ds-figure' },
            h('span', { class: 'ds-yes' }, String(yes)),
            h('span', { class: 'ds-of' }, ` / ${total}`),
            h('a', { class: 'ds-star', href: '#appendix-discovery', 'data-appendix-link': 'discovery', 'aria-label': 'About this number (appendix)' }, '*')),
          h('p', { class: 'ds-count-label' }, o.countLabel || 'students said yes.'),
          h('div', { class: 'ds-dots', role: 'img', 'aria-label': `${yes} of ${total} students said yes` }, dots),
          h('p', { class: 'ds-footnote' }, h('span', { 'aria-hidden': 'true' }, '* '), o.footnote || '')),
        h('div', { class: 'ds-voice' },
          h('figure', { class: 'ds-bubble' },
            bubbleArt,
            h('blockquote', { class: 'ds-insight-text' }, insightText),
            h('figcaption', { class: 'ds-insight-label' }, o.insightLabel || '')),
          h('div', { class: 'ds-examples' }, examples))),
    };
  };
})();
