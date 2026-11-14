# BUILD_STATUS — personal AI playground redesign (session 2)

Last updated: 2026-11-14 10:55. **Phase 0 (inspect) done; Phase 1 (foundation) in progress.** Product name undecided: the UI uses the temporary label from `shared/brand.ts` ("Your Playground").

## Resume here

1. Read this file, then `redesign/START_HERE.md` → `PRODUCT_SPEC.md` → `DESIGN_SPEC.md` → `BUILD_PLAN.md` (the redesign requirements) and `docs/redesign-contract.md` (what the code agrees on; written in Phase 1).
2. Baseline before any redesign change (verified 10:47): `npm run typecheck` 0 errors; `npm test` 223 passed (10 files). The pre-redesign database copy is `data/backups/app-20261114-104708-pre-redesign.db` (git-ignored). Never reset or reseed `data/app.db`; migrations are additive only.
3. Run: `npm run build && npm start` → http://localhost:8787 (production path, install metadata injected). `npm run dev` for hot reload (UI :5173). Demo account from session 1: `demo@aiappstore.local` / `demo-pass-2026` (`SEED_DEMO_PASSWORD`). Do not copy `.env.example` over the configured `.env`.
4. Checks: `npm run typecheck`, `npm test`, `npm run test:e2e` (Playwright, Sample mode, throwaway DB on :8799), `E2E_LIVE=1 npx playwright test tests/e2e/journey.spec.ts --project=desktop` (real model, costs money).

## Phase 0 findings (actual code, not handoff claims)

| Area | Where | Finding |
| --- | --- | --- |
| Client shell | `client/src/App.tsx`, `components/Layout.tsx`, `styles.css` | Routes `/`, `/login`, `/signup`, `/pricing`, `/import`, `/context`, `/for-you`, `/recommendations/:id`, `/collection`, `/account`; `/apps/:appId/*` renders the runtime outside the store chrome. Cream/brown tokens, serif display font, purple sparkle brand, "Get things done / Explore life" pills everywhere. |
| Storefront pages | `client/src/pages/*` | Welcome, Import (paste/upload/short profile + labelled samples), Context (facts by category, conflicts, sources), For You (3-col rec cards with mock previews), Recommendation (instructions → draft → build), Collection (wide rows + gear), Pricing, Account, Login. |
| Runtime | `client/src/runtime/*` | One shell (`AppHome`) renders journal/board/list/summary views from the spec; record sheet form per field type; settings (revise/history/install/data/collection). Offline cache + in-place sign-in work. Every app shares the same chrome: this is the "universal form renderer" the brief rejects. |
| App contract | `shared/appSpec.ts` (v1), `records.ts`, `revision.ts`, `rules.ts` | Fields text/long_text/date/number/select/checkbox/rating/url/tags; views journal/board/list/summary; rules due_soon/prompt_rotation; stable field ids; additive revision ops; undo appends a version. No media, no design block, no timer/gallery/queue capabilities. |
| Server | `server/index.ts`, `routes/*`, `repos/*`, `db/migrations/001_init.sql` | Hono + `node:sqlite`; owner-scoped repos (foreign ids → 404); auth cookie/bearer; `/api/apps` (records, versions, apply/undo, export/import, events), `/api/context` (sources, facts, interests), `/api/recommendations` (generate/draft/build/dismiss), revisions preview/suggestion/feedback; install metadata (`install.ts`) with per-app manifest + PNG icons. 1 MB JSON body limit on `/api/*`; no media routes; no URL fetching. |
| Model boundary | `server/model/types.ts`, `anthropic.ts`, `sample/*`, `index.ts` | `ModelAdapter` with extract/recommend/generateSpec/proposeRevision/suggestImprovement; live adapter uses structured outputs for small schemas and JSON-in-text + zod for the spec; sample adapter is a deterministic 28-concept catalog. `withModel` falls back to sample and labels it. |
| Tests | `tests/unit/*` (223), `tests/e2e/*` (9) | API, schema, rules, revisions, records, persistence, fallback, sample adapter, view logic; browser journey/direct-url/board-rule/mobile against the old routes and test ids. |
| Android | `android/`, `capacitor.config.ts`, `scripts/build-apk.mjs` | One shell APK; pinned shortcuts carry an app id. Unchanged by the redesign; described accurately in `docs/ANDROID.md`. |
| Env | `.env` (git-ignored, has the key; never printed) | Model `claude-opus-5-5` configured. Not touched. |

## Plan (milestones and acceptance, not hours)

- **R1 Foundation** (in progress): Electric Playground tokens + self-hosted Manrope/DM Sans (OFL) + lucide icons (ISC); `shared/brand.ts`; Agent / Playground / My apps navigation with avatar menu; route map with redirects from every old URL; AppSpec v1 extended additively (image field; gallery/practice/links/queue views; per-view `filter`/`formFieldIds`; `design` block; flat icon themes); media + captures + agent reply tables (migration 002, additive); media upload/serve routes (owner-scoped, type/size validated); capture routes with honest read status (no server-side page fetching; allowlisted oEmbed title/thumbnail only); `respondToCapture` on the model boundary (live reads screenshots; sample says it cannot). Exit: typecheck + existing tests pass, shell visibly Electric Playground, `docs/redesign-contract.md` written.
- **R2 The guitar slice**: Agent composer (note / link / screenshot) → concise grounded reply with explore / make / update / keep proposals → real app preview with one meaningful choice (practice time) → Make mine → Riff app at `/apps/{id}/` with practice timer + tempo helper + saved session → reload persists → Make this more me → preview → accept keeps data → undo. Exit: browser journey passes in Sample mode; live run recorded with latency.
- **R3 Distinct apps + Playground + My apps**: Light gallery with real uploads (legacy text entries readable), People next-action queue, Playground editorial grid with explore/make/open actions and "Why this?", My apps launcher, memory/settings pages. Exit: three apps differ on layout, dominant content, typography, primary interaction; all usable.
- **R4 Delivery + evidence**: per-app URL/title/manifest/icon checks, 320/390/768/1440 layouts, keyboard/touch/error states, screenshots inspected, Android shell still builds, Velocity state recorded honestly.
- **R5 Handoff**: tests fixed/extended, before/after screenshots, README/DEMO/TEST_RESULTS/velocity docs updated, final report.

## Work log (session 2)

- 10:44 Redesign package read (`redesign/*`, brief PDF text extracted with pypdf since pdftoppm is absent). Repo inspected file by file; findings above.
- 10:47 Baseline checks run (0 type errors, 223 tests). Database backed up before schema work.
- 10:55 Plan recorded; starting R1.

## Blockers / founder inputs still pending

1. Three real inspirations (photography, guitar/music, recurring work need) — not supplied yet; the demo uses clearly labelled example captures and public-domain example photos (`docs/ASSET_SOURCES.md`).
2. Velocity outputs — none supplied; `docs/velocity-contribution.md` stays pending until real outputs exist.
3. Physical iPhone / Android phone checks — no device attached to this machine.

## Session 1 facts worth keeping (verified then, still true)

- Node v24.14.1 / npm 11.11.0; SQLite via built-in `node:sqlite`. JDK 21 at `C:\Program Files\Android\Android Studio\jbr`; SDK `%LOCALAPPDATA%\Android\Sdk`; emulator `Pixel_9_Pro` (Android 17). `local.properties` needs forward slashes; call `gradlew.bat` by absolute path.
- Grammar-constrained structured output rejects the full AppSpec schema → spec and revision calls use JSON-in-text + zod validation with retries; small schemas use structured outputs.
- App name + icon are readable by anyone holding the unguessable app id (needed for a fresh iOS install request); records always require ownership.
- Android: tap-to-cold-launch of a pinned shortcut is intercepted by Play Protect on the account-less emulator image; the shortcut's intent and warm taps work (`docs/ANDROID.md`).
