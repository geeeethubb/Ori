// Group 6 · the layouts "velocity" (brief slide 14) and "ask" (brief slide 15). The signature close is built
// into pitch.js. Contract: docs/ori-pitch-kit/PITCH_INTEGRATION.md, "16-slide revision". This file only
// registers renderers; pitch.js calls each one once, as renderer(scene, kit), while it builds the deck.
// Styles: slides/g6-close.css. The drawings are inline SVG in the project's line style (round caps, the
// shared icon set for glyphs, one accent per drawing); they hold no text, so every word stays in the DOM.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  // One of the project's icons placed inside a drawing (a nested <svg> at x, y).
  const glyph = (kit, name, x, y, size, className) => {
    const el = kit.icon(name, { size, className });
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    return el;
  };
  const drawing = (kit, viewBox, className, ...children) => kit.svg('svg', {
    class: className, viewBox, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false',
  }, ...children);

  /* ---------------------------------------------------------------------------------------------- */
  /* Slide 14 · velocity: four question → decision stories, each drawing shows the decision           */
  /* ---------------------------------------------------------------------------------------------- */

  // 1. A branching path: one spark, one decision point, four honest outcomes (save, reuse, revise, create).
  function artBranch(kit) {
    const { svg } = kit;
    const ends = [
      { y: 40, icon: 'ui:bookmark' }, { y: 102, icon: 'ui:open' }, { y: 166, icon: 'ui:pencil' }, { y: 228, icon: 'ui:plus' },
    ];
    return drawing(kit, '0 0 316 268', 'vl-svg',
      svg('circle', { class: 'vl-node', cx: '56', cy: '134', r: '32' }),
      glyph(kit, 'ui:sparkle', 40, 118, 32, 'vl-glyph'),
      svg('path', { class: 'vl-line vl-draw', d: 'M88 134H134', pathLength: '1' }),
      ...ends.map((e, i) => svg('path', {
        class: 'vl-branch vl-draw', d: `M150 134C188 134 182 ${e.y} 214 ${e.y}`, pathLength: '1', style: { '--i': String(i) },
      })),
      svg('circle', { class: 'vl-accent-fill vl-pop', cx: '146', cy: '134', r: '14' }),
      ...ends.map((e, i) => svg('g', { class: 'vl-end', style: { '--i': String(i) } },
        svg('rect', { class: 'vl-chip', x: '214', y: String(e.y - 23), width: '78', height: '46', rx: '15' }),
        glyph(kit, e.icon, 239, e.y - 14, 28, 'vl-glyph'))),
    );
  }

  // 2. A cursor completing an action: the app's own button pressed, the action done (a check), not a mockup.
  function artAction(kit) {
    const { svg } = kit;
    return drawing(kit, '0 0 316 268', 'vl-svg',
      svg('rect', { class: 'vl-screen', x: '78', y: '16', width: '152', height: '236', rx: '24' }),
      svg('rect', { class: 'vl-bar', x: '100', y: '42', width: '64', height: '11', rx: '5.5' }),
      svg('rect', { class: 'vl-bar-soft', x: '100', y: '72', width: '108', height: '12', rx: '6' }),
      svg('rect', { class: 'vl-bar-soft', x: '100', y: '94', width: '80', height: '12', rx: '6' }),
      svg('rect', { class: 'vl-field', x: '100', y: '120', width: '108', height: '40', rx: '11' }),
      svg('rect', { class: 'vl-accent-fill vl-press', x: '100', y: '178', width: '108', height: '50', rx: '16' }),
      glyph(kit, 'ui:check', 138, 187, 32, 'vl-glyph-on-accent vl-pop'),
      svg('circle', { class: 'vl-ripple', cx: '176', cy: '206', r: '20' }),
      svg('g', { class: 'vl-cursor', transform: 'translate(176 206)' },
        svg('path', { class: 'vl-pointer', d: 'M0 0V40L10.5 30.5L18 47L25.5 43.5L18 27.5H31.5Z' })),
    );
  }

  // 3. A record carried between two app views: the same entry (accent) in the old and the revised design,
  //    the revision's new field dashed.
  function artCarry(kit) {
    const { svg } = kit;
    const view = (x, revised) => svg('g', null,
      svg('rect', { class: 'vl-screen', x: String(x), y: '30', width: '120', height: '208', rx: '20' }),
      svg('rect', { class: 'vl-bar', x: String(x + 16), y: '48', width: '50', height: '10', rx: '5' }),
      svg('rect', { class: 'vl-field', x: String(x + 14), y: '150', width: '92', height: '24', rx: '8' }),
      revised ? svg('rect', { class: 'vl-field-new vl-pop', x: String(x + 14), y: '184', width: '92', height: '24', rx: '8' }) : null);
    const record = (x, className) => svg('g', { class: className },
      svg('rect', { class: 'vl-record', x: String(x + 14), y: '72', width: '92', height: '62', rx: '13' }),
      svg('rect', { class: 'vl-thumb', x: String(x + 23), y: '82', width: '40', height: '42', rx: '9' }),
      svg('path', { class: 'vl-thumb-line', d: `M${x + 27} 116L${x + 38} 103L${x + 46} 110L${x + 52} 104L${x + 59} 116` }),
      svg('rect', { class: 'vl-ink-bar', x: String(x + 70), y: '90', width: '26', height: '7', rx: '3.5' }),
      svg('rect', { class: 'vl-ink-bar', x: String(x + 70), y: '106', width: '18', height: '7', rx: '3.5' }));
    return drawing(kit, '0 0 316 268', 'vl-svg',
      view(10, false), view(186, true),
      record(10, 'vl-record-a'),
      svg('path', { class: 'vl-line vl-draw', d: 'M118 86C140 52 176 52 196 84', pathLength: '1' }),
      svg('path', { class: 'vl-head vl-pop', d: 'M184.6 79.8L197.4 86.2L198.6 71.9' }),
      record(186, 'vl-record-b vl-carry'));
  }

  // 4. A return arrow and a payment symbol: the loop back to the app leads to the payment test.
  function artReturn(kit) {
    const { svg } = kit;
    return drawing(kit, '0 0 316 268', 'vl-svg',
      svg('path', { class: 'vl-accent-stroke vl-draw', d: 'M228 78A96 96 0 1 1 88 78', pathLength: '1' }),
      svg('path', { class: 'vl-accent-head vl-pop', d: 'M80.7 72.6L95.5 70L93.9 84.9' }),
      svg('rect', { class: 'vl-screen', x: '116', y: '104', width: '84', height: '84', rx: '24' }),
      glyph(kit, 'app:aperture', 138, 126, 40, 'vl-glyph'),
      svg('g', { class: 'vl-pay vl-pop' },
        svg('circle', { class: 'vl-node', cx: '158', cy: '44', r: '32' }),
        glyph(kit, 'app:wallet', 141, 27, 34, 'vl-glyph')),
    );
  }

  const ART = [artBranch, artAction, artCarry, artReturn];
  // Each story has its own tone from the brand palette (blue, lilac, warm, lime): see g6-close.css, "Four tones".

  slides.velocity = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen;
    const story = (c, i) => h('li', { class: 'vl-story', style: { '--c': String(i) } },
      h('div', { class: 'vl-art', 'data-concept': c.concept }, (ART[i] || artBranch)(kit)),
      h('div', { class: 'vl-text' },
        h('p', { class: 'vl-q' }, kit.icon('ui:help', { size: 26, className: 'vl-q-icon' }), kit.sr('Question: '), c.question),
        h('span', { class: 'vl-resolve', 'aria-hidden': 'true' }, kit.icon('ui:arrowRight', { size: 26 })),
        h('p', { class: 'vl-d' }, kit.sr('Decision: '), c.decision)));
    const chain = (o.chain || []).map((c, i) => h('span', { class: 'vl-link', 'data-tone': String(i) }, h('b', null, c.step), h('small', null, c.note)));
    return {
      body: [
        h('ol', { class: 'vl-grid' }, o.cards.map(story)),
        h('p', { class: 'vl-chain' }, kit.arrowJoin(chain.length ? chain : o.supporting, (x) => (typeof x === 'string' ? h('span', { class: 'vl-link' }, h('b', null, x)) : x))),
      ],
      bodyClass: 'vl-body',
    };
  };

  /* ---------------------------------------------------------------------------------------------- */
  /* Slide 15 · ask (ink): the hero, the punchline, three uses over eight weeks, one line across        */
  /* ---------------------------------------------------------------------------------------------- */

  // A reliable product: a phone that holds up, with the check as its accent.
  function artReliable(kit) {
    const { svg } = kit;
    return drawing(kit, '0 0 448 150', 'ak-svg',
      svg('rect', { class: 'ak-stroke', x: '178', y: '10', width: '84', height: '132', rx: '18' }),
      svg('rect', { class: 'ak-soft-fill', x: '194', y: '30', width: '22', height: '22', rx: '7' }),
      svg('rect', { class: 'ak-soft-fill', x: '224', y: '30', width: '22', height: '22', rx: '7' }),
      svg('rect', { class: 'ak-soft-fill', x: '194', y: '60', width: '22', height: '22', rx: '7' }),
      svg('rect', { class: 'ak-soft-fill', x: '224', y: '60', width: '22', height: '22', rx: '7' }),
      svg('rect', { class: 'ak-soft-bar', x: '204', y: '122', width: '32', height: '6', rx: '3' }),
      svg('circle', { class: 'ak-lime-fill ak-pop', cx: '266', cy: '106', r: '26' }),
      svg('path', { class: 'ak-on-lime ak-pop', d: 'M254 106.5L262.5 115L279 98' }));
  }
  // A 50-person pilot: fifty people, one dot each.
  function artPilot(kit) {
    const { svg } = kit;
    const dots = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) {
      dots.push(svg('circle', { class: 'ak-dot', cx: String(107 + c * 26), cy: String(23 + r * 26), r: '8.5', style: { '--d': String(r * 10 + c) } }));
    }
    return drawing(kit, '0 0 448 150', 'ak-svg', ...dots);
  }
  // Context infrastructure (planned, not shipped): four sources (an AI chat, another AI, a photo app, the phone's
  // own pictures) on dashed lines into one phone, the lime spark where the context lands. Dashed because these
  // easier ways are still to build: today a person pastes a summary and no account is read.
  function artContext(kit) {
    const { svg } = kit;
    const sources = [
      { y: 21, icon: 'ui:agent' }, { y: 57, icon: 'ui:sparkle' }, { y: 93, icon: 'app:camera' }, { y: 129, icon: 'ui:image' },
    ];
    return drawing(kit, '0 0 448 150', 'ak-svg',
      ...sources.map((s, i) => svg('path', { class: 'ak-dash ak-feed', d: `M144 ${s.y}C206 ${s.y} 204 75 254 75`, style: { '--d': String(i) } })),
      ...sources.map((s, i) => svg('g', { class: 'ak-source', style: { '--d': String(i) } },
        svg('circle', { class: 'ak-source-ring', cx: '126', cy: String(s.y), r: '17' }),
        glyph(kit, s.icon, 116, s.y - 10, 20, 'ak-glyph'))),
      svg('rect', { class: 'ak-stroke', x: '258', y: '10', width: '84', height: '130', rx: '18' }),
      svg('rect', { class: 'ak-soft-bar', x: '284', y: '122', width: '32', height: '6', rx: '3' }),
      svg('circle', { class: 'ak-lime-fill ak-pop', cx: '300', cy: '68', r: '27' }),
      glyph(kit, 'ui:sparkle', 286, 54, 28, 'ak-on-lime-glyph ak-pop'));
  }

  slides.ask = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen;
    const ART_USES = [artReliable, artPilot, artContext];
    const [amount, ...rest] = String(o.hero).split('. ');
    const equity = rest.join('. ');
    const weeks = Number(String(o.timeline || '').match(/\d+/)?.[0] || 0);
    const ticks = [];
    for (let k = 0; k <= weeks; k++) ticks.push(svg('circle', { class: k === 0 || k === weeks ? 'ak-tick-end' : 'ak-tick', cx: String(8 + (k * 1104) / weeks), cy: '14', r: k === 0 || k === weeks ? '7' : '4.5' }));
    const bottom = String(o.bottomLine);
    const accentAt = o.bottomAccent ? bottom.lastIndexOf(o.bottomAccent) : -1;
    return {
      head: null,
      companion: false,
      bodyClass: 'ak-body',
      body: [
        h('div', { class: 'ak-top' },
          h('div', { class: 'ak-hero-block' },
            h('h2', { class: 'headline ak-hero' }, h('span', { class: 'ak-amount' }, `${amount}.`), ' ', h('span', { class: 'ak-equity' }, equity)),
            h('p', { class: 'ak-punchline' }, o.punchline)),
          kit.ori(scene.companion?.expression || 'Ready', { size: 176, className: 'ak-ori' })),
        h('div', { class: 'ak-uses' },
          weeks ? h('div', { class: 'ak-weeks' },
            h('span', { class: 'ak-weeks-label' }, o.timeline),
            drawing(kit, '0 0 1120 28', 'ak-weeks-line',
              svg('path', { class: 'ak-weeks-path', d: 'M8 14H1112', pathLength: '1' }), ...ticks)) : null,
          h('ul', { class: 'ak-use-list' }, o.uses.map((u, i) => h('li', { class: 'ak-use', style: { '--c': String(i) } },
            h('div', { class: 'ak-panel' }, (ART_USES[i] || artReliable)(kit)),
            h('div', { class: 'ak-use-text' },
              h('span', { class: 'ak-use-label' }, u.label),
              u.note ? h('span', { class: 'ak-use-note' }, u.note) : null))))),
        // The explicit next step (an invitation to partner, never an agreed partnership): one line, then what a
        // partnership would add, as three short chips. Falls back to the old bottom line without onScreen.next.
        o.next ? nextStep(kit, o.next) : h('p', { class: 'ak-bottom' }, accentAt > 0
          ? [bottom.slice(0, accentAt), h('span', { class: 'ak-bottom-accent' }, o.bottomAccent), bottom.slice(accentAt + o.bottomAccent.length)]
          : bottom),
      ],
    };
  };

  function nextStep(kit, n) {
    const { h } = kit;
    const line = String(n.line || '');
    const at = n.accent ? line.lastIndexOf(n.accent) : -1;
    return h('div', { class: 'ak-next' },
      h('p', { class: 'ak-next-head' },
        h('span', { class: 'ak-next-label' }, n.label),
        h('span', { class: 'ak-next-line' }, at > 0
          ? [line.slice(0, at), h('span', { class: 'ak-next-accent' }, n.accent), line.slice(at + n.accent.length)]
          : line)),
      h('ul', { class: 'ak-gives' }, (n.gives || []).map((g) => h('li', { class: 'ak-give' },
        h('span', { class: 'ak-give-icon', 'aria-hidden': 'true' }, kit.icon(g.icon, { size: 22 })),
        h('span', { class: 'ak-give-text' }, h('b', null, g.verb), ' ', g.what)))));
  }
})();
