// Group 5 · the brief's slides 11–13 (presented as 10–12): the layouts "founder", "growth" and "pricing".
// Contract: docs/ori-pitch-kit/PITCH_INTEGRATION.md, "16-slide revision". This file only registers renderers;
// pitch.js calls each one once, as renderer(scene, kit), when it builds the deck. Styles: slides/g5-growth.css.
// Every size is in stage px (the 1600 x 900 design stage); the SVGs are drawn 1:1 on it.
// Motion (CSS, on .slide.active): the community lines draw, the goal line draws left to right, the price steps
// rise. The founder's pipeline builds one stage per Next (kit.reveal, ghosted until its step, as on the journey
// slide) and each arrow draws as its stage arrives; the pilot goals are its last step. Each explains a
// relationship; reduced motion removes all of it (style.css), so every step then switches instantly.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  // The headline on two lines, broken before the accent (kit.headline breaks only after a full sentence).
  const twoLineHead = (scene, kit) => {
    const { h } = kit;
    const text = String(scene.headline || '');
    const part = typeof scene.accent === 'string' ? scene.accent : '';
    const at = part ? text.lastIndexOf(part) : -1;
    if (at <= 0) return kit.head(scene);
    return h('header', { class: 'scene-head' },
      h('h2', { class: 'headline' }, text.slice(0, at).trimEnd(), h('br'), h('span', { class: 'accent' }, part), text.slice(at + part.length)));
  };
  const oneLineHead = (scene, kit) => kit.h('header', { class: 'scene-head' }, kit.headline(scene, { break: false }));

  // Labels over an SVG drawing, as HTML (an SVG holds no text: text tools group words by HTML block). Each item's
  // x and y are its anchor point and vertical centre in the drawing's px; stored in %, so they follow its scale.
  const overlay = (h, className, W, H, items) => h('div', { class: `g5-labels ${className}`, 'aria-hidden': 'true' },
    items.filter(Boolean).map((it) => h('span', {
      class: `g5-label is-${it.anchor || 'middle'} ${it.cls || ''}`,
      style: { left: `${(it.x / W) * 100}%`, top: `${(it.y / H) * 100}%`, '--k': String(it.k || 0) },
    }, it.text)));

  // An icon from the project's set; the first name the set has wins.
  const pickIcon = (kit, names, size) => kit.icon(names.find((n) => kit.hasIcon(n)) || names[0], { size });

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 11 · founder: who Zuyu is, why he can reach these people, what he does next          */
  /* ------------------------------------------------------------------------------------------ */

  const PIPELINE_ICONS = {
    Relationships: ['app:people', 'ui:person'],
    'Personal onboarding': ['app:footprints', 'ui:person'],
    Observe: ['app:binoculars', 'ui:history'],
    'Product iteration': ['ui:refresh', 'ui:history'],
    Referrals: ['ui:share', 'ui:send'],
  };

  slides.founder = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen;
    const ROW = 280; // the community row's height; the chips are spaced to match the connector ends
    const CHIP = 52;
    const centers = o.groups.map((_, i) => CHIP / 2 + (i * (ROW - CHIP)) / Math.max(1, o.groups.length - 1));
    const DISC = 160;
    const LINK_W = 250;

    // Who: the initials disc (no portrait exists; none is generated), the name and the line.
    const disc = svg('svg', { class: 'fd-disc', viewBox: `0 0 ${DISC} ${DISC}`, width: String(DISC), height: String(DISC), 'aria-hidden': 'true' },
      svg('circle', { cx: DISC / 2, cy: DISC / 2, r: DISC / 2, class: 'fd-disc-fill' }),
      svg('circle', { cx: DISC / 2, cy: DISC / 2, r: DISC / 2 - 9, class: 'fd-disc-ring' }));
    // Why: lines from Zuyu to each group; solid for his own roles, dashed for friends in other groups.
    const links = svg('svg', { class: 'fd-links', viewBox: `0 0 ${LINK_W} ${ROW}`, width: String(LINK_W), height: String(ROW), 'aria-hidden': 'true' },
      o.groups.map((g, i) => svg('g', { class: `fd-link is-${g.kind}` },
        svg('path', { d: `M0 ${DISC / 2} C ${LINK_W * 0.5} ${DISC / 2}, ${LINK_W * 0.5} ${centers[i]}, ${LINK_W - 10} ${centers[i]}` }),
        svg('circle', { cx: LINK_W - 8, cy: centers[i], r: 6 }))));
    const community = h('div', { class: 'fd-community' },
      h('div', { class: 'fd-who' }, h('span', { class: 'fd-disc-wrap' }, disc, h('span', { class: 'fd-initials', 'aria-hidden': 'true' }, o.founder.initials)),
        h('p', { class: 'fd-name' }, o.founder.name),
        h('p', { class: 'fd-line' }, o.founder.line)),
      links,
      h('ul', { class: 'fd-groups', 'aria-label': 'Groups Zuyu belongs to or knows' },
        o.groups.map((g) => h('li', { class: `fd-group is-${g.kind}` }, h('b', null, g.name), g.role ? h('span', { class: 'fd-role' }, ` · ${g.role}`) : null))));

    // The discovery callback as a share: 81% (21 of 26, rounded), over the same 26 dots as the discovery slide,
    // 21 filled, and a label that keeps the denominator ("of the 26 students I spoke with").
    const pct = Math.round((o.evidence.yes / o.evidence.total) * 100);
    const COLS = 13, D = 22, GAP = 8;
    const DW = COLS * (D + GAP) - GAP, DH = 2 * (D + GAP) - GAP;
    const dots = svg('svg', { class: 'fd-dots', viewBox: `0 0 ${DW} ${DH}`, width: String(DW), height: String(DH), 'aria-hidden': 'true' },
      Array.from({ length: o.evidence.total }, (_, i) => svg('circle', {
        cx: (i % COLS) * (D + GAP) + D / 2, cy: Math.floor(i / COLS) * (D + GAP) + D / 2, r: D / 2 - 1.5,
        class: i < o.evidence.yes ? 'is-yes' : 'is-no',
      })));
    const evidence = h('div', { class: 'fd-evidence' },
      h('p', { class: 'fd-count' }, h('b', null, String(pct)), h('span', { class: 'fd-pct' }, '%')),
      dots,
      h('p', { class: 'fd-evidence-label' }, o.evidence.label));

    // What next: the pipeline, icons and labels only (a proposed mechanism, not a measured funnel). A process to
    // click through, like the journey's five stages: stage n (its node, its arrow, its label) is revealed at
    // step n, ghosted until then; the pilot goals are the last step. pitch.js starts at step 1 only on an arrival
    // by Next; any other arrival shows every step.
    const stages = o.pipeline;
    const steps = stages.length + 1;
    const pipeline = h('div', { class: 'fd-pipeline' },
      h('div', { class: 'fd-lane', 'aria-hidden': 'true' },
        stages.map((step, i) => kit.reveal(h('span', { class: 'fd-cell' },
          // The arrow into this stage, centred on the boundary with the stage before it.
          i ? svg('svg', { class: 'fd-arrow', viewBox: '0 0 120 24', width: '120', height: '24' },
            svg('path', { d: 'M4 12 H112' }), svg('path', { d: 'M100 3 L114 12 L100 21' })) : null,
          h('span', { class: 'fd-node' }, pickIcon(kit, PIPELINE_ICONS[step] || ['ui:sparkle'], 52))), i + 1, { ghost: true }))),
      h('ol', { class: 'fd-steps', 'aria-label': 'Pipeline' }, stages.map((step, i) => kit.reveal(h('li', null, step), i + 1, { ghost: true }))));

    // Two dated goals, under "Pilot goals": the pipeline's last step.
    const goals = h('div', { class: 'fd-goals' },
      kit.tag(o.goalsLabel, { tone: 'strong', className: 'fd-goals-tag' }),
      h('ul', { class: 'fd-goal-list' }, o.goals.map((g) => h('li', { class: 'fd-goal' },
        h('span', { class: 'fd-goal-icon', 'aria-hidden': 'true' }, kit.icon('app:calendar', { size: 28 })),
        h('b', { class: 'fd-goal-figure' }, g.figure),
        h('span', { class: 'fd-goal-label' }, ` ${g.label} `),
        h('span', { class: 'fd-goal-date' }, g.date)))));
    kit.reveal(goals, steps, { ghost: true });

    return {
      steps,
      stepLabels: [...stages, `${o.goalsLabel}: ${o.goals.map((g) => `${g.figure} ${g.label} ${g.date}`).join('; ')}`],
      head: twoLineHead(scene, kit),
      bodyClass: 'fd-body',
      body: [h('div', { class: 'fd-top' }, community, evidence), pipeline, goals],
    };
  };

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 12 · growth: the registered-user goal on an honest linear scale; channels; YC         */
  /* ------------------------------------------------------------------------------------------ */

  slides.growth = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen;
    const c = o.chart;
    const fmt = kit.formatNumber;
    // Plot geometry (stage px). Linear y from 0 to c.max, so the early months sit near zero, as they should.
    const W = 820, H = 560, L = 124, R = 40, T = 34, B = 66;
    const pw = W - L - R, ph = H - T - B;
    const n = c.points.length;
    const X = (i) => L + (i * pw) / (n - 1);
    const Y = (v) => T + ph - (v / c.max) * ph;
    const base = T + ph;
    const pts = c.points.map((p, i) => [X(i), Y(p.value)]);
    const last = n - 1;
    const labelled = new Set([0, c.max / 2, c.max]);

    const plot = svg('svg', { class: 'gw-svg', viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), role: 'img',
      'aria-label': `${c.flag}: ${c.title}, cumulative, on a linear scale from 0 to ${fmt(c.max)}. ${c.points.map((p) => `${p.month}: ${fmt(p.value)}`).join('; ')}.` },
      // Axes and the honest scale.
      svg('g', { class: 'gw-axes', 'aria-hidden': 'true' },
        (c.ticks || [0, c.max]).map((t) => svg('line', { x1: L, x2: L + pw, y1: Y(t), y2: Y(t), class: t === 0 ? 'gw-baseline' : 'gw-gridline' }))),
      // The goal: a dashed line, the area under it, the five month-end points.
      svg('g', { class: 'gw-data', 'aria-hidden': 'true' },
        svg('polygon', { class: 'gw-area', points: `${X(0)},${base} ${pts.map((q) => q.join(',')).join(' ')} ${X(last)},${base}` }),
        svg('polyline', { class: 'gw-line', points: pts.map((q) => q.join(',')).join(' ') }),
        svg('circle', { class: 'gw-halo', cx: pts[last][0], cy: pts[last][1], r: 26 }),
        pts.map((q, i) => svg('circle', { class: i === last ? 'gw-dot is-last' : 'gw-dot', cx: q[0], cy: q[1], r: i === last ? 13 : 9 }))));

    // Every label is HTML over the drawing (x, y = the label's anchor point and vertical centre, in plot px).
    const valueLabel = (p, i) => {
      const [px, py] = pts[i];
      const text = fmt(p.value);
      // Clear of the line: above the flat start, beside the steep end. k: appears as the line reaches it.
      if (i === last) return { x: px - 34, y: py - 4, anchor: 'end', cls: 'gw-value is-last', text, k: i };
      if (i === last - 1) return { x: px + 22, y: py, anchor: 'start', cls: 'gw-value', text, k: i };
      if (i === 0) return { x: px - 8, y: py - 34, anchor: 'start', cls: 'gw-value', text, k: i };
      if (i === last - 2) return { x: px + 12, y: py - 34, anchor: 'end', cls: 'gw-value', text, k: i };
      return { x: px, y: py - 34, anchor: 'middle', cls: 'gw-value', text, k: i };
    };
    const plotLabels = overlay(h, 'gw-labels', W, H, [
      ...(c.ticks || [0, c.max]).filter((t) => labelled.has(t)).map((t) => ({ x: L - 18, y: Y(t), anchor: 'end', cls: 'gw-tick', text: fmt(t) })),
      ...c.points.map((p, i) => ({ x: X(i) + (i === 0 ? -14 : i === last ? 14 : 0), y: base + 30, anchor: i === 0 ? 'start' : i === last ? 'end' : 'middle', cls: 'gw-month', text: i === 0 ? p.short : p.short.split(' ')[0] })),
      ...c.points.map(valueLabel),
      c.points[0].caption ? { x: pts[0][0] - 8, y: pts[0][1] - 74, anchor: 'start', cls: 'gw-caption', text: c.points[0].caption } : null,
    ]);

    const chart = h('figure', { class: 'gw-chart' },
      h('figcaption', { class: 'gw-chart-head' }, h('b', { class: 'gw-title' }, c.title), kit.tag(c.flag, { tone: 'strong' })),
      h('div', { class: 'gw-plot' }, plot, plotLabels));

    // The channels as a small branch: UIUC first, then the two next groups.
    const BW = 460, BH = 172;
    const branchSvg = svg('svg', { class: 'gw-branch', viewBox: `0 0 ${BW} ${BH}`, width: String(BW), height: String(BH), role: 'img',
      'aria-label': `Channels: ${o.channels[0]} first, then ${o.channels.slice(1).join(' and ')}` },
      svg('path', { class: 'gw-branch-line', d: `M24 ${BH / 2} H96 C 150 ${BH / 2}, 140 30, 196 30` }),
      svg('path', { class: 'gw-branch-line', d: `M96 ${BH / 2} C 150 ${BH / 2}, 140 ${BH - 30}, 196 ${BH - 30}` }),
      svg('circle', { class: 'gw-branch-root', cx: 24, cy: BH / 2, r: 15 }),
      svg('circle', { class: 'gw-branch-leaf', cx: 196, cy: 30, r: 11 }),
      svg('circle', { class: 'gw-branch-leaf', cx: 196, cy: BH - 30, r: 11 }));
    const branch = h('div', { class: 'gw-branch-wrap' }, branchSvg, overlay(h, 'gw-branch-labels', BW, BH, [
      { x: 24, y: BH / 2 + 40, anchor: 'start', cls: 'gw-branch-root-label', text: o.channels[0] },
      { x: 220, y: 30, anchor: 'start', cls: 'gw-branch-label', text: o.channels[1] },
      { x: 220, y: BH - 30, anchor: 'start', cls: 'gw-branch-label', text: o.channels[2] },
    ].filter((it) => it.text)));

    // YC: a large, deliberate milestone card; an application goal, not acceptance or backing.
    const title = String(o.yc.title);
    const split = title.indexOf(' Summer');
    const yc = h('section', { class: 'gw-yc', 'aria-label': `${o.yc.title}, ${o.yc.label}` },
      h('div', { class: 'gw-yc-top' },
        h('img', { class: 'gw-yc-logo', src: o.yc.logo, alt: 'Y Combinator logo', width: '56', height: '56', decoding: 'async' }),
        kit.tag(o.yc.label, { className: 'gw-yc-tag' })),
      split > 0
        ? h('p', { class: 'gw-yc-title' }, title.slice(0, split), h('br'), title.slice(split + 1))
        : h('p', { class: 'gw-yc-title' }, title));

    return {
      head: oneLineHead(scene, kit),
      bodyClass: 'gw-body',
      body: h('div', { class: 'gw-grid' }, chart, h('div', { class: 'gw-side' }, yc, branch)),
    };
  };

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 13 · pricing: the proposed ladder; three value marks                                  */
  /* ------------------------------------------------------------------------------------------ */

  slides.pricing = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen;
    // Step heights: a common base plus a height in proportion to the monthly price (free, $7.50, $15).
    const price = (s) => {
      const f = String(s.figure).trim();
      return f.charAt(0) === '$' ? Number(f.slice(1).split('/')[0]) || 0 : 0;
    };
    const BASE = 176, PER_DOLLAR = 17;
    const ladder = h('ol', { class: 'pr-ladder', 'aria-label': o.label },
      o.ladder.map((s, i) => h('li', { class: `pr-step is-${i + 1}`, style: { '--h': `${BASE + price(s) * PER_DOLLAR}px`, '--i': String(i) } },
        h('span', { class: 'pr-block', 'aria-hidden': 'true' }),
        h('span', { class: 'pr-text' },
          h('b', { class: 'pr-figure' }, s.figure, s.unit ? h('span', { class: 'pr-unit' }, s.unit) : null),
          h('span', { class: 'pr-rest' }, s.rest)))));
    const values = h('ul', { class: 'pr-values' }, o.values.map((v) => h('li', null,
      h('span', { class: 'pr-value-icon', 'aria-hidden': 'true' }, kit.icon(v.icon, { size: 34 })),
      h('span', null, v.label))));
    return {
      head: oneLineHead(scene, kit),
      bodyClass: 'pr-body',
      body: [kit.tag(o.label, { tone: 'strong', className: 'pr-label' }), ladder, values],
    };
  };
})();
