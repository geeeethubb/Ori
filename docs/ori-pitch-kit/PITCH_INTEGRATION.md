# Ori pitch: integration notes

## Final round (November 15, 2026): what changed

The final-round deck keeps **15 presented scenes, now 230 seconds (3:50)**, in this order: promise, discovery,
journey, feeling, **built** (old create + grow merged; `#create`, `#grow`, `#use-revise` and `#reopen` open it),
zones (unchanged), **whynow** (Form and Fuel as an independently built example, with labeled price references),
**market** (the model, with its footnote), position, founder (a four-step click-through: Warm introduction → One
useful personal app → Later-day use → Referral), growth, pricing, velocity, ask, signature. Budgets
15/18/8/12/21/13/30/18/12/28/12/9/15/12/7. Slides stay highly visual: as little on-slide text as possible.

- **No video on the main path.** All four recordings (01-create, 02-use-and-revise, 03-reopen and the founder's
  ori-context-demo) play only in the appendix's demo section (`#appendix-demo`): poster, MP4 then WebM, controls,
  `preload="none"`, never autoplay; they pause when the appendix closes or the deck navigates. The retired
  `#features` hash opens that section. The config.js media slots point at the same files.
- **Appendix additions only** (no rebuild): the identity board (`assets/ori/identity-board.png`, “Meet Ori — a
  little companion”) in section 12; sources M1–M4, W1–W2 and P1–P3 in section 1; the market model (TAM, SAM, SOM)
  and the price references in section 9.
- **Slide 15** gains a small, quiet “Appendix” button (bottom right; keyboard accessible) that opens the appendix
  like the bar's Appendix button. Next on 15 does nothing further.
- **Checks:** `scripts/check-pitch.mjs` (no main-path video, the four appendix clips, old hashes, the closing slide
  with its Appendix link, 230 s), `scripts/check-pitch-density.mjs` (whynow 70 words, market 60 with the map labels,
  founder 70, built the default 35) and `tests/unit/pitch-route.test.ts` (the new ids, layouts and budgets; the appendix clips, board and sources).

The sections below describe the earlier revisions and remain the reference for the engine and the kit.

The Kearney hackathon pitch is a standalone static page, served by the Ori site at **`/pitch/`** (outside the
app shell). It tells the story of `ORI_PITCH_REVISION_BRIEF.md` in **15 presented scenes and 238 seconds
(3:58)**. The brief is the authority for this revision and overrides the older pitch documents where they
conflict (`ORI_PITCH_STORYTELLING.md`, `ORI_PITCH_COMMERCIAL_ADDENDUM.md`, `ORI_PITCH_EXPRESSION_ADDENDUM.md`
remain the history and the evidence rules). Product claims follow `PRODUCT_FACTS.md`.

**Founder decisions on top of the brief (November 15, 2026):**

- **The brief's slide 2 is not presented.** “Wanting is only the beginning.” (the research evidence) takes too
  much time, so it lives in the appendix as **“Research behind this”** (`#appendix-research`, a panel at the top
  of section 1, Sources), with both findings, the takeaway and the scope notes worded as the brief words the
  slide. The discovery slide's notes and the appendix contents link to it; the old hashes `#evidence` and
  `#research` open it. Its 12 seconds were not redistributed: the talk is shorter.
- **Numbering:** the brief's slide 1 is presented #1; from the brief's slide 3 on, **presented number = brief
  number − 1** (the brief's slide 8 is #7, its slide 16 is #15, the final signature/QR/contact slide).
- **The brief's slide 8 (presented #7) runs 25 s** for the founder's own recording
  (`media/ori-context-demo.mp4`/`.webm`, 23.65 s, portrait 464 × 832, labelled “Recorded product demo · Live
  AI”): one prominent clip in the `context` slot with three steps following its cue points (0 s Bring your
  context · 9.0 s Ori connects the dots · 15.9 s Explore what fits you). The `playground` slot is retired from
  that slide. The wiring belongs to group 3 (`config.js`, `slides/g3-demos.*`).

## Where things are

| Path | Role |
| --- | --- |
| `client/public/pitch/index.html` | Page shell: top bar, deck, controls, and the overview, notes, setup and appendix dialogs. The appendix (12 sections: sources, discovery, stages, demo, foundations, positioning, pilot, growth, pricing, Velocity, ask, expressions) is static HTML here. Links every script and stylesheet with a `?v=` version. |
| `client/public/pitch/scenes.js` | **The single scene data source**: id, aliases, label, headline, accent, seconds, theme, companion, layout, owning group, on-screen copy, spoken track, stage cue and appendix links for all 15 presented scenes, plus the appendix section names (`ORI_APPENDIX_SECTIONS`). Slides, overview, progress, labels, hashes, notes and timing all come from it. |
| `client/public/pitch/config.js` | Published settings: presenter, `githubUrl`, `productUrl`, and the **media slots** (below). |
| `client/public/pitch/pitch.js` | The engine: the kit (`window.ORI_KIT`), the renderer registry lookup, the 1600 × 900 stage and its fit, step reveals, media slots, slide 1 and the final slide (#15), navigation, overview, notes with the spoken-word estimate, timer, appendix, companion, presentation mode, keyboard and hashes. No dependencies and no calls to any server. Exposes `window.ORI_PITCH_TIMING` and `window.ORI_DECK`. |
| `client/public/pitch/style.css` | Tokens, the stage and flow modes, the kit's components, slide 1 and the final slide, presentation mode, dialogs (including the appendix's research panel, `.research-panel`), reduced motion, print. |
| `client/public/pitch/slides/g1-evidence.js` + `.css` … `g6-close.js` + `.css` | The six slide groups (presented slides 2–14), one renderer per layout. The `evidence` layout in g1 is no longer used by a scene. |
| `client/public/pitch/media/` | The three real recordings (MP4 + WebM + poster each) and `media/stills/`: real product screenshots with `stills.json` (what each shows, its slide, size, whether Sample-mode content is visible). |
| `client/public/pitch/assets/` | `ori/` (the four companion expressions, wordmarks, app icons, favicon from the canonical art), `fonts/`, `yc-logo.png`, `qr-ori.png` (the founder's QR code, byte-identical to `docs/ori-pitch-kit/assets/qr-ori.png`), `icons.js` (the project's icon set for `kit.icon`). |
| `scripts/build-pitch-assets.mts` | Re-runnable (`npx tsx scripts/build-pitch-assets.mts`): writes the companion expressions, wordmarks, icons, favicon, fonts with their OFL licences, copies the YC mark and the QR code, and generates `assets/icons.js` from `shared/icons.ts` (`ICON_PATHS`) and `client/src/components/ui.tsx` (`Icons`). Re-run after any of those sources change. |
| `scripts/check-pitch.mjs` | The judge-view check in Chromium and Edge (below). |
| `server/index.ts`, `vite.config.ts` | The `/pitch` routes in production and in `npm run dev`. |
| `tests/unit/pitch-route.test.ts` | Route tests (redirect, caching, video byte ranges, nested folders, 404s, the SPA untouched) and the deck's data (15 presented scenes and their 238 s of budgets, the research panel in the appendix, the closing slide's exact content, a renderer per layout, every media file present). |
| `docs/ori-pitch-kit/REHEARSAL.md` | The timing estimate (word counts against the budgets; not a spoken run). |

Vite copies `client/public/` into the built client, so the deck ships as `dist/client/pitch/` with every
`npm run build`. Nothing is bundled for it. Any static host also works: `python -m http.server <port>
--directory client/public/pitch`. (No separate export script exists in this repository.)

## Routes (Ori server)

- `GET /pitch` → `301` to `/pitch/`, keeping the query string. Browsers keep the fragment, so `/pitch#4` lands on `/pitch/#4`.
- `GET /pitch/` and `/pitch/index.html` → the deck, `Cache-Control: no-store` (so is `config.js`).
- `GET /pitch/<file>` (nested folders included) → static files, `Cache-Control: public, max-age=300`. Recordings are `video/mp4` and `video/webm` with byte ranges (`206`), which Safari and iPhones need. Because scripts and styles cache for five minutes, `index.html` links them with `?v=16.1`: **change that version whenever you publish** so a browser never mixes an old engine with new scene data.
- A missing `/pitch/*` file → `404 Not found`, never the app's `index.html`. Encoded traversal (`..%2f`) is refused.
- Every other route is unchanged. The deck calls no API.

## The story on screen

| # | Brief | Label | Headline (on screen) | Seconds | Ends at | Layout · owner | Theme | Ori |
| ---: | ---: | --- | --- | ---: | ---: | --- | --- | --- |
| 1 | 1 | Promise | Your phone, your story. | 7 | 0:07 | promise · core | light | Ready, corner, large |
| — | 2 | Evidence and takeaway (appendix only: “Research behind this”) | Wanting is only the beginning. | — | — | not presented | — | — |
| 2 | 3 | Discovery and a friend’s insight | Do you struggle to turn your ideas into something consistent? | 19 | 0:26 | discovery · g1 | light | Listening, corner |
| 3 | 4 | Five stages, one Ori | There is work between a spark and a habit. | 17 | 0:43 | journey · g2 (5 steps) | light | Ready, in the slide |
| 4 | 5 | Feeling to app | A feeling can become an app. | 14 | 0:57 | feeling · g2 | light | Listening, in the slide |
| 5 | 6 | Create Light | From a thought to Light. | 26 | 1:23 | create · g3 | light | Found something, corner |
| 6 | 7 | Light grows with you | Your app grows with you. | 26 | 1:49 | grow · g3 | light | Ready, corner |
| 7 | 8 | Context and Playground | Bring your context. Explore what could be yours. | 25 | 2:14 | features · g3 (the founder's recording) | light | Found something, in the slide (step 2) |
| 8 | 9 | Interests and workflows | What you love. What you need to get done. | 13 | 2:27 | zones · g4 | light | Found something, in the slide |
| 9 | 10 | Competitor map | Personal context, turned into everyday apps. | 16 | 2:43 | position · g4 | light | Found something, in the slide |
| 10 | 11 | Founder and pilot | I’m building with the community I already know. | 19 | 3:02 | founder · g5 | light | Listening, corner |
| 11 | 12 | Growth goal | Start at UIUC. Grow from there. | 12 | 3:14 | growth · g5 | light | Found something, corner |
| 12 | 13 | Pricing | Try it. Make it yours. Keep it. | 10 | 3:24 | pricing · g5 | light | Thinking, corner |
| 13 | 14 | Velocity AI | Velocity helped us ask better questions. | 15 | 3:39 | velocity · g6 | light | Thinking, corner |
| 14 | 15 | The ask | $10,000. 0% equity. | 12 | 3:51 | ask · g6 | ink | Ready, in the slide (176 px) |
| 15 | 16 | Signature and Q&A | Ori. Your phone, your story. | 7 | 3:58 | signature · core | ink | none |
| | | | **Total** | **238** | **3:58** | | | |

- Hashes: `#1`–`#15`, scene ids (`#velocity`) and aliases of the older decks' ids (`#stages`, `#bring`, `#use-revise`, `#reopen`, `#why`, `#foundation`, `#gtm`, `#roadmap`, `#business`); each becomes its canonical `#n`. `#appendix` and `#appendix-<section>` open the appendix; the retired scene's `#evidence` and `#research` open `#appendix-research`.
- The timer's target is 3:58 (`TARGET_SECONDS = 238`, `EXPECTED_SCENES = 15` in `pitch.js`); the notes show each scene's budget and planned window from the data.
- The final slide (#15), as the founder revised it on 2026-11-15: the ori wordmark over “Your phone, your story.” (no “Ori.” before it: the wordmark already names Ori; the spoken track opens with the same line), Zuyu Liu · `mailto:zliu2017@illinois.edu` · `tel:+18479622868`, the QR code (linking to `https://ori-fjrx.onrender.com/`, no visible URL) with Ori's happy face (the Ready art) and “Try Ori now” under it. No corner companion; in presentation mode no bars over it (keys still work). The full invitation (“Scan the code, create your own account, and try Ori.”) is spoken, from the notes. Next on #14 reaches #15; #15 stays up for Q&A.

## 16-slide revision: the contract for slide authors

### Ownership and load order

| Slides | Layouts | Files | Owner |
| --- | --- | --- | --- |
| 1, 15 (brief 1, 16) | `promise`, `signature` | `pitch.js` (`R.promise`, `R.signature`), `style.css` | foundation |
| 2 (brief 3; brief 2 is appendix only) | `discovery` (`evidence` unused) | `slides/g1-evidence.js`, `slides/g1-evidence.css` | group 1 |

The rows below keep the brief's slide numbers; the presented number is one lower.
| 4–5 | `journey`, `feeling` | `slides/g2-journey.js`, `.css` | group 2 |
| 6–8 | `create`, `grow`, `features` | `slides/g3-demos.js`, `.css` | group 3 |
| 9–10 | `zones`, `position` | `slides/g4-position.js`, `.css` | group 4 |
| 11–13 | `founder`, `growth`, `pricing` | `slides/g5-growth.js`, `.css` | group 5 |
| 14–15 | `velocity`, `ask` | `slides/g6-close.js`, `.css` | group 6 |

`index.html` links `style.css` and then the six group stylesheets, and these deferred scripts in order:
`config.js`, `scenes.js`, `assets/icons.js`, `slides/g1-evidence.js` … `slides/g6-close.js`, `pitch.js`. A group
file only registers renderers; `pitch.js` builds the deck once every script has run. Each group file starts as
a working draft that shows the brief's copy and a dashed `kit.placeholder` marker; replace the draft and remove
the marker. Group agents edit only their own `slides/` files and, with targeted edits, the `onScreen` data of
their own scenes in `scenes.js` (the deck's files use LF line endings). `pitch.js`, `style.css`, `index.html` and `config.js` belong
to the foundation: if the kit lacks something, build it in your own file and report it.

### The registry

```js
(() => {
  const slides = (window.ORI_SLIDES = window.ORI_SLIDES || {});
  slides.evidence = (scene, kit) => ({
    head: undefined,     // undefined: the default header (kit.head(scene)); null: none; a Node: your own
    body: [/* Node or Node[]: the composition, required */],
    bodyClass: '',       // extra classes on .scene-body
    className: '',       // extra classes on the slide <section>
    steps: 1,            // build states (see step reveals); 1 = no build
    stepLabels: [],      // what to announce at each step (screen readers)
    onEnter(ctx) {},     // the scene became current (measure layout here, not while rendering)
    onLeave(ctx) {},     // it stopped being current
    onStep(step, ctx) {},// the step changed (also on every arrival)
    companion: false,    // optional: hide the corner companion on this slide
  });
})();
```

`window.ORI_SLIDES[layout]` is consulted before `pitch.js`'s built-in renderers. Each renderer runs once per scene
while all slides are built (hidden), so it must not measure layout. A renderer that throws logs a console error
and its slide shows the placeholder; returning a Node or an array is accepted as the body.
`ctx` = `{ scene, index, slide, stage, step, steps, via, reducedMotion, flow, kit }` (`via`: `next`,
`previous`, `jump`, `step` or `show-all`).

### The DOM

```
section.slide.layout-<layout>.scene-<id>.theme-light|.theme-ink[.has-companion][.is-building]#scene-<id>
        [data-index (0-based), data-layout, data-step, data-steps]
  div.stage                      the 1600 × 900 design stage, scaled
    div.scene                    padding = the safe area; a flex column
      header.scene-head          (or your head)
      div.scene-body             flex column, centred (safe centre: never pushed under the head)
    div.companion                the corner companion, when shown
    div.media-lightbox           created when a slot is expanded
html.is-stage | html.is-flow     body.in-presentation · body.chrome-peek · body.on-ink · body[data-scene]
```

Scope every rule under `.layout-<layout>`; never style another group's layout or the kit's classes globally.

### Stage, fit and safe area

- **One fit strategy for every scene:** each scene is laid out on a **1600 × 900 px design stage** and scaled
  as a whole (`--stage-scale` = the smaller of deck width ÷ 1600 and deck height ÷ 900), centred and
  letterboxed in the slide's background colour. Write every size in stage px. Never use `vw`, `vh` or
  viewport percentages inside a slide, `position: fixed`, or a transform on `.stage`/`.scene`.
- **Measured scales:** 1366 × 768: 0.736 (page) / 0.853 (presentation); 1600 × 900: 0.862 / 1.000;
  1920 × 1080: 1.062 / 1.200. In presentation mode the stage fills the screen.
- **Safe area:** 64 px top, 88 px left and right, 56 px bottom → a **1424 × 780 px** content box. A one-line
  64 px headline takes about 67 px; the body then has about 713 px (`.scene-body` has 28 px top padding;
  set your own with `bodyClass` or a scoped rule). The corner companion is 88 × 88 at top 48, right 88
  (176 px on slide 1); `.has-companion .scene-head` reserves 120 px on the right. In presentation mode the
  bars appear over the bottom 60 px and top 64 px only while the pointer moves.
- **Minimum text:** 16 px on the stage (about 11.8 px at the smallest page scale).
- **No vertical overflow, ever, on desktop:** nothing may leave the stage and `.scene` must not scroll.
  `scripts/check-pitch.mjs` checks every scene at 1366 × 768, 1600 × 900 and 1920 × 1080, in the page and in
  presentation mode.
- **Flow mode (phones):** `(max-width: 767px), (max-height: 499px), (max-width: 1100px) and (orientation:
  portrait)` switch `html` to `.is-flow`: no scaling, the scene scrolls vertically (padding 22 / 16 px), the
  companion is 48 px. Write phone rules under `.is-flow .layout-<layout>` (stacked, 13–38 px type). Nothing
  may scroll sideways (checked at 768 × 1024, 390 × 844 and 320 × 568).

### Type scale and colour tokens

Type (stage px): `--fs-hero` 112 · `--fs-display` 96 · `--fs-h1` 64 (headlines) · `--fs-h2` 44 · `--fs-h3` 32 ·
`--fs-lead` 28 · `--fs-body` 24 · `--fs-small` 20 · `--fs-label` 16. Fonts: `--font-display` (Manrope, 800 for
headlines, letter-spacing about −0.045em) and `--font-body` (DM Sans), both self-hosted.

Brand colours: `--canvas` #f7f8fc · `--surface` #fff · `--ink` #162039 · `--ink-2` #1f2b4d · `--ink-3` #2a3556 ·
`--muted` #59617a · `--line` #dce0ec · `--line-2` #c9cedd · `--blue` #3147f2 · `--blue-ink` #2436c9 ·
`--blue-soft` #e8ebff · `--blue-on-ink` #9ba7ff · `--lime` #dfff76 · `--lilac` #dbcbff · `--lilac-soft` #f1eaff ·
`--orange` #ff6a3d · `--orange-ink` #9a2e0e · `--warm` #ffeadf · `--paper` #faf8f4 · `--charcoal` #181a1f ·
`--on-ink` #fff · `--on-ink-muted` #b7bfd8 · `--on-ink-line` rgba(255,255,255,.16).

Semantic tokens switch with the theme; use them so a composition works on either: `--slide-bg`, `--fg`,
`--fg-muted`, `--accent` (blue on light, lime on ink), `--accent-strong`, `--rule`, `--card`, `--bezel`.
Contrast (WCAG): ink on canvas about 15:1; muted on canvas 5.8:1; blue on canvas 6.0:1; `--on-ink-muted` on
ink 8.8:1; lime on ink 14.4:1. Lime text on a light background fails: use lime only as a fill there.

**The ink scene treatment** (`theme: 'ink'` in scenes.js: presented #14 and #15, the brief's 15 and 16; the appendix's research panel keeps the brief's ink look for slide 2): the ink background fills the
whole slide including the letterbox; white type; `--fg-muted` for secondary text; lime for emphasis (the
headline accent turns lime by itself); blue only as an accent (`--blue-on-ink` for blue text); never a
saturated-blue background; links and focus rings are lime.

### The kit (`window.ORI_KIT`, also passed as `kit`)

| Function | What it gives you |
| --- | --- |
| `h(tag, attrs, ...children)`, `svg(...)`, `sr(text)`, `cls(...names)` | DOM builders (`attrs`: strings, `true`, `style: {}` with custom properties, `onclick`); a screen-reader-only span; a class list. |
| `headline(scene, { tag, className, break })`, `head(scene, ...extra)` | The headline with `scene.accent` in the accent colour (a new sentence before the accent starts a new line unless `break: false`); the default header. |
| `tag(text, { tone })` (alias `label`) | A compact qualifier: “Goal”, “Proposed pricing”, “Product positioning”, “Illustration”. `tone`: quiet (default), `strong` (ink on lime), `outline`. |
| `sectionLabel(scene)` | A small, optional label with the scene's short name (slides carry no eyebrows by default). |
| `appendixLink(id, text, ariaLabel)`, `sourceLink(href, text)` | A link that opens an appendix section; an external source link (new tab, announced). |
| `flow(items, { className, render })`, `arrowJoin(items, render)` | Steps joined by the project's arrow icon (“, then” for screen readers). |
| `icon(name, { size, className, title, strokeWidth })`, `hasIcon(name)` | The project's icon set, 24 × 24 line glyphs in `currentColor`: every `shared/icons.ts` app glyph (camera, pen, board, music, checklist, map, book, heart, leaf, star, people, calendar, chart, mic, palette, bike, coffee, lightbulb, target, globe, compass, sparkle, home, sun, dumbbell, plant, film, wallet, guitar, timer, headphones, waveform, aperture, image, bookmark, link, disc, piano, contact, footprints, mountain, waves, flame, trophy, plane, utensils, graduation, rocket, puzzle, binoculars, brush, flower, kanban, notebook, checks, levels) and the product's UI glyphs (sparkle, grid, person, back, plus, gear, share, check, close, agent, playground, tag, logout, image, link, paperclip, send, play, pause, reset, timer, camera, upload, external, trash, more, check2, pin, pinOff, archive, refresh, chevronDown, chevronRight, arrowRight, download, bookmark, sun, pencil, compass, sliders, help, clock, open, inbox, history, phone, copy, moreVertical, squarePlus), plus `expand` and `collapse`. Prefix `app:` or `ui:` to pick a set. No emoji. |
| `appIcon(app, { size })` | Light, Riff or People's canonical icon. |
| `ori(expression, { size, disc, label })`, `expressions` | The canonical companion art inside a composition: `Listening`, `Thinking`, `Found something`, `Ready` (on its lilac disc unless `disc: false`). Use the scene's `companion.expression`. |
| `media(key, options)`, `mediaControl(key)` | A media slot and its controller (below). |
| `still(src, { alt, label })`, `lazyImage(src, attrs)` | A real screenshot with its compact label (default “Product screenshot”); an image that downloads only when its scene is current or next. |
| `reveal(el, step, { ghost })`, `setStep(n)`, `showAll()` | Step reveals (below). |
| `placeholder(scene, note)` | The foundation's draft marker. |
| `reducedMotion()`, `isFlow()`, `scale()`, `stage`, `config`, `scenes`, `formatNumber`, `pad2`, `clock` | State and helpers. |

### Step reveals

- Return `steps: N` and mark elements with `kit.reveal(el, k)` (`data-reveal="k"`): hidden (opacity 0, 8 px
  down) until step k, or with `{ ghost: true }` dimmed to 0.14 and 6 px down: the original five-stage rhythm
  (0.35 s transitions). Style further with `.slide.is-building`, `[data-step]`, `.is-revealed` or `onStep`.
- Arriving with Next (→, Space, PageDown, the Next button) from the scene before starts at step 1; each Next
  reveals one step; at step N the next Next moves on. Any other arrival (a hash, the overview, a dot, Previous,
  a refresh) shows the complete scene. The Next button reads “Reveal the next step” while building, and each
  step is announced. Space plays a clip instead when the scene has one.
- **Reduced motion:** builds still work (the presenter paces them) but switch instantly; the global rule
  removes every animation and transition, the scene entrance and the companion's crossfade. Motion must explain
  a relationship (reveal a step, move context into Ori, connect the journey, show an app changing); no
  constant background motion.

### Media slots

Every recording or screenshot position is a slot in `config.js` → `media`, placed with
`kit.media(key, options)`:

- `options`: `height` (stage px of the visible media; the width follows the aspect) or `width`; `fit`
  (`contain` or `cover`); `className`; and any config field to override for this placement (`still`,
  `stillLabel`, `label`, `alt`, `cues`). One placement per key.
- Structure: `figure.media-slot[data-slot][data-state] > div.media-frame` (the media in a rounded bezel, then a
  bar about 56 px tall with the label and the play/pause, replay and expand buttons; the frame is at least
  168 px wide and the bar wraps when narrow).
- States: `video` (the recording), `still` (no recording: its screenshot), `failed` (the recording could not
  play: its screenshot, with a toast for the presenter), `local` (a Setup preview), `empty` (no file at all: a
  neutral frame labelled “Media unavailable”; the slide still works), `idle` (not needed yet).
- Labels are the compact truth: “Recorded product demo · Sample mode” for the recordings, “Product
  screenshot”, plus “· Sample mode” when the screen shows Sample-mode content (`stills.json`,
  `sampleModeContent`). Never drop “Sample mode”.
- Preload discipline: nothing downloads before a slot's scene is next. The next scene gets the clip's metadata
  and poster (or the slot's screenshot when it has no recording); the current scene the whole clip. A
  screenshot that is only a fallback downloads only if its recording fails.
- Playback: never autoplays; Space plays or pauses the recording that is playing, else the first that has not
  ended, and once every clip on the scene has ended (each holds its last frame) Space moves on; clicking the video toggles it;
  a clip pauses when its scene changes or a dialog opens; Expand moves the frame (recording, label, controls)
  into a lightbox over the stage without stopping it; Esc, the close button or a click outside puts it back. In
  full screen the browser keeps Esc for itself: it leaves full screen and the deck closes the clip with it (press F
  to return). The presentation bars stay hidden while a clip is expanded.
- Events (they bubble): `ori:media` `{ key, state }`, `ori:playback` `{ key, type, time }`, `ori:cue`
  `{ key, index, time, cues }`. `kit.mediaControl(key)` → `{ el, video, state, cues, activeCue, play(),
  pause(), toggle(), replay(), seek(s), expand(), collapse() }`.
- Cue points: `cues: [s1, s2, …]` in seconds; cue i begins step i + 1 of a slide's visual guide, and
  `ori:cue` fires as playback crosses each one. They stay empty until the final footage exists: never guess
  timestamps. A slide must stay useful with no cues (all steps visible, or manual steps).

### Media slot table (for Zuyu's recordings)

Presented slide numbers (the brief's slide numbers in brackets). The file names keep the brief's numbers.

| Slot | Slide | Shot (brief §4) | Today | Files for the new recording | Aspect | Poster | Cues |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | appendix, 4. The demo (final round: no video on the main path) | A · Thought to Light, 20–25 s | `01-create.mp4`/`.webm` (12.8 s, Sample mode); fallback still `stills/light-open-first-photo.webp` | `media/06-thought-to-light.mp4` and `.webm` | 390 / 844 (portrait phone; record 390 × 844 or 780 × 1688) | `media/06-thought-to-light-poster.jpg` | 3 suggested: share the spark · shape the idea · open your app |
| `grow` | appendix, 4. The demo | B · Light grows with me, 20–25 s | `02-use-and-revise.mp4`/`.webm` (12.8 s, Sample mode); fallback `stills/light-entry-after.webp` | `media/07-light-grows.mp4` and `.webm` | 390 / 844 | `media/07-light-grows-poster.jpg` | optional: before · tell Ori · review · after |
| `return` | appendix, 4. The demo (moved off 6, brief 7) | E · One tap back to Light, 3–5 s, optional | `03-reopen.mp4`/`.webm` (5.2 s, Sample mode; a fresh browser session opens Light's link); fallback `stills/light-gallery-observation.webp` | `media/07-back-to-light.mp4` and `.webm` | 390 / 844 | `media/07-back-to-light-poster.jpg` | none |
| `context` | appendix, 4. The demo | C + D · Bring context from my AI, then the Playground: the founder's recording | `ori-context-demo.mp4`/`.webm` (23.65 s, H.264/VP9, no audio, filmed on a phone against the live site; label “Recorded product demo · Live AI”; never claim real-time speed); a real screenshot as fallback | delivered (wired by group 3 in `config.js`) | 464 / 832 | `media/ori-context-demo-poster.jpg` (its first frame) | 0 s Bring your context · 9.0 s Ori connects the dots (results from 12.6 s) · 15.9 s Explore what fits you |
| `playground` | retired from 7 (brief 8) | D · Playground | covered by the `context` recording; the slot may remain in `config.js` unused | — | 390 / 844 | — | — |

**Switching a slot to a new recording** (no layout change):

1. Export the clip silent, at the slot's aspect: an H.264 MP4 with `+faststart` (Safari and iPhones) and a VP9
   WebM, plus a poster JPG of the first frame with the app on screen. For example:
   `ffmpeg -i take.mov -an -vf scale=780:-2 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 23 -movflags +faststart 06-thought-to-light.mp4`,
   `ffmpeg -i take.mov -an -vf scale=780:-2 -c:v libvpx-vp9 -crf 34 -b:v 0 06-thought-to-light.webm`,
   `ffmpeg -ss 0.5 -i 06-thought-to-light.mp4 -frames:v 1 -q:v 3 06-thought-to-light-poster.jpg`.
2. Put the files directly in `client/public/pitch/media/` (flat: `scripts/verify-deploy.mjs` finds
   recordings named `media/<name>.mp4|webm` in `config.js`).
3. In `config.js`, set the slot's `sources` (MP4 first, then WebM) and `poster`. Set `label` to
   “Recorded product demo · Sample mode” if it was recorded in Sample mode, otherwise “Recorded product
   demo”. Keep `still` as the fallback.
4. Optionally add `cues` after watching the final cut.
5. Change `?v=` in `index.html`, then run `node scripts/check-pitch.mjs --dir client/public/pitch` (or against
   the live deck).

To try a clip before publishing it: Setup → **Preview a video** on the slot's row. It plays in its slot, in that
tab only, labelled “Local preview”; nothing is uploaded.

## Keyboard

← / → (or PageUp / PageDown) scenes and step reveals · Space plays or pauses the scene's clip, otherwise next ·
Home / End · O overview · N notes and timer · A appendix · F full screen (falls back to a presentation layout)
· Esc collapses an expanded clip, then leaves the fallback presentation layout. Keys are ignored while typing
and while a dialog is open; dialogs trap focus. A dialog opened with its key returns focus to where the
presenter was. In presentation mode the bars stay hidden until the pointer moves (or the keyboard focuses
them) and hide again after about two seconds.

## Fix pass (November 15, 2026, after the four reviews)

What changed, by confirmed finding (presented numbers):

- **Appendix 4 (the demo)** now matches the deck: rows 5 / 6 / 7, the founder's Live AI recording on 7
  (464 × 832, 60 fps, 23.65 s, waiting may be trimmed), Sample mode scoped to recordings 01–03, C and D covered
  by the founder's recording. The other appendix references use presented numbers (3, 6, 9, 13), section 3 no
  longer claims stage fragments on the slide, section 6 explains the outlined “Ori vision”, section 12 lists the
  expressions by presented scene, the R2 ratio is no longer written as an effect size, and the Overview tooltip
  says fifteen. US spelling in user-facing text (the R1 paper title keeps its published spelling).
- **Slide 6:** Before and After now show the lower photo and every field, so After visibly keeps Light, Where and
  Keeper under the three new rows; the mechanism is a plain list, not button-like pills; the return clip moved to
  the appendix (it plays there), leaving one recording; the spoken track follows the clip.
- **Slide 5:** the spoken track and cue start the clip on “I share a photo”, so the footage never races ahead;
  step 2's crop leads with Ori's Light proposal instead of the Sample-mode line.
- **Slide 4:** the exchange and the Light preview use the recordings' focus words (“Shadows and reflections”); the
  preview is the first frame of the use-and-revise recording (appendix demo section), caption cropped.
- **Slides 2, 8, 9, 14:** the insight card has no tail; Assignments shows its due-soon card at full resolution and
  the Sample-mode label is a caption, not a chip; the map's examples are 20 px ink-3 and its axis titles 18 px;
  the ask's Ori is 176 px, aligned to the hero.
- **Spoken tracks:** 3 (“We see five stages…”), 9 (only assistants overlap), 10 and 11 trimmed; 516 words ≈
  206.4 s of 238 s (`REHEARSAL.md`).
- **pitch.js:** a mouse click on a control hands the keys back to the deck (Space no longer re-presses Present,
  Next, a dot or a clip's Play or Replay button; no bar stays pinned in full screen); Space after a clip has
  ended moves on; one clip at a time per slide; leaving full screen closes an expanded clip and the bars stay
  hidden while one is expanded; the notes panel's Next steps through a build; focus returns to Expand after a
  keyboard collapse; the double-failure toast tells the truth.
- Declined: the #7 label stays the founder's “Recorded product demo · Live AI” (his explicit wording) rather than
  the suggested “Recording · Live AI”.

## Verified (November 15, 2026, the fix pass)

Static server (`python -m http.server --directory client/public/pitch`), Playwright with Microsoft Edge:

- `node scripts/check-pitch.mjs --dir client/public/pitch --port 8886 --scenes 15`: 68 passed, 0 failed, 2 notes
  (the QR's product origin is not fetched from a local server), in Chromium and Edge. The media check now expects
  the three demo recordings (create, grow, context); the return clip plays in the appendix.
- `node scripts/check-pitch-density.mjs --scenes 15`: 15 of 15 slides pass at 1600 × 900.
- A behaviour script, 17 of 17: click Present then clicker keys leaves no bar on any scene or on #15; Space after
  a mouse click advances or plays; Space after a clip ends moves on and the clip keeps its last frame; the notes
  panel's Next reveals #3's five steps then reaches #4; bars hidden while a clip is expanded; leaving full screen
  collapses it; the appendix demo plays the return clip; no console or page errors.
- Changed scenes at 1366 × 768 (page), 1600 × 900 and 1920 × 1080 (presentation) and 390 × 844: no scene
  overflow, nothing outside the stage, no sideways scroll.

## Verified (November 15, 2026, the restructure pass: 15 presented scenes)

Static server on port 8862, Microsoft Edge and bundled Chromium through Playwright, while the group agents were
still working (their slides may have changed since):

- `node scripts/check-pitch.mjs --dir client/public/pitch --port 8862 --scenes 15`: 72 passed, 0 failed, 2
  notes (the QR's product origin is not fetched from a local server). Budgets total 238 s and every spoken track
  fits; Next on #14 reaches #15; every scene fits at 1366 × 768, 1600 × 900 and 1920 × 1080 in both modes.
- A restructure script in Edge, 22 of 22: 15 slides render; `#1`–`#15` open their scenes, `#16` is ignored and a
  refresh keeps the scene; the overview has 15 tiles (“Fifteen scenes. Under four minutes.”, 238 seconds); the
  timer target reads “/ 3:58 target”; the discovery notes (#2, planned 0:07–0:26) link “Research behind this”,
  which opens `#appendix-research` at the top of Sources; `#evidence`, `#research` and the appendix contents
  open it too; no sideways overflow at 1600 × 900 or 390 × 844; no console errors or failed requests.
- `npx vitest run tests/unit/pitch-route.test.ts`: 13 of 13, including the new test that the research panel
  keeps every finding, source, the takeaway and the scope notes, and that no spoken track mentions it.
- Slide 7's clip (the founder's recording, wired by group 3), in Edge: the slot opens on its poster, labelled
  “Recorded product demo · Live AI”, no loop; Space plays it; it ends at 23.65 s on its last frame (the
  Playground suggestions) with step 3 “Explore what fits you” active; Next then moves to #8.
- A second `check-pitch.mjs` run at 03:43–03:44, while group 2, 4 and 5 were rewriting their files, failed only
  on their slides (scenes 3, 4, 9 and 10: overflow and a `position` renderer error); the group agents own those
  fixes, and the check must be rerun on the final files.

## Verified (November 15, 2026, the foundation pass, 16 scenes, before the restructure)

Static server (`python -m http.server 8861 --directory client/public/pitch`), Playwright 1.65.1, Microsoft
Edge and the bundled Chromium (both played the MP4 files):

- `node scripts/check-pitch.mjs --base http://127.0.0.1:8861/ --scenes 16`: 72 passed, 0 failed, 2 notes
  (the QR's product link is another origin from a local server, so it is not fetched there). It covers
  navigation, `#1`–`#16`, 15 → 16, the five-step build on slide 4, notes, timing, the timer, every media slot,
  pause on scene change, the closing slide's exact content, links, fit at three desktop sizes in both modes,
  no sideways scrolling at three narrow sizes, no failed requests, no other hosts and no console errors.
- A behaviour script, in both browsers (94 checks each, all passing): slide 16 at 1366 × 768, 1600 × 900 and
  1920 × 1080, page and presentation mode: only the line, the QR and the contact details; nothing else on
  screen in presentation mode; the QR decoded from each screenshot to `https://ori-fjrx.onrender.com/` (282,
  328, 331, 384, 408 and 461 px). Step reveals with Next, Space and hash arrival, with and without reduced
  motion; aliases; notes and timer; preload discipline (no media on scene 1; scene 5 warms only scene 6's
  clip); playback, expand while playing, replay, pause; a missing recording falls back to its labelled
  screenshot and a missing screenshot to a neutral frame; with the MP4 unavailable the WebM plays; injected cue
  points fire `ori:cue` in order; Setup lists the five slots and a local preview plays in its slot and can be
  removed; presentation bars hide, peek on pointer movement and hide again.
- `npx vitest run tests/unit/pitch-route.test.ts` (12 tests) and `npm run typecheck` pass.

## Still needed

- Zuyu's optional replacement recordings for create, grow and return (the handoff at the end of this file); the
  context slot already plays his recording, and the playground slot is retired.
- A human-spoken rehearsal with the timer; `REHEARSAL.md` is a word-count estimate.
- Physical devices: the presenter's laptop and the venue display in full screen, iOS Safari, a phone, and the
  QR scanned from presentation distance. Browser sizes here are emulated.
- Evidence for any home-screen claim (none is made): a phone recording of Light launched from the home screen.

## Correction to the kit README

`docs/ori-pitch-kit/README.md` still refers to a `dist/` folder, an 11-scene timing table, a “Download
integration kit” link and slide content in `index.html`. In this repository the deck is
**`client/public/pitch/`** (published at `/pitch/`), its scenes are in `scenes.js`, and its media are the
slots in `config.js`.

## Video-slot handoff for Zuyu (the exact steps per slot)

Claude does not film, generate or alter footage. Each slot keeps working with today's file until a new one
arrives; a missing file falls back to the slot's real screenshot. For every slot:

- Put the files **flat** in `client/public/pitch/media/`: an **H.264 MP4** (required; Safari and iPhones) and,
  optionally, a **VP9 WebM** with the same name, plus a **poster JPG** of the first frame with the app on screen.
  Export silent with `+faststart` (the ffmpeg lines under “Switching a slot to a new recording” above).
- Change the slot's one `sources:` line in `client/public/pitch/config.js` (MP4 first, then WebM) and the
  `poster:` line right under it. If the take is **not** Sample mode, also change its `label:` line to
  “Recorded product demo · Live AI” (or “Recorded product demo”), and the scene's `mediaLabel` in `scenes.js`
  for slides 5 and 6, which show the shorter “Recording · Sample mode”.
- Bump `?v=` in `index.html` (scripts and styles are cached for 300 s), then run
  `node scripts/check-pitch.mjs --dir client/public/pitch --port 8886 --scenes 15`.
- Setup → **Preview a video** tries a take in its slot, in that tab only, before anything is published.

| Slot | Slide | Brief shot · suggested length | What to record (brief §4) | Files to drop into `media/` | Aspect | Poster | Cue points | The `config.js` line to change |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `create` | Appendix, 4. The demo (final round: no video on the main path) | A · Thought to Light · about 20–25 s | Share a photo and a thought → answer one useful clarification or choose a proposal → preview → open Light; hold the finished app so the payoff is readable. | `06-thought-to-light.mp4` (+ `06-thought-to-light.webm`) | 390 / 844 portrait (record 390 × 844 or 780 × 1688) | `06-thought-to-light-poster.jpg` | Measure in the final cut, three: share the spark · shape the idea · open your app → `cues: [0, s2, s3]`; slide 5's three steps then follow the clip. Never guess. | `sources: ['media/06-thought-to-light.mp4', 'media/06-thought-to-light.webm'],` (today `01-create`, 12.8 s) |
| `grow` | Appendix, 4. The demo (the use-and-revise recording) | B · Light grows with me · about 20–25 s | Open Light with an existing entry → add a real observation or context → ask for one supported change → review and apply → show the change with the original entry still present. | `07-light-grows.mp4` (+ `.webm`) | 390 / 844 | `07-light-grows-poster.jpg` | None needed (the appendix clip does not follow cues); leave `cues: []`. | `sources: ['media/07-light-grows.mp4', 'media/07-light-grows.webm'],` (today `02-use-and-revise`, 12.8 s) |
| `return` | Appendix, 4. The demo (moved off slide 6; the brief allows either) | E · One tap back to Light · about 3–5 s, optional | On a real phone, tap Light's home-screen icon and show the saved entry; otherwise keep the direct-link recording and describe it as one. A home-screen claim needs real phone footage. | `07-back-to-light.mp4` (+ `.webm`) | 390 / 844 (a phone take may differ: keep its own aspect) | `07-back-to-light-poster.jpg` | None | `sources: ['media/07-back-to-light.mp4', 'media/07-back-to-light.webm'],` (for Setup), **and** the two `<source>` lines in `index.html` under `#appendix-return-clip`, which is where it plays (today `03-reopen`, 5.2 s) |
| `context` | Appendix, 4. The demo (the founder's recording) | C (+ D) · Bring context from my AI → Playground · delivered, 23.65 s | Delivered: the founder's phone recording on the live site (copy the prompt, paste the AI-written profile, add it; Ori organizes what it learned; the Playground suggests directions). | `ori-context-demo.mp4` + `.webm` (in place) | 464 / 832 | `ori-context-demo-poster.jpg` (in place) | `cues: [0, 9.0, 15.9]` (in place: Bring your context · Ori connects the dots · Explore what fits you) | Nothing to change. For a new take: `sources: ['media/<new>.mp4', 'media/<new>.webm'],`, then re-measure the three cues and keep the label “Recorded product demo · Live AI” (never claim real-time speed). |
| `playground` | Retired from slide 7 (brief 8) | D · Playground · about 8–12 s, or stills | Open the Playground → show a few possibilities → choose one → hold on the next step. Covered today by the end of the `context` recording. | Only with a layout change: `08-playground.mp4` (+ `.webm`) | 390 / 844 | `08-playground-poster.jpg` | None | `sources: ['media/08-playground.mp4', 'media/08-playground.webm'],` (the slot is not placed on any slide; placing it needs a slide change) |
