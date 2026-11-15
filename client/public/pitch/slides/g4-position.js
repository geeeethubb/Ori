// Group 4 · slides 9–10 (presented #8–#9): the layouts "zones" (interests and workflows) and "position" (the
// competitor map). Contract: docs/ori-pitch-kit/PITCH_INTEGRATION.md, "16-slide revision". This file only
// registers renderers; pitch.js calls each one once, as renderer(scene, kit), while it builds the deck (hidden),
// so nothing here measures layout. Styles: slides/g4-position.css (stage px, scoped to the two layouts).
// Copy and data: scenes.js → onScreen of the scenes "zones" and "position". Claims follow
// docs/ori-pitch-kit/PRODUCT_FACTS.md (sections 6 and 9).
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  // A one-shot entrance that explains a relationship (context flowing into Ori; Ori today → Ori vision).
  // The global reduced-motion rule removes the animation, leaving the complete, static composition.
  const replay = (slide, className) => {
    if (!slide) return;
    slide.classList.remove(className);
    void slide.offsetWidth; // restart the CSS animation on every arrival
    slide.classList.add(className);
  };
  const stop = (slide, className) => { if (slide) slide.classList.remove(className); };

  /* -------------------------------------------------------------------------------------------- */
  /* Slide 9 · "What you love. What you need to get done."                                        */
  /* Two zones of real app screens (Sample mode) around one Ori, both feeding one shared ring, with */
  /* one small return arrow. People and Course Assignments organize and highlight; nothing is sent  */
  /* or automated (PRODUCT_FACTS §6), so the slide never says "automate".                          */
  /* -------------------------------------------------------------------------------------------- */
  slides.zones = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen;

    const mark = (a) => (a.icon
      ? h('span', { class: `zn-mark zn-mark-glyph zn-mark-${a.app}`, 'aria-hidden': 'true' }, kit.icon(a.icon, { size: 24 }))
      : kit.appIcon(a.app, { size: 44, className: 'zn-mark' }));
    const mini = (a) => h('figure', { class: `zn-app zn-app-${a.app}` },
      h('div', { class: 'zn-screen' }, kit.lazyImage(`media/stills/${a.still}`, { alt: a.alt || '', width: '236', height: '312' })),
      h('figcaption', { class: 'zn-cap' }, mark(a), h('b', null, a.name), h('span', null, a.what)));
    const zone = (z, side) => h('section', { class: `zn-zone zn-${side}`, 'aria-label': z.title },
      h('h3', { class: 'zn-title' }, h('span', { class: 'zn-title-icon', 'aria-hidden': 'true' }, kit.icon(z.icon, { size: 22 })), z.title),
      h('div', { class: 'zn-apps' }, z.apps.map(mini)));

    // The hub: one shared ring (interests on the left half, workflows on the right), both sides feeding it,
    // and one small return arrow over the top. Ori sits at the centre on lime.
    const W = 340, H = 400, cx = 170, cy = 200, r = 104;
    const at = (deg) => {
      const a = (deg * Math.PI) / 180;
      return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    };
    const ring = svg('svg', { class: 'zn-ring', viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), 'aria-hidden': 'true', focusable: 'false' },
      svg('defs', null,
        svg('marker', { id: 'zn-head', viewBox: '0 0 10 10', refX: '6', refY: '5', markerWidth: '15', markerHeight: '15', markerUnits: 'userSpaceOnUse', orient: 'auto' },
          svg('path', { class: 'zn-head', d: 'M0,0 L10,5 L0,10 z' }))),
      svg('path', { class: 'zn-half zn-half-love', d: `M ${cx} ${cy + r} A ${r} ${r} 0 0 1 ${cx} ${cy - r}` }),
      svg('path', { class: 'zn-half zn-half-do', d: `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}` }),
      svg('path', { class: 'zn-feed zn-feed-love', d: `M 2 ${cy} H ${cx - r - 22}`, pathLength: '1', 'marker-end': 'url(#zn-head)' }),
      svg('path', { class: 'zn-feed zn-feed-do', d: `M ${W - 2} ${cy} H ${cx + r + 22}`, pathLength: '1', 'marker-end': 'url(#zn-head)' }),
      svg('path', { class: 'zn-return', d: `M ${at(-152)} A ${r} ${r} 0 0 1 ${at(-38)}`, pathLength: '1', 'marker-end': 'url(#zn-head)' }));
    const hub = h('div', { class: 'zn-hub' }, ring,
      h('span', { class: 'zn-core' }, kit.ori(scene.companion.expression, { size: 150, disc: false, label: 'Ori: one companion for both' })));

    return {
      body: [
        h('div', { class: 'zn-grid' }, zone(o.zones[0], 'love'), hub, zone(o.zones[1], 'do')),
        h('div', { class: 'zn-foot' },
          h('p', { class: 'zn-bottom' }, o.bottomLine.replace(/Both grow with you\.$/, ''), h('mark', null, 'Both grow with you.')),
          h('p', { class: 'zn-media-label' }, o.mediaLabel)),
      ],
      onEnter: (ctx) => { if (!ctx.reducedMotion) replay(ctx.slide, 'g4-play'); },
      onLeave: (ctx) => stop(ctx.slide, 'g4-play'),
    };
  };

  /* -------------------------------------------------------------------------------------------- */
  /* Slide 10 · "Personal context, turned into everyday apps."                                    */
  /* One XY positioning map. Regions are qualitative editorial judgments of product focus (0–1     */
  /* boxes from scenes.js), never scores; competitors may overlap Ori. What the repository does    */
  /* not ship is an outlined "Ori vision" marker joined to today's position by a dashed extension. */
  /* -------------------------------------------------------------------------------------------- */
  slides.position = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen;
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    const PW = 960, PH = 520; // the plot's design size (stage px); the overlay uses the same units

    const region = (r, i) => h('div', {
      class: `ps-region ps-tone-${r.tone || 'plain'} ps-at-${r.at || 'tl'}`,
      style: { left: pct(r.x[0]), width: pct(r.x[1] - r.x[0]), bottom: pct(r.y[0]), height: pct(r.y[1] - r.y[0]), '--i': String(i) },
    }, h('p', { class: 'ps-region-label' }, h('b', null, r.name), r.example ? h('span', null, `e.g. ${r.example}`) : null));

    // Ori today → Ori vision: a short dashed extension (computed in plot units, outside the two discs).
    const ox = o.ori.x * PW, oy = (1 - o.ori.y) * PH, vx = o.vision.x * PW, vy = (1 - o.vision.y) * PH;
    const len = Math.hypot(vx - ox, vy - oy) || 1;
    const ux = (vx - ox) / len, uy = (vy - oy) / len;
    const link = svg('svg', { class: 'ps-overlay', viewBox: `0 0 ${PW} ${PH}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
      svg('line', { class: 'ps-link', x1: (ox + ux * 70).toFixed(1), y1: (oy + uy * 70).toFixed(1), x2: (vx - ux * 42).toFixed(1), y2: (vy - uy * 42).toFixed(1), 'vector-effect': 'non-scaling-stroke' }));

    const describe = `${o.label}. ${o.axes.x.title}, from “${o.axes.x.low}” on the left to “${o.axes.x.high}” on the right. `
      + `${o.axes.y.title}, from “${o.axes.y.low}” at the bottom to “${o.axes.y.high}” at the top. `
      + o.regions.map((r) => `${r.name}${r.example ? ` (for example ${r.example})` : ''}: ${r.note}.`).join(' ')
      + ` ${o.ori.name}, toward the upper right and overlapping general AI assistants: ${o.ori.note}. `
      + `${o.vision.name}, outlined further up and right: ${o.vision.note}. Qualitative placements, not scores.`;

    const map = h('div', { class: 'ps-map', role: 'img', 'aria-label': describe },
      h('div', { class: 'ps-ylab' },
        h('span', { class: 'ps-end ps-end-high' }, o.axes.y.high),
        h('b', { class: 'ps-title ps-title-y' }, o.axes.y.title),
        h('span', { class: 'ps-end ps-end-low' }, o.axes.y.low)),
      h('div', { class: 'ps-plot' },
        o.regions.map(region),
        link,
        h('span', { class: 'ps-axis-head ps-axis-head-x' }, kit.icon('ui:arrowRight', { size: 22 })),
        h('span', { class: 'ps-axis-head ps-axis-head-y' }, kit.icon('ui:arrowRight', { size: 22 })),
        h('div', { class: 'ps-point ps-vision', style: { left: pct(o.vision.x), bottom: pct(o.vision.y) } },
          h('span', { class: 'ps-vision-ring' }), h('b', { class: 'ps-point-name' }, o.vision.name)),
        h('div', { class: 'ps-point ps-ori', style: { left: pct(o.ori.x), bottom: pct(o.ori.y) } },
          h('span', { class: 'ps-ori-disc' }, kit.ori(scene.companion.expression, { size: 108, disc: false })),
          h('b', { class: 'ps-point-name' }, o.ori.name))),
      h('div', { class: 'ps-xlab' },
        h('span', { class: 'ps-end ps-end-low' }, o.axes.x.low),
        h('b', { class: 'ps-title ps-title-x' }, o.axes.x.title),
        h('span', { class: 'ps-end ps-end-high' }, o.axes.x.high)));

    return {
      body: [
        h('div', { class: 'ps-wrap' }, map,
          h('div', { class: 'ps-side' }, kit.tag(o.label, { tone: 'outline' }), h('p', { class: 'ps-line' }, o.supporting))),
      ],
      onEnter: (ctx) => { if (!ctx.reducedMotion) replay(ctx.slide, 'g4-play'); },
      onLeave: (ctx) => stop(ctx.slide, 'g4-play'),
    };
  };
})();
