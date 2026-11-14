# BUILD_STATUS — AI App Store prototype

Last updated: 2026-11-14 ~04:05 (session 1). Core demo journey verified in Sample mode (browser) and Live AI mode (browser + API); Android shell verified on the emulator (pin, warm launch, cold launch via the shortcut intent).

## Resume here

1. Read this file, then `docs/TEST_RESULTS.md` (what is verified, where) and `docs/DEMO.md` (the 3-minute script).
2. `npm install && npm run typecheck && npm test` → expect 0 type errors, 223 tests passing.
3. `npm run build && npm run seed && npm start` → http://localhost:8787 (production path used by phones). Demo account `demo@aiappstore.local` / `demo-pass-2026`. `npm run dev` for hot reload (UI on :5173).
4. `npm run test:e2e` → 9 browser tests (Sample mode, ~1 min). `E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop` runs the journey against the real model (~$0.30).
5. Android: `node scripts/build-apk.mjs --api-base http://10.0.2.2:8787` (emulator) or `--api-base http://<laptop-lan-ip>:8787` (phone), then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. Details and verification state in `docs/ANDROID.md`.

## What works (verified)

| Flow | Sample mode | Live AI (`claude-opus-5-5`) |
| --- | --- | --- |
| Bring context (paste / upload / short profile / labelled sample) → facts with Confirmed vs Inferred, sources, conflicts | ✅ browser (phone + desktop) | ✅ API route (24 facts, 11.7 s) |
| For You: grounded cards citing fact IDs, work + explore, reasons quote the profile; two profiles differ | ✅ browser | ✅ API route (4 cards, 18.6 s, quotes like "get lost in my notes") |
| Customize → preview → **Build this for me** → app at `/apps/{id}/` | ✅ browser | ✅ browser (`E2E_LIVE=1`, 1.9 min journey) + API route (journal with weekly challenge + reflection, 14.6 s; board with due rule + priority, 19.9 s) |
| Save an entry, reload the stable URL, entry persists; sign in **inside** the app URL | ✅ browser | ✅ (same runtime) |
| **Make a change** → readable preview → accept → entries retained → undo | ✅ browser | ✅ API route (13.9 s) |
| Unsupported requests declined with an alternative | ✅ unit + API | ✅ adapter smoke |
| Board due-soon/overdue rule incl. completion and date boundaries | ✅ browser + 32 unit tests | n/a |
| Per-app manifest, apple-touch-icon, PNG icons, head injection on a fresh request; cross-user 404 | ✅ browser + API tests | n/a |
| Export/import JSON with history | ✅ API tests | n/a |
| Phone layout without clipping, tap targets ≥ 40 px | ✅ screenshots in `test-results/screens/` | n/a |
| Android shell: real-bundle APK installs; sign-in inside the shell; pin a shortcut from an app; warm launch by tapping the icon; cold launch via the shortcut's intent; two targets → two apps | ✅ emulator (`docs/ANDROID.md`) | tap-to-cold-launch blocked on this account-less Play image by Play Protect; physical phone pending |

## Environment found (do not re-derive)

| Item | Finding |
| --- | --- |
| Node / npm | v24.14.1 / 11.11.0. SQLite via built-in `node:sqlite` (ExperimentalWarning is harmless) |
| Java / Android | JDK 21 at `C:\Program Files\Android\Android Studio\jbr`; SDK `%LOCALAPPDATA%\Android\Sdk` (platforms 36, build-tools 35–37, platform-tools, emulator). `local.properties` needs forward slashes. Emulator AVD `Pixel_9_Pro` (Android 17) boots headless; adb authorization was accepted through the emulator console (`event mouse` taps) |
| AI credentials | `ANTHROPIC_API_KEY` in root `.env` (git-ignored). `ANTHROPIC_MODEL=claude-opus-5-5` (changed from the sonnet example; set `claude-sonnet-5-5` for cheaper/faster) |
| Velocity | No access/outputs supplied → `docs/velocity-contribution.md` has four founder-ready prompts with integration points, labelled pending |

## Architecture (decided)

- **One npm package**, pinned versions + lockfile. `client/` (Vite 7 + React 19 + React Router 7, plain CSS tokens), `server/` (Hono on Node 24, `tsx`), `shared/` (zod contracts + pure rule functions), `android/` (Capacitor 8 + local `AppShortcuts` plugin).
- **Persistence**: SQLite `data/app.db`; migrations in `server/db/migrations`. Tables: users, sessions, apps, app_versions, app_records, app_events, revision_proposals, context_sources, profile_facts, recommendations, ai_usage.
- **Auth**: email + password (scrypt), opaque session tokens stored hashed; cookie on the web, `Authorization: Bearer` + `X-Client: native` in the Android shell. Prototype auth, documented in README.
- **Identity model**: `App` (unguessable stable id) ⟂ `AppVersion` (immutable spec per version) ⟂ `AppRecord` (field-id → value). Field IDs never change; hidden fields keep values; undo appends a version equal to the previous one.
- **AI boundary**: `ModelAdapter` → `AnthropicAdapter` (structured outputs for small schemas; JSON-in-text + zod + 3 attempts for the full spec and revision ops because the grammar mode rejected the large schema; `fallbacks: "default"` on) with `SampleAdapter` fallback labelled `generatedBy: 'sample'` + reason. Failed live calls never count toward the monthly allowance. Imported text is wrapped as `<user_data>` and declared non-instructional.
- **Sample mode** (`server/model/sample/`): deterministic extraction of the README export format, 28-concept catalog with trigger phrases, generation/revision heuristics, event-based suggestions. Used when no key is set, as the fallback, in browser tests, and by the seed.
- **Install paths**: `/apps/{appId}/` served with app-specific title/manifest/apple-touch-icon/theme on every fresh request; manifest has distinct `id`/`start_url`/`scope`, `display: standalone`; icons rasterized with `@resvg/resvg-js`. Sign-in happens inside the app URL (installed iOS web apps have their own cookie jar). Android: shared runtime APK + pinned shortcuts carrying a validated app id (cold start via `getLaunchAppId`, warm via `appLaunch` event).
- **Business model in data**: 14-day trial dates on the user, `plan`, `ai_usage` meter (300 generations/month disclosed); after the trial, build/revise/generate return 403 `premium_paused` while viewing/export keep working. Pricing page shows real dates; no simulated payments.
- **Recorded trade-off**: app name + icon are readable by anyone holding the unguessable app id (needed for a fresh iOS install request). Records/specs/lists always require ownership.

## Milestones

- [x] **M0** Reconnaissance, plan, scaffold.
- [x] **M1** Runtime slice: journal at `/apps/{id}/`, persistence across reload/restart, additive revision + undo, export/import, in-place sign-in, ownership 404s. Gate passed (browser + API tests).
- [x] **M2** Discovery: import → Your Context → For You → Build → My Collection, live adapter + sample mode. Gate passed (two profiles differ; build and save in browser).
- [x] **M3** Evolution: board + tracker patterns, due-soon rule, NL revision preview/accept/undo, unsupported declines, events + suggestions + feedback. Gate passed.
- [x] **M4** Home-screen: iOS metadata + guide verified in browser (physical iPhone pending, founder); Android real-bundle APK installed on the emulator, shortcut pinned, warm launch by tap and cold launch via the shortcut intent verified; details and the one emulator-specific caveat in `docs/ANDROID.md`.
- [~] **M5** Docs (README, DEMO, TEST_RESULTS, ANDROID, Velocity prompts) written; pricing/account pages done; live-mode browser run passed; remaining: final polish items below.

## Work log (session 1)

- Foundation (shared contracts, server, adapter, shell) by the main session; runtime UI, storefront pages, sample adapter and tests built by four parallel agents against `docs/api-contract.md`. The sample agent stalled for ~40 min on an oversized single write; a stopgap was written and then superseded by the agent's richer version.
- Bugs found and fixed by tests: PNG icon routes never matched (Hono params must fill a segment); impossible dates accepted; streak ignored its filter; grid/title/tap-target CSS issues.
- Live model: grammar-constrained output rejected the AppSpec schema → JSON-in-text + validation.

## Commands

```
npm install            # pinned deps
npm run dev            # server :8787 + vite :5173 (proxy)
npm run build          # client → dist/client
npm start              # production server on :8787 serving dist/client
npm run seed           # demo account + sample context/apps/recommendations; -- --reset recreates
npm run typecheck      # tsc --noEmit (0 errors)
npm test               # vitest: 223 tests
npm run test:e2e       # playwright: 9 tests, Sample mode, throwaway DB on :8799
E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop   # journey with the real model
npx tsx server/scripts/ai-smoke.ts            # one tiny live request
npx tsx server/scripts/ai-generate-smoke.ts   # live recommend → spec → revision (a few cents)
node scripts/build-apk.mjs --api-base http://10.0.2.2:8787   # Android debug APK (emulator host address)
```

## Blockers / prerequisites

1. Physical iPhone verification of Add to Home Screen (two icons → two apps) must be done by the founder: `docs/DEMO.md` "Phone" step; needs the server reachable from the phone (`PUBLIC_ORIGIN`, same Wi-Fi or an HTTPS tunnel).
2. Velocity: founder to run the four prompts in `docs/velocity-contribution.md` and drop outputs in `docs/velocity/`.
3. Android physical device: none connected; emulator used instead.

## Decisions log

- Default model `claude-opus-5-5`; founder can switch to `claude-sonnet-5-5` in `.env`.
- Large-schema model calls use JSON-in-text + zod validation (grammar mode rejected the AppSpec schema).
- Suggestions from usage events are deterministic (free, instant); explicit feedback goes to the live model.
- Recommendations default to 4 cards; conflicting facts are excluded from generation until resolved.
- Android shell uses an `http://localhost` origin + cleartext so it can talk to a LAN/emulator-host server during the prototype; production uses HTTPS.
- Empty summary metrics show an en dash (product copy avoids em dashes).

## Next task

Final polish: re-pin a shortcut with the rebuilt APK to confirm the app icon, run the full test suite once more, review DEMO.md against the seeded data, and commit. Founder follow-ups: physical iPhone Add-to-Home-Screen check, Velocity prompts.
