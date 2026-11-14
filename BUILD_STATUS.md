# BUILD_STATUS — AI App Store prototype

Last updated: 2026-11-14, session 1 (foundation + live AI verified; UI modules being integrated)

## Resume here

1. Read this file, then `docs/api-contract.md`.
2. `npm install && npm run typecheck && npm test` — all unit tests must pass before touching UI.
3. `npm run build && npm start` → open http://localhost:8787 (production path, used by phones and e2e). `npm run dev` for hot reload (UI on :5173).
4. `npm run test:e2e` runs the demo journey in Sample mode (builds first; ~3–5 min).
5. Live AI check: `npx tsx server/scripts/ai-generate-smoke.ts` (needs `ANTHROPIC_API_KEY` in `.env`; ~$0.10).

## Environment found (do not re-derive)

| Item | Finding |
| --- | --- |
| Repo at start | Only the three vision documents; git repo with no commits |
| Node / npm | Node v24.14.1, npm 11.11.0 (no pnpm/yarn/bun) |
| SQLite | `node:sqlite` built-in works (prints an ExperimentalWarning; harmless) |
| Java | No `java` on PATH. JDK 21 bundled with Android Studio: `C:\Program Files\Android\Android Studio\jbr` |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`: platforms android-36/36.1, build-tools 35/36.1/37, platform-tools (adb), emulator, system image android-37 x86_64, AVD `Pixel_9_Pro`. No `cmdline-tools`. No device attached. Gradle 8.14.3 cached |
| Browsers | Chrome + Edge; Playwright chromium builds cached |
| AI credentials | `ANTHROPIC_API_KEY` present in root `.env` (git-ignored, `.gitignore` line 8). Model `claude-opus-5-5` (changed from the sonnet default in `.env` and `.env.example`; set `ANTHROPIC_MODEL=claude-sonnet-5-5` for cheaper/faster) |
| Velocity | No workspace access/outputs supplied → `docs/velocity-contribution.md` has founder-ready prompts + integration points, labelled pending |

## Architecture (decided)

- **One npm package**, pinned versions + `package-lock.json`. `client/` (Vite 7 + React 19 + React Router 7, plain CSS tokens), `server/` (Hono on Node 24, `tsx`), `shared/` (zod contracts + pure rule functions), `android/` (Capacitor 8, pending).
- **Persistence**: SQLite `data/app.db` via `node:sqlite`; migrations in `server/db/migrations`. Tables: users, sessions, apps, app_versions, app_records, app_events, revision_proposals, context_sources, profile_facts, recommendations, ai_usage.
- **Auth**: email + password (scrypt), opaque 32-byte session tokens stored hashed; cookie `aas_session` (web) or `Authorization: Bearer` with `X-Client: native` (Android shell). Prototype auth, documented.
- **Identity model**: `App` (stable unguessable id, owner, name, icon, purpose, currentVersion) ⟂ `AppVersion` (immutable spec per version) ⟂ `AppRecord` (field-id → value map). Field IDs are stable; hidden fields keep values; undo appends a version equal to the previous one. Export/import JSON carries versions + records.
- **AI boundary**: `ModelAdapter` (`server/model/types.ts`). `AnthropicAdapter` uses `client.beta.messages.parse` with `zodOutputFormat` for small schemas (extraction, recommendations, suggestions) and JSON-in-text + zod validation with up to 3 attempts for the large schemas (spec generation, revision ops) because the grammar-constrained mode rejected them ("compiled grammar is too large"). `fallbacks: "default"` (server-side refusal fallback) is on. `withModel()` falls back to the deterministic `SampleAdapter` on any failure and labels the result `generatedBy: 'sample'` + `fallbackReason`; failed live calls never count toward the monthly allowance. Imported text is wrapped in `<user_data>` and declared non-instructional.
- **Install paths**: `/apps/{appId}/` is served with app-specific title/manifest/apple-touch-icon/theme on every fresh request; `/apps/{appId}/manifest.webmanifest` has distinct `id`/`start_url`/`scope`, `display: standalone`; PNG icons rasterized with `@resvg/resvg-js` (SVG fallback). Sign-in happens **inside** the app URL (installed iOS web apps have their own cookie jar). Android: shared Capacitor runtime + pinned shortcuts (pending).
- **Business model in data**: `users.trial_started_at/trial_ends_at` (14 days), `plan`, `ai_usage` meter; after the trial, build/revise/generate return 403 `premium_paused`, viewing/export keep working.
- **Public metadata trade-off (recorded)**: app name + icon are readable by anyone holding the unguessable app id (needed so iOS can install from a fresh request). Records, specs and lists always require ownership.

## Verified so far (session 1)

| Check | Result | How |
| --- | --- | --- |
| `.env` ignored by git, key loads via `server/config.ts` | ✅ | `git check-ignore -v .env`; config reports `anthropic` mode without printing values |
| Minimal real request (structured output) | ✅ 2.8 s | `npx tsx server/scripts/ai-smoke.ts` |
| Live recommendations grounded in facts, work + explore mix | ✅ 4 recs in 13–14 s, each cites fact IDs and quotes the facts | `npx tsx server/scripts/ai-generate-smoke.ts` |
| Live spec generation (journal + weekly challenge + reflection) validates against `AppSpecSchema` | ✅ 14 s, 8 fields, journal+summary, prompt_rotation(weekly, 8) | same script |
| Live spec generation (board + due rule) | ✅ 17 s, board view + due_soon rule | same script |
| Live revision planning ("add a next experiment field") applies cleanly | ✅ 7.8 s, add_field + view updates | same script |
| Unsupported requests declined with alternatives (type change, email) | ✅ 0 ops, 2 unsupported entries with alternatives | same script |
| Shared contracts + server typecheck | ✅ `tsc` clean for `shared/`, `server/` (excluding agent modules in progress) | `npx tsc --noEmit` |

## Milestones

- [x] **M0** Reconnaissance, plan, scaffold, first commit.
- [~] **M1** Runtime slice — server side done (apps/records/versions/revisions/undo/export/import/events/install metadata). Client runtime (`client/src/runtime/`) being implemented by the runtime agent. Gate pending: browser test `tests/e2e/journey.spec.ts` + `direct-url.spec.ts`.
- [~] **M2** Discovery — server routes done (`/api/context`, `/api/recommendations`, drafts/build) with live Anthropic adapter verified; storefront pages (`client/src/pages/`) being implemented by the storefront agent; sample adapter + sample profiles by the sample agent. Gate pending: `journey.spec.ts` second test (two contrasting profiles).
- [~] **M3** Evolution — revision preview/apply/undo routes done; suggestion/feedback routes done (events → deterministic suggestions; feedback → live model). Board/tracker rendering in the runtime agent's scope. Gate pending: `board-rule.spec.ts`.
- [ ] **M4** iOS install flow verified in browser (metadata ✅ server-side, UI guide pending); Android Capacitor project + shortcut plugin + APK build attempt (not started; timeboxed; deferred behind the core journey per founder).
- [ ] **M5** Polish, pricing surface (page pending), `docs/DEMO.md`, `docs/TEST_RESULTS.md`, final verification.

## Work in flight (parallel agents, disjoint directories)

| Agent | Owns | Deliverable |
| --- | --- | --- |
| runtime-ui | `client/src/runtime/**` | AppRuntimePage (in-place sign-in, offline cache), Journal/Board/List/Summary views, RecordForm, FieldInput, settings (revise preview/accept/undo, install guide, export/import) |
| storefront-pages | `client/src/pages/**` | Welcome, Login/Signup, Import, Your Context, For You, Recommendation/Build, Collection, Pricing, Account |
| sample-adapter | `server/model/sample/**`, `server/fixtures/sampleContext.ts`, `fixtures/*.md` | Deterministic extraction, ≥26-concept catalog, recommend/generate/revise/suggest heuristics, two sample profiles |
| tests | `tests/unit/**`, `tests/helpers/**` | Schema/rules/revision/records unit tests + in-process API tests (ownership, undo, export/import, head injection) |

Already written by the main session and waiting on those modules: `tests/e2e/*.spec.ts` (journey, direct-url, board-rule, mobile), `playwright.config.ts`, `server/scripts/seed.ts`.

## Commands

```
npm install            # pinned deps
npm run dev            # server :8787 + vite :5173 (proxy)
npm run build          # client → dist/client
npm start              # production server on :8787 serving dist/client
npm run seed           # demo account demo@aiappstore.local (SEED_DEMO_PASSWORD, default demo-pass-2026); --reset recreates
npm run typecheck      # tsc --noEmit
npm test               # vitest unit + API tests
npm run test:e2e       # playwright (builds, starts server on :8799, throwaway DB, Sample mode)
npx tsx server/scripts/ai-smoke.ts            # one tiny live request
npx tsx server/scripts/ai-generate-smoke.ts   # live recommend → spec → revision (a few cents)
```

## Blockers / prerequisites

1. Android: no `java`/`adb` on PATH and no device. Plan: `JAVA_HOME` → Android Studio JBR, `ANDROID_HOME` → local SDK, emulator AVD `Pixel_9_Pro`; timeboxed to 45 min after the web journey is verified.
2. Physical iPhone verification of Add to Home Screen must be done by the founder (desktop WebKit is not iOS). Instructions will be in `docs/DEMO.md`.
3. Velocity: founder to run the four prompts in `docs/velocity-contribution.md` and drop outputs in `docs/velocity/`.

## Decisions log

- Default model `claude-opus-5-5` (current Anthropic default); founder can switch to `claude-sonnet-5-5`.
- Large-schema calls use JSON-in-text + zod validation (grammar mode rejected the AppSpec schema).
- Suggestions from usage events are deterministic (free, instant); explicit feedback goes to the live model.
- Recommendations default to 4 cards; the demo needs 3.
- Conflicting facts are excluded from generation until resolved (encourages the user to decide; they stay visible in Your Context).

## Next task

Integrate the four agent modules: typecheck whole repo, `npm test`, `npm run build`, `npm run test:e2e`; fix failures; then live-mode browser pass of the journey; then M4 install guide verification + Android timebox; then docs.
