// Group 2 · the layouts "journey" and "feeling" (the brief's slides 4 and 5; presented as #3 and #4 since the
// brief's slide 2 moved to the appendix).
// Contract: docs/ori-pitch-kit/PITCH_INTEGRATION.md, "16-slide revision". This file only registers renderers;
// pitch.js calls each one once, as renderer(scene, kit), while it builds the deck hidden, so nothing here
// measures layout. Every position is in stage px on the 1424-px-wide body. Styles: slides/g2-journey.css.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  // Static line art (fixed coordinates, no user data) in an aria-hidden wrapper.
  const lineArt = (kit, className, width, height, inner) => {
    const wrap = kit.h('div', { class: className, 'aria-hidden': 'true' });
    wrap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" focusable="false">${inner}</svg>`;
    return wrap;
  };
  // A filled arrowhead whose tip sits at `tip`, pointing away from `from` (the path's last control point).
  const arrowHead = (tip, from, length = 30, half = 17) => {
    const dx = tip[0] - from[0];
    const dy = tip[1] - from[1];
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const bx = tip[0] - ux * length;
    const by = tip[1] - uy * length;
    return [[tip[0], tip[1]], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half]]
      .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  };

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 4 · journey: five stages, one Ori                                                      */
  /* ------------------------------------------------------------------------------------------ */
  // The five stages build one per Next (ghosted, then revealed: the original rhythm). At step 5 one
  // continuous path runs through all five, Ori (Ready, the happy expression) appears at the centre of the
  // loop it makes, and the path returns from "Build and iterate" to "Feel it": "And keeps growing with you."
  const J = { w: 1424, h: 620, cy: 92, xs: [190, 451, 712, 973, 1234], bottom: 572 };
  slides.journey = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const stages = (o.stages || []).slice(0, 5);
    const together = o.together || 'Ori helps you through all five.';
    const returnLine = o.returnLine || 'And keeps growing with you.';
    const steps = stages.length;
    const [x1, , , , x5] = J.xs;
    const tip = [130, 152];
    const lastControl = [16, 250];
    const loop = lineArt(kit, 'jr-lines', J.w, J.h, [
      `<path class="jr-run" pathLength="1" d="M${x1} ${J.cy} L${x5} ${J.cy}"/>`,
      `<path class="jr-return" pathLength="1" d="M${x5} ${J.cy} C1416 ${J.cy} 1416 ${J.bottom} 1150 ${J.bottom} L274 ${J.bottom} C8 ${J.bottom} ${lastControl.join(' ')} ${tip.join(' ')}"/>`,
      `<polygon class="jr-head" points="${arrowHead(tip, lastControl)}"/>`,
    ].join(''));
    const stageItems = stages.map((s, i) => kit.reveal(h('li', { class: 'jr-stage', style: { '--jr-i': String(i) } },
      h('span', { class: 'jr-node', 'aria-hidden': 'true' }, kit.icon(s.icon, { size: 60, strokeWidth: 1.9 })),
      h('h3', { class: 'jr-name' }, kit.sr(`Stage ${i + 1}: `), s.name)), i + 1, { ghost: true }));
    return {
      steps,
      stepLabels: stages.map((s, i) => (i === steps - 1 ? `${s.name}. ${together} ${returnLine}` : s.name)),
      bodyClass: 'jr-body',
      body: h('div', { class: 'jr-map' },
        kit.reveal(loop, steps),
        h('ol', { class: 'jr-stages' }, stageItems),
        kit.reveal(h('div', { class: 'jr-hub' },
          kit.ori(scene.companion && scene.companion.expression ? scene.companion.expression : 'Ready', { size: 168 }),
          h('p', { class: 'jr-together' }, together)), steps),
        kit.reveal(h('p', { class: 'jr-return-line' },
          h('span', { class: 'jr-return-icon', 'aria-hidden': 'true' }, kit.icon('ui:refresh', { size: 26 })),
          h('span', null, returnLine)), steps)),
    };
  };

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 5 · feeling: Feeling → Ori → Your app                                                  */
  /* ------------------------------------------------------------------------------------------ */
  // Inputs are things a person brings (a typed thought, a photo, a reel link that is saved but never read, a
  // summary pasted from their own AI); nothing is drawn as an account connection. The exchange is the real
  // Make-page question and the focus words that became Light's weekly prompt. The app is a real screenshot.
  const F = { w: 1424, h: 620 };
  const FEELING_DEFAULTS = {
    structure: ['Feeling', 'Ori', 'Your app'],
    thought: 'I keep stopping for long shadows.',
    photo: { src: 'assets/g2-journey/shared-photo.webp', alt: 'A photo the person shares: low sun and long shadows on a brick street.' },
    reel: 'Reel link',
    summary: 'ChatGPT · Claude summary',
    exchange: { ask: 'What should it focus on?', answer: 'Golden-hour shadows.' },
    output: {
      app: 'light',
      name: 'Light',
      still: 'media/stills/light-open-first-photo.webp',
      stillLabel: 'Product screenshot · Sample mode',
      alt: 'Light, the app Ori made: its camera icon, “Notice the light.”, this week’s prompt “Focus on golden-hour shadows” and the shared photo as the first entry.',
    },
  };
  slides.feeling = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const d = FEELING_DEFAULTS;
    const inputs = Object.fromEntries((o.inputs || []).map((x) => [x.kind, x]));
    const structure = o.structure && o.structure.length === 3 ? o.structure : d.structure;
    const thought = (inputs.thought && inputs.thought.text) || d.thought;
    const photo = { ...d.photo, ...(inputs.photo && inputs.photo.src ? inputs.photo : {}) };
    const reel = (inputs.reel && inputs.reel.label) || d.reel;
    const summary = (inputs.summary && inputs.summary.label) || d.summary;
    const exchange = { ...d.exchange, ...(o.exchange || {}) };
    const output = { ...d.output, ...(o.output && o.output.still ? o.output : {}) };

    const links = lineArt(kit, 'fe-links', F.w, F.h, [
      '<path class="fe-link" pathLength="1" style="--fe-d:0s" d="M392 150 C500 150 520 290 598 300"/>',
      '<path class="fe-link" pathLength="1" style="--fe-d:.08s" d="M262 340 C380 340 470 312 596 312"/>',
      '<path class="fe-link" pathLength="1" style="--fe-d:.16s" d="M458 296 C520 296 540 318 596 318"/>',
      '<path class="fe-link" pathLength="1" style="--fe-d:.24s" d="M470 520 C540 520 540 340 600 334"/>',
      '<path class="fe-out-link" pathLength="1" d="M836 300 L992 300"/>',
      `<polygon class="fe-out-head" points="${arrowHead([1014, 300], [992, 300], 30, 18)}"/>`,
    ].join(''));

    const structureRow = h('p', { class: 'fe-structure' },
      kit.arrowJoin(structure, (label, i) => h('span', { class: `fe-label fe-label-${i + 1}` }, label)));

    const feelingZone = h('div', { class: 'fe-zone fe-in' },
      h('p', { class: 'fe-thought' }, kit.sr('A thought: '), thought),
      h('figure', { class: 'fe-photo' }, kit.lazyImage(photo.src, { alt: photo.alt, width: '232', height: '186' })),
      h('div', { class: 'fe-reel' },
        h('span', { class: 'fe-reel-screen', 'aria-hidden': 'true' },
          h('span', { class: 'fe-reel-play' }, kit.icon('ui:play', { size: 34 }))),
        h('span', { class: 'fe-chip' }, kit.icon('ui:link', { size: 20 }), h('span', null, reel))),
      h('div', { class: 'fe-summary' },
        h('p', { class: 'fe-summary-head' },
          h('span', { class: 'fe-summary-icon', 'aria-hidden': 'true' }, kit.icon('ui:copy', { size: 24 })),
          h('span', null, summary)),
        h('span', { class: 'fe-lines', 'aria-hidden': 'true' },
          h('span', { class: 'fe-line' }), h('span', { class: 'fe-line' }), h('span', { class: 'fe-line' }))));

    const oriZone = h('div', { class: 'fe-zone fe-ori' },
      h('p', { class: 'fe-ask' }, kit.sr('Ori asks: '), exchange.ask),
      kit.ori(scene.companion && scene.companion.expression ? scene.companion.expression : 'Listening', { size: 236 }),
      h('p', { class: 'fe-answer' }, kit.sr('You answer: '), exchange.answer));

    const appZone = h('figure', { class: 'fe-zone fe-out' },
      h('span', { class: 'fe-phone' }, kit.lazyImage(output.still, { alt: output.alt, width: '280', height: '363' })),
      h('span', { class: 'fe-app' }, kit.appIcon(output.app, { size: 84 }), h('b', { class: 'fe-app-name' }, output.name)),
      h('figcaption', { class: 'fe-caption' }, output.stillLabel));

    return {
      bodyClass: 'fe-body',
      body: h('div', { class: 'fe-map' }, links, structureRow, feelingZone, oriZone, appZone),
      // The context moves into Ori, then Ori's arrow reaches the app: replayed on each arrival (CSS only;
      // reduced motion removes the animation and shows the finished state).
      onEnter(ctx) {
        ctx.slide.classList.remove('fe-play');
        if (ctx.reducedMotion) return;
        void ctx.slide.offsetWidth;
        ctx.slide.classList.add('fe-play');
      },
      onLeave(ctx) {
        ctx.slide.classList.remove('fe-play');
      },
    };
  };
})();
