// Group 7 · the layouts "built", "whynow" and "market" (presented as #5, #7 and #8).
// This file only registers renderers; pitch.js calls each one once, as renderer(scene, kit), while it builds the
// deck hidden, so nothing here measures layout. Stage px on the 1600 x 900 design stage; flow-mode (phone)
// overrides live in slides/g7-value.css under .is-flow. Copy comes from scenes.js; the slides show the short
// forms (visual first) and keep the full wording for screen readers.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 5 · built: three real Sample-mode screenshots of one flow, the change given most space  */
  /* ------------------------------------------------------------------------------------------ */
  // The two Light entry stills are 780 x 1688 phone captures: each frame shows only the meaningful band
  // (top and bottom of the still, in still px), cropped in CSS so the source files stay untouched.
  const STILL_W = 780;
  const BUILT_CROPS = {
    'media/stills/light-entry-before.webp': [100, 1230],
    'media/stills/light-entry-after.webp': [400, 1530],
  };
  slides.built = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const steps = (o.steps || []).slice(0, 3);
    const panel = (s, i) => {
      const crop = BUILT_CROPS[s.still];
      const img = kit.lazyImage(s.still, { alt: s.alt || '', width: crop ? String(STILL_W) : null, height: crop ? '1688' : null });
      const frame = h('div', { class: 'bt-frame' },
        h('div', {
          class: kit.cls('bt-crop', crop ? 'is-cropped' : ''),
          style: crop ? { 'aspect-ratio': `${STILL_W} / ${crop[1] - crop[0]}`, '--bt-shift': `${(-(crop[0] / STILL_W) * 100).toFixed(3)}%` } : null,
        }, img,
        // The new fields (Camera, Shutter, Aperture) sit in this band of the after still: a soft highlight.
        s.chip ? h('span', { class: 'bt-new-band', 'aria-hidden': 'true' }) : null),
        s.chip ? h('span', { class: 'bt-chip' }, s.chip) : null);
      return h('figure', { class: `bt-step bt-step-${i + 1}` }, frame,
        h('figcaption', { class: 'bt-label' }, s.label || s.title, kit.sr(`: ${s.title}. ${s.detail}.`)));
    };
    return {
      bodyClass: 'bt-body',
      companion: false,
      body: [
        h('div', { class: 'bt-flow' }, kit.arrowJoin(steps, panel)),
        h('p', { class: 'bt-media-label' }, kit.tag(o.mediaLabel || 'Product screenshots · Sample mode')),
      ],
    };
  };

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 7 · whynow: the whole comparison on arrival (step 1), then the Ori panel pops up (step 2) */
  /* ------------------------------------------------------------------------------------------ */
  // FOUNDER DECISION (Nov 15, 12:45): arrival shows the comparison at once (the founder's own app, built with ChatGPT,
  // beside what others charge for one service each); ONE click pops up a big Ori panel, "Not just one tool. An entire
  // playground.", while the comparison dims behind it. No Ori price on this slide (it is on slide 12). Form and Fuel
  // is the founder's own app (never made in Ori, never an Ori feature). The pricing screenshots are crops; selecting
  // one shows the full page in an overlay that owns the keys while it is open.
  slides.whynow = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const ex = o.example || {};
    const pr = o.prices || {};
    const items = (pr.items || []).slice(0, 3);
    const play = o.playground || {};
    const proof = /^(\d+%)\s+(.*)$/.exec(o.proof || '');

    // The overlay: the full pricing page, legible on the stage. Escape, a navigation key or a click closes it; a key
    // that closes it never reaches the deck (no slide change), and leaving the scene closes it.
    const zoomImg = h('img', { class: 'wn-zoom-img', alt: '', decoding: 'async' });
    const zoomCaption = h('p', { class: 'wn-zoom-caption' });
    const zoomClose = h('button', { type: 'button', class: 'wn-zoom-close', 'aria-label': 'Close the full pricing page' }, kit.icon('ui:close', { size: 26 }));
    const overlay = h('div', { class: 'wn-zoom', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Full pricing page' },
      h('figure', { class: 'wn-zoom-figure' }, zoomImg, zoomCaption), zoomClose);
    let returnTo = null;
    const CLOSE_KEYS = ['Escape', 'ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Enter'];
    function onKey(e) {
      if (overlay.hidden || !CLOSE_KEYS.includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeZoom(true);
    }
    // A click anywhere (on the overlay, or on the deck around a letterboxed stage) closes it and does nothing else.
    function onDocClick(e) {
      if (overlay.hidden) return;
      e.preventDefault();
      e.stopPropagation();
      closeZoom(true);
    }
    function closeZoom(restoreFocus) {
      if (overlay.hidden) return;
      overlay.hidden = true;
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onDocClick, true);
      zoomImg.removeAttribute('src');
      if (restoreFocus) {
        const back = returnTo && returnTo.isConnected ? returnTo : document.getElementById('deck');
        if (back) back.focus({ preventScroll: true });
      }
      returnTo = null;
    }
    function openZoom(item, trigger, byKeyboard) {
      zoomImg.src = item.full || item.still;
      zoomImg.alt = item.alt || '';
      zoomCaption.textContent = `${item.name} · ${item.caption}`;
      overlay.hidden = false;
      returnTo = byKeyboard ? trigger : null;
      window.addEventListener('keydown', onKey, true);
      // Added after the opening click has passed the capture phase, so only a later click closes the overlay.
      document.addEventListener('click', onDocClick, true);
      zoomClose.focus({ preventScroll: true });
    }
    const zoomable = (item) => {
      const button = h('button', {
        type: 'button',
        class: 'wn-shot',
        'aria-label': `${item.name}, ${item.caption}: show the full pricing page`,
      }, kit.lazyImage(item.crop || item.still, { alt: '' }),
      h('span', { class: 'wn-shot-hint', 'aria-hidden': 'true' }, kit.icon('expand', { size: 18 })));
      button.addEventListener('click', (e) => openZoom(item, button, e.detail === 0));
      return button;
    };

    const head = h('header', { class: 'scene-head wn-head' },
      o.eyebrow ? h('p', { class: 'kit-label wn-eyebrow' }, o.eyebrow) : null,
      kit.headline(scene),
      proof ? h('p', { class: 'wn-proof' },
        h('b', { class: 'wn-stat' }, proof[1]),
        h('span', { class: 'wn-proof-text' }, ` ${proof[2]}`),
        o.proofSource ? h('span', { class: 'wn-source' }, o.proofSource) : null) : null);

    // Step 1 · the comparison, all at once. Left, the hero: the founder's own app, built with ChatGPT (the logo on
    // charcoal, then Plan · Track · Fuel, crops of the real screens). Right: three real pricing pages, one service each.
    const ownLabel = ex.label || 'Built with ChatGPT';
    const own = h('div', { class: 'wn-group wn-own' },
      h('p', { class: 'wn-group-label' }, ownLabel, ex.caption ? kit.sr(`: ${ex.caption}`) : null),
      h('ul', { class: 'wn-ff' },
        h('li', { class: 'wn-tile wn-logo-tile' }, kit.lazyImage(ex.logo, { alt: ex.logoAlt || '' })),
        (ex.panels || []).slice(0, 3).map((p) => h('li', { class: 'wn-tile wn-panel' },
          kit.lazyImage(p.crop || p.still, { alt: p.alt || '' }),
          h('span', { class: 'wn-panel-label' }, p.label, kit.sr(`: ${p.caption}`))))));
    const paid = h('div', { class: 'wn-group wn-paid' },
      h('p', { class: 'wn-group-label' }, pr.title || 'One service each'),
      h('ul', { class: 'wn-sellers' }, items.map((it) => {
        const [price, what] = String(it.short || it.caption || '').split(' · ');
        return h('li', { class: 'wn-seller' },
          zoomable(it),
          h('div', { class: 'wn-seller-text' },
            h('p', { class: 'wn-brand' }, it.name),
            h('p', { class: 'wn-price' }, price, what ? h('span', { class: 'wn-what' }, kit.sr(' · '), what) : null),
            it.caption ? kit.sr(` (${it.caption})`) : null));
      })));
    const compare = h('div', { class: 'wn-compare' }, own, h('span', { class: 'wn-vs' }, 'vs'), paid);

    // Step 2 · the Ori panel pops up over the comparison (which dims behind it): Ori, a playful cluster of personal
    // apps with room for more, and the one-liner. No price here.
    const apps = (play.apps || ['light', 'riff', 'people']).slice(0, 3);
    const panel = kit.reveal(h('div', { class: 'wn-ori' },
      h('div', { class: 'wn-crew', role: 'img', 'aria-label': play.alt || 'Ori, with a few of your personal apps and room for more' },
        kit.ori('Ready', { size: 220, className: 'wn-ori-face' }),
        apps.map((a, i) => h('span', { class: `wn-crew-app wn-crew-${i + 1}` }, kit.appIcon(a, { size: 88 }))),
        h('span', { class: 'wn-crew-app wn-crew-more' }, kit.icon('ui:plus', { size: 38, strokeWidth: 2.8 }))),
      h('p', { class: 'wn-line' },
        h('span', { class: 'wn-line-1' }, play.line || 'Not just one tool.'),
        ' ',
        h('span', { class: 'wn-line-2' }, play.accent || 'An entire playground.'))), 2);

    return {
      head,
      bodyClass: 'wn-body',
      className: (typeof kit.reducedMotion === 'function' ? kit.reducedMotion() : kit.reducedMotion) ? 'wn-still' : '',
      companion: false,
      steps: 2,
      stepLabels: [`${ownLabel} vs ${(pr.title || 'one service each').toLowerCase()}`, `Ori: ${play.line || 'Not just one tool.'} ${play.accent || 'An entire playground.'}`],
      body: [h('div', { class: 'wn-arena' }, compare, panel), overlay],
      onStep: () => closeZoom(false),
      onLeave: () => closeZoom(false),
    };
  };

  /* ------------------------------------------------------------------------------------------ */
  /* Slide 8 · market: TAM ⊃ SAM ⊃ SOM as nested rings, SOM tied to the local first market          */
  /* ------------------------------------------------------------------------------------------ */
  slides.market = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const cards = (o.cards || []).slice(0, 3);
    const ringText = (c) => h('div', { class: 'mk-ring-text' },
      h('p', { class: 'mk-tag' }, c.tag),
      h('p', { class: 'mk-value' }, c.value),
      c.short ? h('p', { class: 'mk-title' }, c.short) : null,
      kit.sr(` ${c.title}: ${c.math}. ${c.note}.`));
    // The rings are text-free shapes (bottom-aligned, so SOM sits inside SAM inside TAM); each label sits in its band.
    const inner = [
      cards.map((c, i) => h('span', { class: `mk-ring mk-ring-${i + 1}`, 'aria-hidden': 'true' })),
      cards.map((c, i) => h('div', { class: `mk-band mk-band-${i + 1}` }, ringText(c))),
    ];
    const localIcons = ['app:graduation', 'ui:pin'];
    return {
      head: h('header', { class: 'scene-head mk-head' }, kit.headline(scene), o.customer ? h('p', { class: 'mk-customer' }, o.customer) : null),
      bodyClass: 'mk-body',
      companion: false,
      body: [
        h('div', { class: 'mk-graphic' },
          h('div', { class: 'mk-rings' }, inner),
          h('div', { class: 'mk-local' },
            h('span', { class: 'mk-link', 'aria-hidden': 'true' }),
            h('ul', { class: 'mk-local-list' }, (o.local || []).map((place, i) => h('li', { class: 'mk-place' },
              h('span', { class: 'mk-place-icon', 'aria-hidden': 'true' }, kit.icon(localIcons[i] || 'ui:pin', { size: 30 })),
              h('span', null, place)))))),
        h('p', { class: 'mk-foot' },
          h('span', { class: 'mk-footnote' }, o.footnoteShort || o.footnote, o.footnoteShort && o.footnote ? kit.sr(` ${o.footnote}`) : null),
          o.sources ? h('span', { class: 'mk-sources' }, o.sourcesShort || o.sources, o.sourcesShort ? kit.sr(` (${o.sources})`) : null) : null),
      ],
    };
  };
})();
