// Group 3 · slides 6–8 (presented #5–#7): the layouts "create", "grow" and "features". Every recording is a media
// slot from config.js (kit.media), so the founder's new clips drop in without a layout change; the step pictures are
// crops of real product screenshots (media/stills, captured in Sample mode).
// Contract: docs/ori-pitch-kit/PITCH_INTEGRATION.md, "16-slide revision". This file only registers renderers;
// pitch.js calls each one once, as renderer(scene, kit), when it builds the deck. Styles: slides/g3-demos.css.
//
// One composition for the three demo slides: the recording fills the left of the stage at full height on a soft
// backdrop; the headline and a short visual story sit on the right. The story stays complete when the clip is
// paused or missing. When a slot has cue points (config.js), the step that matches the clip lights up as it plays
// (ori:cue) and a rail fills between the steps; with no cue points every step simply stays visible.
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});
  // Compact, accurate labels for the Sample-mode recordings (the brief's "Sample-mode recording").
  const SAMPLE_RECORDING = 'Recording · Sample mode';

  // The headline in the right column (the recording takes the full height on the left).
  const headCell = (scene, kit) => kit.h('header', { class: 'g3-head' }, kit.headline(scene));

  // The recording on its backdrop.
  const mediaCell = (kit, slot) => kit.h('div', { class: 'g3-media' }, kit.h('span', { class: 'g3-backdrop', 'aria-hidden': 'true' }), slot);

  // Steps that follow a slot's cue points: cue i lights step i; the rail fills from step to step with the clip.
  function followCues(kit, key, slotEl, list, items) {
    const setActive = (index) => {
      items.forEach((el, i) => {
        el.classList.toggle('is-active', i === index);
        el.classList.toggle('is-past', index > i);
      });
      list.classList.toggle('has-active', index >= 0);
    };
    slotEl.addEventListener('ori:cue', (event) => setActive(Number(event.detail && event.detail.index)));
    const control = kit.mediaControl(key);
    const video = control && control.video;
    if (!video) return;
    const update = () => {
      const cues = control.cues;
      if (cues.length < 2 || video.hidden) {
        list.style.setProperty('--fill', '0');
        list.classList.remove('has-fill');
        return;
      }
      const t = video.currentTime || 0;
      const last = Math.min(items.length, cues.length) - 1;
      let p = 0;
      for (let i = 0; i < last; i += 1) {
        if (t >= cues[i + 1]) p = (i + 1) / last;
        else {
          if (t > cues[i]) p = (i + (t - cues[i]) / (cues[i + 1] - cues[i])) / last;
          break;
        }
      }
      list.classList.add('has-fill');
      list.style.setProperty('--fill', Math.max(0, Math.min(1, p)).toFixed(4));
      if (t < cues[0]) setActive(-1);
    };
    for (const type of ['timeupdate', 'seeked', 'loadedmetadata', 'emptied']) video.addEventListener(type, update);
  }

  // A real screenshot cropped by CSS (no new image files): the frame shows the part named by the slide's class.
  const shot = (kit, src, alt, className) => kit.h('span', { class: kit.cls('g3-shot', className) }, kit.lazyImage(src, { alt, decoding: 'async' }));

  // ------------------------------------------------------------------------------------------------------------
  // Slide 6 · "From a thought to Light." The creation recording; three steps with real crops and a connecting line.
  slides.create = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const key = o.media || 'create';
    const slot = kit.media(key, { height: 664, label: o.mediaLabel || SAMPLE_RECORDING });
    const items = (o.steps || []).map((s, i) => h('li', { class: 'g3-step' },
      h('span', { class: 'g3-mark', 'aria-hidden': 'true' }, s.app ? kit.appIcon(s.app, { size: 44 }) : kit.icon(s.icon || 'sparkle', { size: 30 })),
      s.still ? shot(kit, s.still, s.alt || '', `crop-${i + 1}`) : null,
      h('div', { class: 'g3-step-text' },
        h('h3', null, kit.sr(`Step ${i + 1}: `), s.title),
        s.detail ? h('p', null, s.detail) : null)));
    const list = h('ol', { class: 'g3-steps cr-steps' }, items);
    followCues(kit, key, slot, list, items);
    return {
      head: null,
      bodyClass: 'g3-body',
      body: h('div', { class: 'g3-grid' },
        mediaCell(kit, slot),
        headCell(scene, kit),
        h('div', { class: 'g3-story' }, list, o.stillsLabel ? h('p', { class: 'g3-note' }, o.stillsLabel) : null)),
    };
  };

  // ------------------------------------------------------------------------------------------------------------
  // Slide 7 · "Your app grows with you." The use-and-revise recording; the loop; the same Light entry before and
  // after a change the person asked for (Tell Ori → Review → Update); the takeaway; the return by Light's own link.
  slides.grow = (scene, kit) => {
    const { h, svg } = kit;
    const o = scene.onScreen || {};
    const key = o.media || 'grow';
    const slot = kit.media(key, { height: 664, label: o.mediaLabel || SAMPLE_RECORDING });

    // The loop: three steps, then an arc back to the first ("again").
    const loopSteps = o.loop || [];
    const loop = h('div', { class: 'gr-loop' },
      h('ol', { class: 'gr-loop-steps' }, kit.arrowJoin(loopSteps, (text) => h('li', { class: 'gr-node' }, text))),
      h('div', { class: 'gr-loop-back', 'aria-hidden': 'true' },
        svg('svg', { viewBox: '0 0 600 64', preserveAspectRatio: 'none', class: 'gr-arc' },
          svg('path', { d: 'M 560 4 C 560 52, 520 56, 300 56 C 80 56, 40 52, 40 6', fill: 'none', 'vector-effect': 'non-scaling-stroke' }),
          svg('path', { d: 'M 28 18 L 40 4 L 52 18', fill: 'none', class: 'gr-arc-head', 'vector-effect': 'non-scaling-stroke' })),
        h('span', { class: 'gr-again' }, o.loopReturn || 'again')),
      kit.sr(`${o.loopReturn || 'again'}: back to ${loopSteps[0] || 'the start'}.`));

    const panel = (side, className) => h('figure', { class: kit.cls('gr-panel', className) },
      h('figcaption', { class: 'gr-panel-tag' }, side.label),
      h('span', { class: 'gr-shot-wrap' },
        h('span', { class: 'gr-frame' },
          shot(kit, side.still, side.alt || '', 'crop-entry'),
          className === 'is-after' ? h('span', { class: 'gr-new', 'aria-hidden': 'true' }) : null),
        className === 'is-after' && o.afterChip ? h('span', { class: 'gr-chip' }, o.afterChip) : null));

    const mechanism = h('ol', { class: 'gr-mech' }, (o.mechanism || []).map((text, i) => h('li', { class: 'gr-mech-step' },
      h('span', { class: 'gr-mech-icon', 'aria-hidden': 'true' }, kit.icon(['agent', 'sliders', 'check2'][i] || 'check2', { size: 22 })),
      h('span', null, text))));

    const ret = o.returnMedia ? h('div', { class: 'gr-return' },
      h('span', { class: 'gr-return-badge', 'aria-hidden': 'true' }, kit.icon('ui:link', { size: 20 })),
      kit.media(o.returnMedia, { height: 300, label: o.returnLabel || SAMPLE_RECORDING }),
      o.returnLine ? kit.sr(o.returnLine) : null) : null;

    const pair = h('div', { class: 'gr-pair' },
      panel(o.before || {}, 'is-before'),
      h('div', { class: 'gr-mech-col' }, o.ask ? h('p', { class: 'gr-ask' }, `“${o.ask}”`) : null, mechanism, h('span', { class: 'gr-mech-arrow', 'aria-hidden': 'true' }, kit.icon('arrowRight', { size: 34 }))),
      panel(o.after || {}, 'is-after'));

    return {
      head: null,
      bodyClass: 'g3-body',
      body: h('div', { class: 'g3-grid' },
        mediaCell(kit, slot),
        headCell(scene, kit),
        h('div', { class: 'g3-story gr-story' },
          loop,
          h('div', { class: 'gr-evidence' }, pair, o.stillsLabel ? h('p', { class: 'g3-note' }, o.stillsLabel) : null, ret),
          o.takeaway ? h('p', { class: 'gr-takeaway' }, o.takeaway) : null)),
    };
  };

  // ------------------------------------------------------------------------------------------------------------
  // Slide 8 · "Bring your context. Explore what could be yours." The founder's own recording (live AI) in the
  // context slot, and three steps that follow its cue points (0 s, 9.0 s, 15.9 s in config.js). Ori is drawn in the
  // second step, so the corner companion steps aside on this slide.
  slides.features = (scene, kit) => {
    const { h } = kit;
    const o = scene.onScreen || {};
    const key = o.media || 'context';
    const slot = kit.media(key, { height: 664 });
    const expression = (scene.companion && scene.companion.expression) || 'Found something';
    const items = (o.steps || []).map((s, i) => h('li', { class: 'g3-step' },
      h('span', { class: kit.cls('g3-mark', s.ori ? 'is-ori' : ''), 'aria-hidden': 'true' },
        s.ori ? kit.ori(expression, { size: 76, disc: false }) : kit.icon(s.icon || 'sparkle', { size: 34 })),
      h('div', { class: 'g3-step-text' },
        h('h3', null, kit.sr(`Step ${i + 1}: `), s.title),
        s.detail ? h('p', null, s.detail) : null)));
    const list = h('ol', { class: 'g3-steps ft-steps' }, items);
    followCues(kit, key, slot, list, items);
    return {
      head: null,
      bodyClass: 'g3-body',
      companion: false,
      body: h('div', { class: 'g3-grid ft-grid' },
        mediaCell(kit, slot),
        headCell(scene, kit),
        h('div', { class: 'g3-story' }, list)),
    };
  };
})();
