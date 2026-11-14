# Test results (redesign, session 2)

Updated: 2026-11-14 12:10 (in progress). Status values: ✅ passed · ❌ failed · ⏳ not run yet · ⚠️ partial. Every row names the environment it ran in. A check that did not run is listed as not run, never as passed. Session-1 totals are history, not current results; this file only reports what ran after the redesign started.

Machine: Windows 11, Node 24.14.1, Playwright Chromium 1255, Android emulator `Pixel_9_Pro` (Android 17 / API 37) available but not used yet in this session.

## 1. Automated (Node, in-process) — `npm test`, `npm run typecheck`

| Check | Status | Notes |
| --- | --- | --- |
| Baseline before any redesign change (10:47) | ✅ | 0 type errors; 223 tests, 10 files |
| After the foundation commit `e525b77` (11:40) | ✅ | 0 type errors; 226 tests (brand-name and boot-theme assertions updated on purpose; everything else unchanged) |
| Redesign API tests (captures, read status, media ownership, preview/make/keep/update) | ⏳ | being written (`tests/unit/redesign-api.test.ts`) |
| App contract additions (new views, filter, design, set_design, image values) | ⏳ | being written (`tests/unit/appSpec-redesign.test.ts`) |
| Sample adapter: agent replies, three domains, learned facts | ⏳ | being written (`tests/unit/sample-respond.test.ts`) |

## 2. Live model (Anthropic API, real credentials, `claude-opus-5-5`)

Script: `npx tsx server/scripts/ai-agent-smoke.ts` (four calls, 11:58). Log without secrets: `docs/live-agent-smoke-2026-11-14.txt`.

| Check | Status | Evidence |
| --- | --- | --- |
| Agent reply to a guitar note with an **unread** Instagram link: says it could not open the reel and works from the note; proposes a 15-minute practice app (practice_timer, tempo, source_links; ink/lime/display design), an exploration with 5 steps, and keep; learns one clean fact | ✅ 15.7 s | honesty check passed (no claim of having watched the reel) |
| Practice app spec from that proposal with a 15-minute budget: validates; views practice + links + summary; presets 15/5/10/20/30; tempo helper; ink theme; 6 example preview records | ✅ 22.0 s | structured output for the proposal schema accepted; spec via JSON-in-text + zod |
| Agent reply to a **photo** (CC0 street photo) + note: the model read the image (`imageRead=true`, describes the raking light and shadows) and proposes a light-walk exploration, a gallery app (paper/airy design) and keep | ✅ 14.1 s | |
| Gallery app spec from the photo proposal with the paper look: validates; image field present; gallery views + summary | ✅ 20.1 s | two gallery views (walks, references) |
| Browser journey in Live AI mode (`E2E_LIVE=1`) | ⏳ | after the UI lands |

## 3. Browser (Playwright, production build, Sample mode, throwaway DB) — `npm run test:e2e`

| Check | Project | Status | Notes |
| --- | --- | --- | --- |
| Guitar slice: sign up → Agent note → honest reply → Make mine (15 min) → preview → Riff → timer → save session → reload → Make this more me → accept → undo | phone, desktop | ⏳ | spec being rewritten to the new routes and test ids |
| Two sample profiles → materially different Playground sets | phone, desktop | ⏳ | |
| Direct URL: per-app title/manifest/icon on a fresh request; in-place sign-in; other user 404 | phone, desktop | ⏳ | |
| Board due-soon rule (legacy board app keeps working) | phone, desktop | ⏳ | |
| Layouts at 320 / 390 / 768 / 1440 without horizontal overflow; screenshots inspected | phone-small, phone, tablet, desktop | ⏳ | |

## 4. Emulator (Android) — unchanged shell, to be re-verified with the new bundle

| Check | Status | Notes |
| --- | --- | --- |
| Debug APK with the redesigned bundle builds and installs; pinned shortcut opens Riff | ⏳ | session-1 verification of the shell is in `docs/ANDROID.md`; it must be repeated with the new bundle |

## 5. Physical devices

| Check | Status | Notes |
| --- | --- | --- |
| iPhone Safari: Add to Home Screen on Riff and Light → two icons open two different apps with their data | ⏳ not run | needs a physical iPhone and a reachable server URL; desktop WebKit is not iOS verification |
| Android phone: APK install + pinned shortcut | ⏳ not run | no device connected |
