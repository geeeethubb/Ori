# Test results

Updated: 2026-11-14 ~03:50 (session 1). Status values: ✅ passed · ❌ failed · ⏳ not run · ⚠️ partial. Every row names the environment it ran in. A check that did not run is listed as not run, never as passed.

Machine: Windows 11, Node 24.14.1, Chrome/Playwright Chromium 1255, Android emulator `Pixel_9_Pro` (Android 17 / API 37, x86_64, headless).

## 1. Automated (Node, in-process) — `npm test`, `npm run typecheck`

| Suite | Status | Count | Notes |
| --- | --- | --- | --- |
| Typecheck (whole repo) | ✅ | 0 errors | `npx tsc --noEmit` |
| AppSpec schema (`tests/unit/appSpec.test.ts`) | ✅ | 22 | fixtures accepted; duplicate ids, wrong field types, bad done values, non-empty permissions rejected |
| Rules: due boundaries, metrics, prompts (`rules.test.ts`) | ✅ | 32 | fixed `now`; overdue/today/soon/scheduled; done never overdue; Monday week start; streak honours filters |
| Revisions (`revision.test.ts`) | ✅ | 29 | additive add_field, hide keeps values, undo-able, last view protected |
| Records (`records.test.ts`) | ✅ | 26 | coercion per type, real calendar dates only, unknown/hidden keys preserved |
| API (`api.test.ts`) | ✅ | 46 | auth, ownership 404s, records, versions/undo, export/import, public manifest, PNG icons are images, head injection escaping |
| Persistence across close/reopen of a file DB (`persistence.test.ts`) | ✅ | 3 | |
| Model fallback + JSON extraction (`model-fallback.test.ts`) | ✅ | 6 | failed live call → sample result labelled with reason; failed attempts not billed |
| Sample adapter (`sample-adapter.test.ts`) | ✅ | 23 | both profiles extract; grounded recs differ; heuristics; all 28 concepts validate |
| Runtime view logic (`client/src/runtime/viewLogic.test.ts`) | ✅ | 23 | |
| Storefront helpers (`client/src/pages/parts/helpers.test.ts`) | ✅ | 13 | safe `?next`, upload validation, JSON flattening |
| **Total** | ✅ | **223 passed, 0 failed** (10 files) | `npx vitest run` |

Bugs found by these tests and fixed before the browser runs: PNG icon routes never matched (Hono whole-segment params); impossible dates accepted; streak ignored its filter.

## 2. Live model (Anthropic API, real credentials, `claude-opus-5-5`)

| Check | Status | Evidence |
| --- | --- | --- |
| Key loads from `.env` via server config; `.env` git-ignored | ✅ | `git check-ignore -v .env` → `.gitignore:8`; server logs `model mode: anthropic` without printing values |
| Minimal structured request | ✅ 2.8 s | `npx tsx server/scripts/ai-smoke.ts` |
| Adapter smoke: recommend → journal spec → board spec → revision → unsupported | ✅ | `npx tsx server/scripts/ai-generate-smoke.ts` (13–17 s per generation) |
| **Through the real routes** (import → recommendations → draft → build → record → revision → feedback): extraction 24 facts (11.7 s); 4 grounded recommendations, work + explore, quoting the profile (18.6 s); journal draft with weekly challenge + required reflection field validated (14.6 s); build; record saved; live revision "add next experiment field" previewed (13.9 s), applied as v2, record retained; feedback → suggestion (5.1 s); board draft with due_soon rule + priority (19.9 s) | ✅ | Python client against `node --import tsx server/index.ts` on :8791 with the real `.env` (2026-11-14 03:38) |
| Grammar-constrained structured output for the full spec | ❌ → fixed | API rejected the large schema ("compiled grammar is too large"); spec/revision calls now use JSON-in-text + zod validation with retries |
| Browser journey in Live AI mode (`E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop`): sign up → sample context (Claude extraction) → For You (Claude recommendations) → customize → draft → build → save → reload → live revision → undo; plus the two-profile contrast | ✅ 2 passed (1.9 min) | 2026-11-14 03:58, real key, `claude-opus-5-5` |

## 3. Browser (Playwright, production build served by Node, Sample mode, throwaway DB) — `npm run test:e2e`

| Check | Project | Status | Notes |
| --- | --- | --- | --- |
| Demo journey: sign up → sample context → review/remove fact → For You (work + explore, grounded) → customize → preview → build → weekly challenge visible → save entry → reload keeps it → revise adds field → entry retained → undo → collection (`journey.spec.ts`) | phone (Pixel 7), desktop | ✅ ✅ | ~15 s each |
| Two contrasting profiles → ≥3 cards each, ≤1 title overlap, reasons visible (`journey.spec.ts`) | phone, desktop | ✅ ✅ | founder vs student |
| Direct URL: app-specific `<title>`/manifest/apple-touch-icon on a cookie-less request; two apps → two manifests with distinct `id`/`start_url`; PNG icon 200; records 401 anonymously; in-place sign-in at the same URL shows the saved entry; other user → 404 API + not-found UI with no data (`direct-url.spec.ts`) | phone, desktop | ✅ ✅ | |
| Board rule: 1 overdue · 1 due today · 1 due soon; done card never overdue; attention filter; moving the overdue card to Done clears it; survives reload (`board-rule.spec.ts`) | phone, desktop | ✅ ✅ | |
| Phone layout: import, collection, journal, board, settings, pricing have no horizontal overflow; visible buttons ≥ 40 px; new-entry sheet usable; screenshots in `test-results/screens/` (`mobile.spec.ts`) | phone | ✅ | skipped on desktop by design |
| **Total** | | ✅ **9 passed, 1 skipped** (44.6 s) | 2026-11-14 03:46 |

## 4. Emulator (Android, `Pixel_9_Pro`, Android 17 / API 37, Google Play image, headless)

| Check | Status | Notes |
| --- | --- | --- |
| Debug APK with the real web bundle builds | ✅ | `node scripts/build-apk.mjs --api-base http://10.0.2.2:8787` → `android/app/build/outputs/apk/debug/app-debug.apk` (4.2 MB) |
| Install on emulator; shell loads the storefront against the host server; demo sign-in inside the shell; session survives force-stop | ✅ | bearer token in the WebView |
| Pin a shortcut from an app's settings; launcher confirmation; shortcut registered with id `app-<appId>` and the app's label | ✅ | `dumpsys shortcut` |
| Warm launch: tapping the pinned icon switches the running shell to that app with its records | ✅ | home-screen tap |
| Cold launch with the shortcut's intent opens the intended app with its records after authenticating | ✅ | `am start … APP_ID` (what the launcher sends); `LaunchState: COLD` |
| Two targets → two apps (board cold, journal warm) | ✅ | intent-level |
| Cold launch by tapping the icon | ⚠️ | Play Protect on this account-less Play image intercepts the first open of a sideloaded app and hands off to Google sign-in; not an app defect, see `docs/ANDROID.md`. Verify on a physical phone |
| Shortcut shows the app's own icon | ⚠️ → fixed | bridge now fetches the icon from the API server; re-pin with the rebuilt APK |

## 5. Physical devices

| Check | Status | Notes |
| --- | --- | --- |
| iPhone Safari: Add to Home Screen for two apps → two icons open two different apps with their data | ⏳ not run | Needs a physical iPhone and a reachable server URL; desktop WebKit is not iOS verification. Steps in `docs/DEMO.md`. Server-side metadata (per-app manifest, apple-touch-icon, in-scope sign-in) is verified in section 3 |
| Android phone: APK install + pinned shortcut | ⏳ not run | No device connected |
