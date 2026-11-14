# Test results

Updated: 2026-11-14 (session 1). Status values: ✅ passed · ❌ failed · ⏳ not run · ⚠️ partial. Every row names the environment it ran in. A check that did not run is listed as not run, never as passed.

## 1. Automated (Node, in-process)

| Suite | Command | Status | Notes |
| --- | --- | --- | --- |
| AppSpec schema (`tests/unit/appSpec.test.ts`) | `npm test` | ⏳ | being written by the tests agent |
| Rules: due-soon/overdue boundaries, metrics, prompts (`rules.test.ts`) | `npm test` | ⏳ | |
| Revisions: additive ops, hide keeps values, undo (`revision.test.ts`) | `npm test` | ⏳ | |
| Records validation/coercion (`records.test.ts`) | `npm test` | ⏳ | |
| Sample adapter: extraction, grounded recommendations, generation, revision, suggestions (`sample-adapter.test.ts`) | `npm test` | ⏳ | |
| API: auth, ownership 404s, records, versions/undo, export/import, head injection (`api.test.ts`) | `npm test` | ⏳ | |
| Persistence across close/reopen of a file DB (`persistence.test.ts`) | `npm test` | ⏳ | |
| Model fallback + JSON extraction (`model-fallback.test.ts`) | `npm test` | ⏳ | |
| Typecheck | `npm run typecheck` | ⏳ | |

## 2. Live model (Anthropic API, real credentials)

| Check | Status | Evidence |
| --- | --- | --- |
| Key loads from `.env` via server config; `.env` git-ignored | ✅ | `git check-ignore -v .env` → `.gitignore:8`; config resolves mode `anthropic` without printing values |
| Minimal structured request on `claude-opus-5-5` | ✅ 2.8 s | `npx tsx server/scripts/ai-smoke.ts` |
| Recommendations grounded in fact IDs, quoting facts, work + explore mix | ✅ 13–14 s, 4 cards | `npx tsx server/scripts/ai-generate-smoke.ts` |
| Journal spec with weekly challenge + reflection validates (`AppSpecSchema`) | ✅ 14 s | same |
| Board spec with board view + due_soon rule validates | ✅ 17 s | same |
| Revision "add next experiment field" applies to the spec | ✅ 7.8 s | same |
| Unsupported request (type change, email) declined with alternatives | ✅ 3.3 s | same |
| Grammar-constrained structured output for the full spec | ❌ → fixed | API rejected the large schema ("compiled grammar is too large"); spec/revision calls now use JSON-in-text + zod validation with retries |

## 3. Browser (Playwright, production build, Sample mode, throwaway DB)

| Check | Project | Status | Notes |
| --- | --- | --- | --- |
| Demo journey: import → review → For You → customize → build → save → reload → revise → undo (`journey.spec.ts`) | phone, desktop | ⏳ | |
| Two contrasting profiles → different grounded recommendations (`journey.spec.ts`) | phone, desktop | ⏳ | |
| Direct app URL: app-specific head/manifest on a fresh request, in-place sign-in, two distinct manifests, cross-user 404 (`direct-url.spec.ts`) | phone, desktop | ⏳ | |
| Board due-soon/overdue rule incl. completion (`board-rule.spec.ts`) | phone, desktop | ⏳ | |
| Phone layout: no horizontal overflow, tap targets ≥ 40 px, screenshots (`mobile.spec.ts`) | phone | ⏳ | |

## 4. Live-mode browser pass (manual, real key)

| Check | Status | Notes |
| --- | --- | --- |
| Import the founder sample → facts extracted by Claude | ⏳ | |
| For You in Live AI mode → build Photo Walk Journal with instructions | ⏳ | |
| Revision via live planner preserves the saved reflection | ⏳ | |

## 5. Emulator (Android)

| Check | Status | Notes |
| --- | --- | --- |
| Debug APK builds (`node scripts/build-apk.mjs`) | ⏳ | first Gradle run in progress |
| Install on AVD `Pixel_9_Pro` | ⏳ | |
| Pinned shortcut cold launch → intended app | ⏳ | |
| Pinned shortcut warm launch → intended app | ⏳ | |

## 6. Physical devices

| Check | Status | Notes |
| --- | --- | --- |
| iPhone Safari: Add to Home Screen for two apps → two icons open two different apps with their data | ⏳ not run | Needs a physical iPhone and a reachable server URL; desktop WebKit is not iOS verification. Steps in `docs/DEMO.md` |
| Android phone: APK install + pinned shortcut | ⏳ not run | No device connected to this machine |
