# BUILD_STATUS — AI App Store prototype

Last updated: 2026-11-14 (session 1, milestone 0: reconnaissance + scaffold)

## Environment found (do not re-derive)

| Item | Finding |
| --- | --- |
| Repo at start | Empty except `CLAUDE_BUILD_PROMPT.md`, `AI_App_Store_README.md`, `AI_App_Store_Exec_Summary.pdf`; git repo with no commits |
| Node / npm | Node v24.14.1, npm 11.11.0 (no pnpm/yarn/bun) |
| SQLite | `node:sqlite` built-in works (experimental warning only) → no native build step |
| Java | No `java` on PATH. JDK 21 bundled with Android Studio: `C:\Program Files\Android\Android Studio\jbr` |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`: platforms android-36/36.1, build-tools 35/36.1/37, platform-tools (adb 1.0.41), emulator, system image android-37 x86_64, AVD `Pixel_9_Pro`. No `cmdline-tools`. No device attached. Gradle 8.14.3 dist cached in `~/.gradle` |
| Browsers | Chrome + Edge installed; Playwright chromium builds cached in `%LOCALAPPDATA%\ms-playwright` |
| AI credentials | **None.** No `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` at process, user, or machine scope. `api.anthropic.com` reachable (401 without key) |
| Velocity | No workspace access or outputs supplied in the repo |

## Architecture (decided)

- **One npm package**, pinned versions + `package-lock.json`.
  - `client/` — Vite 7 + React 19 + TypeScript + React Router 7, plain CSS design tokens (no UI framework).
  - `server/` — Hono 4 on `@hono/node-server`, TypeScript run with `tsx`. Serves API + built client + per-app install metadata.
  - `shared/` — zod schemas and pure functions used by both sides: `AppSpec`, revision operations, rules (due-soon, summaries), context/profile/recommendation contracts.
  - `android/` — Capacitor 8 project with a local `AppShortcuts` plugin (pinned launcher shortcuts carrying a validated app ID).
- **Persistence**: SQLite file `data/app.db` via `node:sqlite`; numbered migrations in `server/db/migrations`. Tables: users, sessions, apps, app_versions, app_records, app_events, context_sources, profile_facts, recommendations, revision_proposals.
- **Auth**: email + password (scrypt, per-user salt), opaque 32-byte session tokens stored hashed; cookie (`aas_session`, httpOnly, SameSite=Lax) for web, `Authorization: Bearer` for the Android shell. Prototype auth, documented as such.
- **Identity model**: `App` (stable id, owner, name, icon, purpose, currentVersion) ⟂ `AppVersion` (immutable spec per version) ⟂ `AppRecord` (field-id → value map). Field IDs are stable; labels/layouts change freely. Hidden fields keep values. Undo = append a version whose spec equals the previous one.
- **AI boundary**: `ModelAdapter` interface (extractFacts, recommend, generateSpec, proposeRevision, suggestImprovement). `AnthropicAdapter` (structured output validated by zod, timeouts, 2 bounded retries) is used when `ANTHROPIC_API_KEY` is set; otherwise `SampleAdapter` (deterministic heuristics + concept catalog) with a visible **Sample mode** badge. Imported text is data, never instructions.
- **Install paths**: `/apps/{appId}/` is served with app-specific `<title>`, apple-touch-icon, and `<link rel=manifest>` on every fresh request; `/apps/{appId}/manifest.webmanifest` has distinct `id`, `start_url`, `scope`, `display: standalone`; icons rendered server-side (SVG → PNG with `@resvg/resvg-js`). Android: shared runtime APK + per-app pinned shortcuts.
- **Business model in data**: `users.trial_started_at`, `trial_ends_at` (14 days), `plan`, AI-generation counter; premium actions pause after trial with view/export retained.

## Milestones

- [x] **M0** Reconnaissance, plan, scaffold, first commit.
- [ ] **M1** Runtime slice: AppSpec schema, DB, auth, apps/records API, journal runtime at `/apps/{id}/`, fixture Photo Walk Journal, additive revision + undo, JSON export/import, login preserves destination, ownership checks. Gate: save → restart → reopen → add field → entry intact; cross-user access blocked.
- [ ] **M2** Context import (paste/upload/manual) → editable Your Context (facts, sources, confirmed vs inferred, remove, resolve conflicts) → For You (grounded cards citing fact IDs) → App detail/Build → My Collection. Gate: two contrasting profiles → different grounded recommendations; build one and save an item.
- [ ] **M3** Board + tracker patterns, due-soon/overdue rule, natural-language revision with preview + accept + undo, unsupported-transformation decline, events + improvement suggestions. Gate: journal + board work; a rule works; revision preserves records.
- [ ] **M4** iOS home-screen flow (per-app manifest/icons/instructions) + Android Capacitor project + shortcut plugin + debug APK build attempt + emulator cold/warm launch check.
- [ ] **M5** Polish (mobile layout, states), trial/pricing surface, docs (`README.md`, `docs/DEMO.md`, `docs/TEST_RESULTS.md`, `docs/velocity-contribution.md`, `.env.example`), automated + browser tests, final verification report.

## Commands (keep current)

```
npm install            # pinned deps
npm run dev            # server :8787 + vite :5173 (proxy)
npm run build          # client → dist/client
npm start              # production server on :8787 serving dist/client
npm run seed           # demo account + sample data (clearly labeled sample)
npm test               # vitest unit tests
npm run test:e2e       # playwright browser tests (builds, starts server on a temp DB)
```

## Blockers / prerequisites recorded

1. `ANTHROPIC_API_KEY` is not set anywhere → live AI adapter cannot be exercised here; sample mode is the fallback and is labeled in the UI. Set the key in `.env` to activate.
2. Velocity access/outputs not supplied → `docs/velocity-contribution.md` will carry founder-ready prompts, labeled pending.
3. Android: no `java` on PATH and no connected device; plan is `JAVA_HOME` → Android Studio JBR, `ANDROID_HOME` → local SDK, emulator AVD `Pixel_9_Pro` for launch checks (timeboxed).

## Next task

Write the scaffold (package.json, configs), shared AppSpec schema, DB + auth, apps/records API, journal runtime, and the fixture app; run it; verify the M1 gate.
