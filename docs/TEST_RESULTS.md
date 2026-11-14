# Test results (redesign, session 2)

Updated: 2026-11-14 13:25. Status values: ✅ passed · ❌ failed · ⏳ not run yet · ⚠️ partial. Every row names the environment it ran in. A check that did not run is listed as not run, never as passed. Session-1 totals are history; this file only reports what ran after the redesign started.

Machine: Windows 11, Node 24.14.1, Playwright Chromium 1255, Android emulator `Pixel_9_Pro` (Android 17 / API 37).

## 1. Automated (Node, in-process) — `npm test`, `npm run typecheck`

| Check | Status | Count | Notes |
| --- | --- | --- | --- |
| Baseline before any redesign change (10:47) | ✅ | 223 tests, 10 files | 0 type errors |
| Typecheck after integration (13:00) | ✅ | 0 errors | whole repo incl. tests |
| Full suite after integration (13:00) | ✅ | **371 passed, 17 files** | `npx vitest run` |
| Redesign API (`tests/unit/redesign-api.test.ts`) | ✅ | 37 | captures → honest read status (note `read`, Instagram link `not_read` with a note, screenshot `not_read` in Sample mode); bad URLs 400; media upload sniffed (text disguised as .jpg → 415), owner-only GET (404 for others), delete; photo records with another user's media → 422; proposal detail cites the capture; `/draft` with a 15-minute budget → valid spec, presets start at 15, example records match their views and never carry real media ids; `/build` → app with design + capabilities; `/keep`; `/generate` keeps capture-born proposals; update flow preview → apply → applied; cross-user 404s |
| App contract additions (`appSpec-redesign.test.ts`) | ✅ | 25 | new fixtures validate; filter/form errors with paths; `designFor` compatibility defaults; `capabilitiesOf`; gallery/queue type checks; `set_design`; image values |
| Preview content, link metadata (`previewContent.test.ts`, `linkMeta.test.ts`) | ✅ | 8 + 5 | deterministic examples, `example:` images only, mixed open/done checkboxes; no network for non-allowlisted hosts |
| Sample agent (`sample-respond.test.ts`) and sample adapter (`sample-adapter.test.ts`, updated) | ✅ | 22 + 23 | honesty lines per read status; music/photo/people captures produce different proposals; update_app when an app fits and its request applies to the fixture; learned facts are clean; both profiles differ |
| Runtime logic (`client/src/runtime/*.test.ts`) | ✅ | 23 + 32 | gallery ordering, queue grouping/completion, timer and tempo maths, theme fallbacks with WCAG AA checks, AppPreview renders every fixture read-only |
| Existing suites (schema, rules, revisions, records, API, persistence, fallback, storefront helpers) | ✅ | unchanged except deliberate updates | brand name, boot `theme`, existingApps shape |

## 2. Live model (Anthropic API, real credentials, `claude-opus-5-5`)

Script: `npx tsx server/scripts/ai-agent-smoke.ts` (four calls, 11:58). Log without secrets: `docs/live-agent-smoke-2026-11-14.txt`.

| Check | Status | Evidence |
| --- | --- | --- |
| Agent reply to a guitar note with an **unread** Instagram link: says it could not open the reel and works from the note; proposes a 15-minute practice app (practice_timer, tempo, source_links; ink/lime/display design), an exploration with 5 steps, and keep; learns one clean fact | ✅ 15.7 s | honesty check passed (no claim of having watched the reel) |
| Practice app spec from that proposal with a 15-minute budget: validates; views practice + links + summary; presets 15/5/10/20/30; tempo helper; ink theme; 6 example preview records | ✅ 22.0 s | structured output accepted the proposal schema; the spec uses JSON-in-text + zod |
| Agent reply to a **photo** (CC0 street photo) + note: the model read the image (`imageRead=true`, describes the raking light and shadows) and proposes a light-walk exploration, a gallery app (paper/airy design) and keep | ✅ 14.1 s | |
| Gallery app spec from the photo proposal with the paper look: validates; image field present; gallery views + summary | ✅ 20.1 s | |
| Browser journey in Live AI mode (`E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop`, 13:12): sign up → real agent reply to the guitar note → Make mine with the 15-minute choice → real spec previewed and built → practice timer → session saved and persisted → live revision adds a song field, records intact → undo; plus the two-profile Playground test with live extraction and recommendations | ✅ 2 passed (journey 44.7 s, two profiles 1.9 min, 2.7 min total) | one spec adjustment: the live model offers "keep" only when the share reads like a passing save, so that assertion is Sample-mode-only |

## 3. Browser (Playwright, production build served by Node, Sample mode, throwaway DB) — `npm run test:e2e`

Projects: phone (Pixel 7), phone-small (320×568), desktop. Final run 13:05: **14 passed, 4 skipped (by design: the layout/tap-target spec runs on the phone project only), 52.8 s**; an earlier full run with the layout screenshots took 5.2 min.

| Check | Projects | Status | Notes |
| --- | --- | --- | --- |
| Guitar slice: sign up → Agent note → read status `read` → reply with a new-app and a keep proposal → Make mine (15 min) → explicit Preview → real renderer with the example banner → Make mine → `/apps/{id}/` with presets starting at 15 → timer start/pause → Save session (prefilled) → session listed and persisted with the view's kind → reload → "Make this more me" adds a song field → records unchanged → undo restores field ids → My apps lists it | phone, phone-small, desktop | ✅ ✅ ✅ | ~4 s each in Sample mode |
| Two sample profiles → ≥ 3 Playground cards each, visibly grounded reasons, ≤ 1 overlap | phone, phone-small, desktop | ✅ ✅ ✅ | |
| Direct URL: app-specific title/manifest/icon on a cookie-less request; Riff and Light manifests differ (background color per theme); in-place sign-in; gallery image loads for the owner; other user → 404 API and not-found UI | phone, phone-small, desktop | ✅ ✅ ✅ | |
| Legacy board app: due rule, attention filter, completion, reload | phone, phone-small, desktop | ✅ ✅ ✅ | compatibility path |
| Layout: agent, playground, apps, make, Riff, Light, People, memory at 320 / 390 / 768 / 1440 without horizontal overflow; tap targets ≥ 44 px; the session form reachable at phone width | phone | ✅ | screenshots in `test-results/screens/` |
| Two spec fixes during integration | | | the journey needed an explicit Preview click (the UI makes preview a deliberate step because it spends a model call in Live mode) and the practice list uses `rt-session` ids |

Screenshots inspected (not just saved): the four builds reviewed their own (runtime 44 files, storefront ~50) and fixed what they found (overdue badge color, lightbox caption contrast, 320 px tab clipping, menu off-screen, CSS bundle order, landing document width); the coordinator reviewed Riff, Light, People, agent, playground, make and apps at 390 and 1440, then produced `docs/screenshots/after/*.jpg`.

## 4. Emulator (Android `Pixel_9_Pro`, Android 17)

| Check | Status | Notes |
| --- | --- | --- |
| Debug APK with the redesigned bundle builds (13:02) | ✅ | `node scripts/build-apk.mjs --api-base http://10.0.2.2:8787` → 4.4 MB |
| Install over the session-1 build; signed-in session survives; redesigned Playground renders in the shell | ✅ | `docs/screenshots/after/android-shell-playground.jpg` |
| Cold launch of Riff through the shortcut intent after force-stop | ✅ | practice room with timer, tempo and sessions (`android-riff-cold-launch.jpg`) |
| Pin a shortcut for Riff from its settings; launcher dialog shows Riff's own icon; `dumpsys shortcut` lists `app-K2FQ9RsuGXzUVBi7` | ✅ | `android-pin-dialog-riff.jpg`, `android-home-riff-shortcut.jpg` |
| Warm launch by tapping the home-screen icon → Riff resumed | ✅ | `android-riff-warm-tap.jpg` |
| Cold launch by tapping the icon | ⚠️ | Play Protect intercept on this account-less Play image, unchanged from session 1; physical phone pending |
| Example photos inside the shell | ✅ after fix | URLs now resolve against the API base; APK rebuilt |

## 5. Physical devices

| Check | Status | Notes |
| --- | --- | --- |
| iPhone Safari: Add to Home Screen on Riff and Light → two icons open two different apps with their data | ⏳ not run | needs a physical iPhone and a reachable server URL; desktop WebKit is not iOS verification |
| Android phone: APK install + pinned shortcut | ⏳ not run | no device connected |

## 6. Review pass

An adversarial multi-agent review (seven dimensions: security and ownership, data preservation, honesty, contract conformance, accessibility, demo path, live-model path; three skeptics per finding) ran after integration; confirmed findings and their fixes are listed in `BUILD_STATUS.md` when complete.
