// Slide 8 (market): TAM ⊃ SAM ⊃ SOM rings beside a dot map of the contiguous United States with the first places
// pinned. Loaded after g7-value.js, so this window.ORI_SLIDES.market replaces the older renderer there. Class names use
// the mk2- prefix so the older .layout-market .mk-* rules match nothing. Nothing here measures layout: the two SVGs share
// one height (540 units), so the dashed SOM link lines up across them at any scale. Copy and pins come from scenes.js.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  // A coarse outline of the contiguous United States as [lat, lon], clockwise from Cape Flattery: the Pacific coast, the
  // Mexico border and the Rio Grande, the Gulf coast and Florida, the Atlantic coast and New England, then the Canada
  // border west (Maine, 45°N, the St. Lawrence, the Great Lakes simplified, Lake Superior, 49°N) back to Puget Sound.
  const OUTLINE = [
    [48.38, -124.72], [46.25, -124.05], [44.6, -124.1], [42.85, -124.55], [40.44, -124.41], [38.95, -123.73],
    [37.8, -122.52], [36.6, -121.95], [34.45, -120.47], [34.03, -118.78], [32.53, -117.12],
    [32.72, -114.72], [31.33, -111.07], [31.33, -108.21], [31.78, -106.53], [30.65, -105.0], [29.6, -104.4],
    [28.98, -103.2], [29.75, -102.1], [29.35, -100.9], [28.7, -100.5], [27.5, -99.5], [25.95, -97.15],
    [27.8, -97.15], [28.6, -96.2], [29.3, -94.8], [29.75, -93.85], [29.1, -90.95], [29.05, -89.35],
    [30.35, -88.1], [30.4, -86.6], [29.7, -85.35], [30.05, -84.2], [29.15, -83.05], [27.85, -82.75],
    [26.6, -82.15], [25.85, -81.4], [25.15, -80.95], [25.5, -80.35], [26.7, -80.03], [28.45, -80.55], [30.4, -81.4],
    [31.95, -80.9], [32.75, -79.85], [33.85, -78.55], [34.6, -76.6], [35.25, -75.5], [36.85, -75.95], [38.8, -75.08],
    [39.35, -74.45], [40.5, -74.0], [41.05, -71.85], [41.6, -70.0], [42.35, -70.95], [43.6, -70.2], [44.35, -68.2],
    [44.82, -66.95],
    [45.15, -67.25], [47.07, -67.79], [47.45, -69.2], [46.4, -70.05], [45.0, -71.5], [45.0, -74.75], [44.15, -76.35],
    [43.3, -77.6], [43.25, -79.05], [42.15, -80.1], [41.5, -81.7], [41.65, -83.45], [42.3, -83.1], [43.0, -82.42],
    [44.0, -82.9], [45.05, -83.4], [45.78, -84.73], [44.9, -85.7], [43.8, -86.45], [41.75, -86.75], [41.6, -87.4],
    [42.0, -87.65], [43.0, -87.88], [45.1, -87.6], [45.75, -87.05], [45.87, -84.73], [46.5, -84.35], [46.77, -84.96],
    [46.55, -87.4], [47.45, -87.9], [46.6, -90.4], [46.75, -92.1], [47.75, -90.3], [48.0, -89.55], [48.6, -93.4],
    [49.0, -95.15], [49.0, -123.05], [48.2, -122.75], [48.1, -123.4],
  ];
  const COS38 = Math.cos((38 * Math.PI) / 180);
  const project = (lat, lon) => [(lon + 125) * COS38, 50 - lat];
  const insidePoly = (poly, x, y) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };

  // Both SVGs are 540 units tall. Rings: 540 x 540, bottom-aligned. Map: 860 x 540 at 18.4 units per projected degree.
  const H = 540, RW = 540, MW = 860, SCALE = 18.4, STEP = 0.5;
  const RINGS = [{ r: 268, cy: 270 }, { r: 182, cy: 356 }, { r: 100, cy: 434 }];
  const LINK_Y = RINGS[2].cy;
  // Label offsets from each pin (units): [dx, dy, text-anchor], so the close Midwest labels never collide.
  const PLACE = { Chicago: [-44, -44, 'end'], UIUC: [-50, 32, 'end'], Purdue: [42, -46, 'start'], 'Ohio State': [42, 30, 'start'], 'San Francisco': [30, 40, 'start'] };

  slides.market = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen || {};
    const cards = (o.cards || []).slice(0, 3);
    const pins = o.pins || [];

    // Rings: text-light shapes with large values; full title, math and note go to screen readers.
    const ringLines = [[48, 92, 120], [216, 258, 285], [400, 440, 467]];
    const rings = svg('svg', { class: 'mk2-rings', viewBox: `0 0 ${RW} ${H}`, 'aria-hidden': 'true', focusable: 'false' },
      RINGS.map((g, i) => svg('circle', { class: `mk2-ring mk2-ring-${i + 1}`, cx: RW / 2, cy: g.cy, r: g.r })),
      svg('path', { class: 'mk2-link', d: `M${RW / 2 + RINGS[2].r + 10} ${LINK_Y}H${RW + 14}` }),
      cards.map((c, i) => svg('g', { class: `mk2-ring-text mk2-ring-text-${i + 1}` },
        svg('text', { class: 'mk2-tag', x: RW / 2, y: ringLines[i][0] }, c.tag),
        svg('text', { class: 'mk2-value', x: RW / 2, y: ringLines[i][1] }, c.ring || c.value),
        c.short ? svg('text', { class: 'mk2-title', x: RW / 2, y: ringLines[i][2] }, c.short) : null)));

    // Map: a regular grid of dots kept inside the outline (tested at render time), then the pins and their labels.
    const poly = OUTLINE.map(([la, lo]) => project(la, lo));
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const ox = (MW - (maxX - minX) * SCALE) / 2 - minX * SCALE, oy = 40 - minY * SCALE;
    const at = (lat, lon) => { const [x, y] = project(lat, lon); return [ox + x * SCALE, oy + y * SCALE]; };
    let dots = '';
    for (let y = minY + STEP / 2; y < maxY; y += STEP) {
      for (let x = minX + STEP / 2; x < maxX; x += STEP) {
        if (insidePoly(poly, x, y)) dots += `M${(ox + x * SCALE).toFixed(1)} ${(oy + y * SCALE).toFixed(1)}h0`;
      }
    }
    const placed = pins.map((p) => {
      const [x, y] = at(p.lat, p.lon);
      const [dx, dy, anchor] = PLACE[p.name] || [30, -30, 'start'];
      return { ...p, x, y, dx, dy, anchor, start: p.kind === 'start' };
    });
    const first = placed.find((p) => p.start && p.name === 'UIUC') || placed.find((p) => p.start);
    const link = first ? svg('path', { class: 'mk2-link', d: `M-14 ${LINK_Y}C${first.x * 0.42} ${LINK_Y} ${first.x * 0.78} ${first.y + 110} ${(first.x - 9).toFixed(1)} ${(first.y + 12).toFixed(1)}` }) : null;
    const leader = (p) => {
      const len = Math.hypot(p.dx, p.dy) || 1, r0 = p.start ? 13 : 10;
      return svg('line', { class: 'mk2-leader', x1: (p.x + (p.dx / len) * r0).toFixed(1), y1: (p.y + (p.dy / len) * r0).toFixed(1), x2: (p.x + p.dx).toFixed(1), y2: (p.y + p.dy).toFixed(1) });
    };
    const startNames = placed.filter((p) => p.start).map((p) => p.name);
    const nextNames = placed.filter((p) => !p.start).map((p) => p.name);
    const legend = o.legend || { start: 'Start', next: 'Next' };
    const map = svg('svg', { class: 'mk2-map', viewBox: `0 0 ${MW} ${H}`, role: 'img', focusable: 'false',
      'aria-label': `Map of the contiguous United States. Start: ${startNames.join(' and ')}. Possible next places: ${nextNames.join(', ')}.` },
      svg('path', { class: 'mk2-dots', d: dots }),
      link,
      placed.map(leader),
      placed.map((p) => svg('circle', { class: p.start ? 'mk2-pin mk2-pin-start' : 'mk2-pin mk2-pin-next', cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: p.start ? 8.5 : 6.5 })),
      placed.map((p) => svg('text', { class: cls(p.start ? 'mk2-pin-label is-start' : 'mk2-pin-label is-next'), x: (p.x + p.dx + (p.anchor === 'end' ? -6 : 6)).toFixed(1), y: (p.y + p.dy).toFixed(1), 'text-anchor': p.anchor, 'dominant-baseline': 'central' }, p.name)),
      svg('g', { class: 'mk2-legend' },
        svg('circle', { class: 'mk2-pin mk2-pin-start', cx: 24, cy: 516, r: 8.5 }),
        svg('text', { class: 'mk2-legend-text', x: 40, y: 516, 'dominant-baseline': 'central' }, legend.start),
        svg('g', { class: 'mk2-legend-next' },
          svg('circle', { class: 'mk2-pin mk2-pin-next', cx: 112, cy: 516, r: 6.5 }),
          svg('text', { class: 'mk2-legend-text', x: 126, y: 516, 'dominant-baseline': 'central' }, legend.next))));
    function cls(...names) { return names.filter(Boolean).join(' '); }

    return {
      head: h('header', { class: 'scene-head mk2-head' }, kit.headline(scene), o.customer ? h('p', { class: 'mk2-customer' }, o.customer) : null),
      bodyClass: 'mk2-body',
      companion: false,
      body: [
        h('div', { class: 'mk2-graphic' },
          rings,
          map,
          cards.map((c) => kit.sr(`${c.tag} ${c.value}: ${c.title}, ${c.math}. ${c.note}.`))),
        h('p', { class: 'mk2-foot' },
          h('span', { class: 'mk2-footnote' }, o.footnoteShort || o.footnote, o.footnoteShort && o.footnote ? kit.sr(` ${o.footnote}`) : null),
          o.sources ? h('span', { class: 'mk2-sources' }, o.sourcesShort || o.sources, o.sourcesShort ? kit.sr(` (${o.sources})`) : null) : null),
      ],
    };
  };
})();
