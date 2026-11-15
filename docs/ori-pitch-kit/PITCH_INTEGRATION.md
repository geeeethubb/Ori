# Ori pitch: integration notes

The Kearney hackathon pitch now lives inside the Ori site at **`/pitch/`**, as a standalone static page
outside the app shell. It keeps the kit's look and engine (full-screen scenes, button and keyboard
navigation, overview, speaker notes, timer, full screen, reduced motion, three media slots) and tells
the 14-scene, 240-second story from `ORI_PITCH_STORYTELLING.md`.

## Where things are

| Path | Role |
| --- | --- |
| `client/public/pitch/index.html` | Page shell: top bar, deck, controls, and the overview, notes, setup and appendix dialogs. The appendix (sources, definitions, longer story) is static HTML here. |
| `client/public/pitch/scenes.js` | **The single scene data source**: stable id, section number and name, headline, seconds, companion expression, on-screen content, spoken track and stage cue for all 14 scenes. Slides, overview tiles, progress dots and count, accessible labels, hashes, notes and timing are all generated from it. |
| `client/public/pitch/pitch.js` | The engine: renders the scenes, navigation, five-stage reveal, overview, notes, timer, appendix, media slots, corner companion, full screen and keyboard. No dependencies, no network calls. |
| `client/public/pitch/style.css` | The kit's cobalt / lime / lilac design, with compositions for the new scenes and phone, tablet and short-laptop layouts. |
| `client/public/pitch/config.js` | Published settings: presenter, `appUrl: '/'`, `githubUrl: 'https://github.com/geeeethubb/Ori'`, the three clip paths (empty until recordings exist) and `homeScreenVerified: false`. |
| `client/public/pitch/assets/{create,home,revise}.png` | The kit's three concept images, shown as labeled fallbacks. Generated target designs, not product screenshots. |
| `client/public/pitch/assets/ori/*.svg`, `assets/fonts/*` | Canonical Ori art and the app's self-hosted Manrope and DM Sans, written by `scripts/build-pitch-assets.mts`. |
| `scripts/build-pitch-assets.mts` | Re-runnable: `npx tsx scripts/build-pitch-assets.mts`. Writes `companion-<mood>.svg` for all eight canonical moods (`oriCompanionSvg`), `wordmark-ink.svg` and `wordmark-cobalt.svg` (`oriWordmarkSvg`), `app-icon.svg` (`oriAppIconSvg`), `favicon.svg` (`oriFaviconDocument`), the Light, Riff and People icons (`appIconSvg` with the canonical reference icons) and the two latin font files with their OFL licences. Re-run it after `shared/oriArt.ts`, `shared/icons.ts` or `shared/brand.ts` change. |
| `server/index.ts` | Production routes (below), registered before the SPA fallback. |
| `vite.config.ts` | `pitchDevRoutes()`: the same routes for `npm run dev`. |
| `tests/unit/pitch-route.test.ts` | In-process route tests against a temporary `CLIENT_DIST`. |

Vite copies `client/public/` into the built client, so the deck ships as `dist/client/pitch/` with every
`npm run build`. Nothing else is built or bundled for it.

## Routes

- `GET /pitch` → `301` to `/pitch/`, keeping the query string. Browsers keep the fragment, so `/pitch#4` lands on `/pitch/#4`.
- `GET /pitch/` and `/pitch/index.html` → the deck, `Cache-Control: no-store` (so is `config.js`).
- `GET /pitch/<file>` → static files from the built client, `Cache-Control: public, max-age=300`.
- A missing `/pitch/*` file → `404 Not found`, never the app's `index.html`. Encoded traversal (`..%2f`) is refused.
- Every other route, authentication rule and access rule is unchanged. The deck is public like the rest of the static site and calls no API.
- `npm run dev`: the Vite middleware redirects `/pitch`, rewrites `/pitch/` to `/pitch/index.html` (served from `client/public`) and answers missing `/pitch/*` files with 404.

## Correction to the kit README

`docs/ori-pitch-kit/README.md` still refers to a `dist/` folder ("Serve `dist/`", "Copy the CONTENTS of
`dist/`", "create `dist/media/`", "set the paths in `dist/config.js`"). The kit never contained `dist/`;
its deployable folder is `pitch/`. In this repository read every one of those references as
**`client/public/pitch/`**:

- serve or edit `client/public/pitch/` (it is published at `/pitch/` by the normal build);
- put recordings in `client/public/pitch/media/`;
- set their paths in `client/public/pitch/config.js`.

Also out of date in that README: the scene table (11 scenes; now 14, listed below), the "Download
integration kit" link (removed: no zip is served) and "Speaker text is editable in `pitch.js`; slide
content is in `index.html`" (both now live in `scenes.js`).

## The story on screen

| # | Section | Headline | Seconds | Ori's expression → drawing |
| ---: | --- | --- | ---: | --- |
| 1 | 1. Promise | Your phone, your story. | 10 | Welcoming → success, tilt −4°, large |
| 2 | 2. Research and discovery | Wanting is only the beginning. | 14 | Curious → clarify |
| 3 | 2. Research and discovery | 21 of 26 students said yes. | 23 | Listening → attentive |
| 4 | 3. Five stages | There is work between a spark and a habit. | 22 | Thoughtful → thinking |
| 5 | 4. Solution and demo | Bring the spark. We will shape what comes next. | 12 | Encouraging → success, tilt +4°, large |
| 6 | 4. Solution and demo | A saved photo becomes somewhere to begin. | 16 | Discovering → discovery, large |
| 7 | 4. Solution and demo | Make it useful. Make it yours. | 16 | Focused → building |
| 8 | 4. Solution and demo | Tomorrow, your progress is still here. | 10 | Quietly proud → success |
| 9 | 5. Why Ori | An app store built around you. | 14 | Confident → idle |
| 10 | 5. Why Ori | Personal experiences. A shared foundation. | 12 | Concentrating → building, tilt +3° |
| 11 | 6. Go-to-market | Our first users are people we can sit beside. | 28 | Connected → attentive, tilt +3° |
| 12 | 7. Business model | Earn the return visit. Then earn the subscription. | 20 | Thoughtful → thinking |
| 13 | **8. How we used Velocity AI** | Better assumptions. Sharper behavioral tests. | **30** | Investigating → clarify |
| 14 | 9. Ask and close | Give the next spark somewhere to grow. | 13 | Hopeful → discovery |
| | | **Total** | **240** | |

- Section numbers and scene numbers are labeled separately everywhere ("Section 8 · How we used Velocity AI" is scene 13; scene 8 is labeled Section 4).
- One companion sits in the same upper-right corner of every scene, larger at scenes 1, 5 and 6, and moves with its scene so it never covers content. Its expression is a static canonical drawing plus at most a small tilt. The notes and the appendix say the expressions are storytelling and that Ori does not sense emotions.
- The five stages reveal one at a time when the presenter arrives at scene 4 with Next (→, Space, PageDown or the Next button); any other arrival (a hash, a refresh, the overview, a dot, Previous) shows the complete static version, and the appendix has the full table.
- Spoken tracks and stage cues are in the notes (N). Expanded passages, tables, definitions, sources, the Pew 61% context and the $10,000 planning allocation are in the appendix (A, `#appendix`, `#appendix-<section>`), which is not part of the timed sequence.

## Recordings: what to do when they exist

1. Record one Light app and the same saved record: `01-create`, `02-use-and-revise`, `03-reopen`.
2. Save them as `client/public/pitch/media/01-create.webm`, `02-use-and-revise.webm` and `03-reopen.webm` (H.264 MP4 also plays; adjust the extension).
3. Set the paths in `config.js` (`clips.create`, `clips.revise`, `clips.reopen`), rebuild and redeploy.

Slot states, shown on the slot itself:

| State | Label |
| --- | --- |
| No clip configured | Concept walkthrough · Recording not added (the kit's PNG) |
| Clip configured and playing | Recorded product demo |
| Clip path fails to load | Recording could not load · Concept walkthrough (PNG again, plus a notice) |
| File chosen in Setup | Local preview · this tab only · not published |

Clips never autoplay, are muted (the presenter narrates), and pause when the scene changes. Space plays
or pauses the visible clip. Only when a phone recording shows Light reopening from the home screen,
set `homeScreenVerified: true`: scene 8 then switches from "Return directly to your app." to "One tap
back to your own app." and the spoken track to the home-screen wording.

## Keyboard

← / → (or PageUp / PageDown) scenes and stage reveals · Space next, or play/pause a clip · Home / End ·
O overview · N notes and timer · A appendix · F full screen (falls back to a presentation layout) ·
Esc closes. Keys are ignored while typing, inside media controls and while a dialog is open; dialogs
trap focus and return it to the control that opened them.

## Verified (November 15, 2026, local throwaway server on port 8829, Chromium via Playwright)

- `/pitch` → `/pitch/`; `/pitch#4` → `/pitch/#4`; direct `/pitch/#4`, refresh, `#13`, stable-id `#velocity` → `#13`, invalid hashes ignored.
- All 14 scenes at 1440×900, 1366×768, 768×1024, 390×844 and 320×568: no horizontal overflow, no text outside its scene, no clipped text, no text under 11 px on desktop or 10 px on phones, no companion overlap with text, cards or media, controls visible and unobstructed; no vertical overflow on desktop and tablet (phones scroll within a scene).
- Overview (14 tiles), notes sync with the deck, timer start/pause/resume/reset and the over-time state past 4:00, appendix links and direct `#appendix-sources`, focus trap, Escape and focus return, visible focus, typing in Setup not intercepted, video controls not intercepted.
- Media: concept fallback with no clip; a deliberately broken clip path falls back to the labeled image (the missing file is a server 404); a real WebM plays as "Recorded product demo" and pauses on scene change; a local file is labeled a temporary preview.
- Reduced motion (emulated) removes scene, companion and reveal motion. F enters and leaves full screen.
- `/` and `/agent` still render the React app. `npm run typecheck` passes; `tests/unit/pitch-route.test.ts` passes (as does the existing `tests/unit/api.test.ts`).
- Vite dev server with this `vite.config.ts`: `/pitch` → `301 /pitch/` (query kept), the deck renders untransformed from `client/public/pitch`, assets load, missing files and `..%2f` are 404, `/agent` is still the SPA.
- The deck scripts avoid syntax that older Safari cannot parse, and the CSS keeps plain fallbacks for `dvh` units and for the alt-text form of decorative `content`.

## Still needed

- The three real recordings of one Light app and one saved record (creation, use and revision, reopening). Until then every slot honestly shows its concept walkthrough.
- Physical-phone evidence of reopening Light from the home screen; scene 8 keeps the direct-link wording until then. A browser resize is not a device test.
- A judge-facing deployment. This change does not deploy anything; the deck is served wherever the Ori site is served, at `/pitch/`.
- Note: `npm run android:sync` copies the built client, including `pitch/` (about 5 MB, mostly the three concept PNGs), into the Android app.
