# Test results (redesign, Velocity integration, Ori)

Updated: 2026-11-15 (section 8 added: the Ori pass, its live checks on the deployed service, and the pitch). Status values: ✅ passed · ❌ failed · ⏳ not run yet · ⚠️ partial. Every row names the environment it ran in. A check that did not run is listed as not run, never as passed. Session-1 totals are history; this file only reports what ran after the redesign started.

Machine: Windows 11, Node 24.14.1, Playwright Chromium 1255, Android emulator `Pixel_9_Pro` (Android 17 / API 37).

## 1. Automated (Node, in-process) — `npm test`, `npm run typecheck`

| Check | Status | Count | Notes |
| --- | --- | --- | --- |
| Baseline before any redesign change (10:47) | ✅ | 223 tests, 10 files | 0 type errors |
| Typecheck after integration (13:00) | ✅ | 0 errors | whole repo incl. tests |
| Full suite after integration (13:00) | ✅ | 371 passed, 17 files | `npx vitest run` |
| Typecheck and full suite after the review fixes (14:03) | ✅ | **387 passed, 18 files**, 0 type errors | `npm run typecheck`, `npx vitest run` |
| Review follow-ups (`tests/unit/review-followups.test.ts`) | ✅ | 16 | added/restored fields reach the primary form on Riff-shaped apps; required fields scoped to the record's own form; explorations may only link to shared pages; proposal status owner/app-scoped (another user's apply cannot mark my proposal); event metadata bounds; import drops foreign photos and non-web links; read-status labels per capture kind; `user_data` delimiter escaping; idle practice timer follows a changed default |
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

Projects: phone (Pixel 7), phone-small (320×568), desktop. Run after integration (13:05): 14 passed, 4 skipped (by design: the layout/tap-target spec runs on the phone project only), 52.8 s. **Final run after the review fixes (14:05): 14 passed, 4 skipped, 1.0 min**, with the journey now opening Save session after the revision and asserting that the added song field is in the form. An earlier full run with the layout screenshots took 5.2 min.

| Check | Projects | Status | Notes |
| --- | --- | --- | --- |
| Guitar slice: sign up → Agent note → read status `read` → reply with a new-app and a keep proposal → Make mine (15 min) → explicit Preview → real renderer with the example banner → Make mine → `/apps/{id}/` with presets starting at 15 → timer start/pause → Save session (prefilled) → session listed and persisted with the view's kind → reload → "Make this more me" adds a song field → records unchanged → the song field is in the Save-session form → undo restores field ids → My apps lists it | phone, phone-small, desktop | ✅ ✅ ✅ | ~4 s each in Sample mode |
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

## 7. Velocity integration and its review (session 3)

Commits `a88d8e0` (integration), `26381e8` (review fixes), `eb2f82c` (Ori brand foundation, which only adds files and icons). Machine as above. Counts below are from the committed trees, run in clean temporary worktrees so unfinished work in the main tree could not affect them.

| Check | Status | Count | Environment / evidence |
| --- | --- | --- | --- |
| Typecheck at `26381e8` and at `eb2f82c` | ✅ | 0 errors | `tsc -p tsconfig.json --noEmit`, whole repo |
| Unit/API suite at `26381e8` alone | ✅ | 526 passed, 24 files | clean worktree, `npx vitest run` |
| Unit/API suite at `eb2f82c` | ✅ | **555 passed, 26 files** | clean worktree, `npx vitest run --reporter=json` |
| Velocity's 12 adversarial cases (`tests/unit/velocity-cases.test.ts`) | ✅ | 22 | Sample mode, in-memory SQLite over HTTP |
| Velocity runtime decisions (`tests/unit/velocity-runtime.test.ts`) | ✅ | 14 | plan vs measured time, drafts by role, bindings |
| Review fixes, server (`tests/unit/velocity-review-fixes.test.ts`) | ✅ | 15 | retried saves with newer values, two lost responses, deleted entries, Undo/Redo labels, malformed expectedVersion, untouched defaults, ids-based binding checks, bound fields on the final design, import photo fields, Accept re-checks its suggestion |
| Memory and idempotency (`tests/unit/velocity-memory-fixes.test.ts`) | ✅ | 26 | forgetting keeps facts other shares or the person back, Unicode-aware matching, import cap, quotes, built cards after app deletion, overlapping and forgotten share ids |
| Client record flows (`client/src/runtime/recordFlows.test.ts`) | ✅ | 35 | edit drafts hold changed keys only, sent drafts keep their id, conflicts keep untouched typing, queue Undo, rollback per key, record_deleted handling |
| Practice timer (`client/src/runtime/practiceTimer.test.ts`) | ✅ | 19 | two tabs share one stored timer, sessions dated by their last stretch, preview timers never stored, save/renew/reset scoped to their session, "typed in" only when explicit, Show all sessions |
| Browser suite (Playwright; production build served by Node; Sample mode; throwaway `data/test-e2e-8799.db`, which applied migration 004 on start) | ✅ | 14 passed, 4 skipped | the 4 skips are the layout specs that run on the phone project only, by design; tree as committed in `eb2f82c` |
| Bounded live model run (`server/scripts/velocity-live-smoke.ts`) | ✅ | 15/15 checks, 5 calls | `claude-opus-5-5`; 105.2 s (first call), 5.8 s, 6.3 s, 5.3 s, 21.2 s; `docs/velocity/evidence/live-smoke-2026-11-14.txt` (no key in it) |
| Evidence screenshots | ✅ | 32 kept (390 and 1440) | Sample mode, throwaway DB, `scripts/screenshots.mjs`; 320 and 768 were captured and inspected, not kept; `docs/velocity/evidence/screens/` |
| Live browser journey after these changes | ⏳ not run | | not re-run, to avoid spend; the bounded adapter run covers the routing decisions |
| Android emulator after these changes | ⏳ not run | | the APK was not rebuilt in this pass; section 4 is the last emulator evidence |
| Physical devices | ⏳ not run | | no device attached |

The review itself: six dimensions (routing honesty, idempotency and ownership, timer semantics, client flows, undo and data, contract compatibility) confirmed 42 findings, two high. Every finding was fixed; each area's fixes went to an independent verifier, whose new edge cases were fixed in a second and a third round. Details: `docs/velocity/INTEGRATION_REPORT.md` section 8.

## 6. Review pass

An adversarial multi-agent review ran after integration (13:05–13:50): seven dimensions (security and ownership, data preservation, honesty, contract conformance, accessibility, demo path, live-model path), every finding handed to three independent skeptics told to refute it; 151 agents in all. **36 findings survived, two rated high.** The accessibility verifiers did not run (the account ran out of usage credits mid-review), so that dimension is **unverified**, not passed; the layout/tap-target browser spec and the AA-checked runtime accents remain the only accessibility evidence.

All 36 were fixed at 14:03 and pinned by the 16 tests above where a test could hold them:

| Area | Fixed |
| --- | --- |
| High: field reachability | `add_field` / `unhide_field` on an app whose views are all filtered (Riff: practice + sources + summary) put the field in no form, so an accepted "add a field for the song" never reached Save session. The primary form-bearing view now takes it; the browser journey opens Save session after the revision and asserts the song field is there. |
| High: required fields across record kinds | A saved source was asked for the session's required fields. Required now applies only to the fields in the record's own form (the matching filtered view); records outside every filtered view keep every required field. |
| Ownership and bounds | Proposal status updates are owner- and app-scoped (`setProposalStatus(ownerId, appId, …)`); event metadata is bounded (≤ 10 keys, scalars, strings ≤ 500); imported records drop photos that are not in the importer's library and links that are not web addresses (the record is kept); revision preview and feedback use the shared premium/allowance gate; the agent's image gate follows `MAX_IMAGE_BYTES`. |
| Prompt data boundary | Every piece of user text interpolated into a live-model prompt (facts, app names, captures, titles, choices, instructions, record values, feedback) is escaped so it can neither open nor close the `<user_data>` block. |
| Honesty | Read-status labels follow the kind of capture (a screenshot is never "Saved link"); the Make page says "How it will look … nothing is made until you press Make mine"; the URL field and busy state say the page itself is never read; welcome copy promises "a place for the link you saved", not the link's content; exploration steps may only link to pages the person shared (`server/services/grounding.ts`, applied to Agent and Playground proposals); a Sample badge appears per card when a grid mixes live and sample proposals; facts from the example profile are tagged "Example" in Why this. |
| Live path | `recommend` retries merge with the first batch instead of discarding grounded proposals; `suggestImprovement` output budget 1500 → 6000 tokens; a proposal's `design` is a partial patch (unspecified parts chosen by the designer, not defaulted). |
| Runtime | Metronome beat indicator cannot fire after Stop (pending timeouts cleared); an untouched idle practice timer follows a changed default preset after a revision; exploration checkboxes persist per device; Make mine marks the recommendation applied in the same request (the separate call is best-effort). |
| Composer and contrast | A retried share reuses the uploaded screenshot; Send waits for the thread to load; `--ink-3` darkened to `#646C88` (about 5:1 on the paper background for small muted text). |

Known and not fixed (see `BUILD_STATUS.md`): live-mode retry chains can exceed the client timeout on slow responses; the seed matches the demo apps by name; sample-mode filler proposals can cite loosely related facts; renaming a select option does not remap `where.value` in summary metrics; the live journey was not re-run after these fixes (Sample-mode browser run only, to avoid spending on the model).


## 8. Ori (session 3): product, live service, Android, pitch

Commits `eb2f82c` (brand foundation), `e27782b` (Ori surfaces), `809eed0` (deployment settings, keep card, live check), then the pitch, demo-seeding and documentation commit of 2026-11-15. "Phone" sizes below are browser viewports (390 × 844, 320 × 568), not physical phones.

| Check | Status | Count | Environment / evidence |
| --- | --- | --- | --- |
| Typecheck, whole repo | ✅ | 0 errors | `npx tsc -p tsconfig.json --noEmit`, 2026-11-15 00:37 and again after the seeding change (00:45) |
| Unit/API suite | ✅ | **840 passed, 39 files** | `npx vitest run`, working tree at 00:51: 831 product tests, 5 for the `/pitch` route, 4 for the opt-in demo seeding (`tests/unit/seed-on-start.test.ts`) |
| Browser suite (Playwright, production build, Sample mode, throwaway DB) | ✅ | **30 passed, 6 skipped by design** | `npx playwright test`, 2026-11-15 00:39–00:41; phone, phone-small and desktop projects: the Light journey (share a photo → Preview Light → Make mine → Ready → a photo that persists → Edit with Ori → undo keeps every entry), launcher, People, Agent, landing "Try an example", screens at 320/390/768/1440 without clipping, 44 px tap targets |
| Live model, local (`server/scripts/ori-live-smoke.ts`, `claude-opus-5-5`, 3 calls) | ⚠️ 10/11 | | 2026-11-14 23:48; `docs/ori/evidence/live-smoke-2026-11-15.txt`. The miss ("offers to keep it") was fixed after the run: Ori now always adds a Keep card when it proposes an app or an exploration. The first live reply to a shared photo took 103 s on this machine |
| **Live model on the deployed service** (Render, `https://ori-fjrx.onrender.com`, 4 calls) | ✅ | 4/4 live, 0 fallbacks | 2026-11-15 00:47–00:49, deployed commit `809eed0`; each step's own record says `generatedBy: anthropic` with no fallback reason: Agent reply 10.5 s, app design 16.5 s, revision 3.1 s, a shared photo 17.3 s (read status "read"; it offered to add the photo to the app made a minute earlier, a light walk, and "Just keep it", so the Keep fix is confirmed live). `docs/ori/evidence/render-live-check-2026-11-15.txt` |
| **Journey on the deployed service** (`scripts/verify-deploy.mjs --phase before --expect-live yes`) | ✅ | **19/19** | same run: sign up, log out, log in, share → reply → design → Make mine, photo upload, an observation with the photo, the photo refused to another account (404), revision previewed and applied with the observation unchanged (fields 8 → 11), the app reopened at its own link. One throwaway account and one app were created on the live database; nothing else was touched |
| Records and photos after a service restart (deployed) | ⏳ pending | | `--phase after` once the next deploy has restarted the service |
| Pitch on the deployed service | ⏳ pending | | `/pitch` → `/pitch/`, the deck, the three recordings, `node scripts/check-pitch.mjs --base https://ori-fjrx.onrender.com/pitch/` |
| Demo account on the deployed service | ⏳ pending | | needs `SEED_DEMO_PASSWORD` and `SEED_DEMO_ON_START=true` in the service's environment (only the founder can set them); then the demo login and its apps are checked |
| Deployment stand-in, local (`npm start` with production settings, Sample mode, throwaway DB, seeding on, one restart) | ✅ | 18/18, then 10/10 | 2026-11-15 00:46; `docs/DEPLOY.md` → Verified locally |
| Opt-in demo seeding at boot | ✅ | 2 boots | first boot created the demo account with Riff, Light, People and 4 example photos; the second kept everything and added nothing; the password appears in no log |
| Visual review against the ten references | see doc | | `docs/ori/VISUAL_REVIEW.md`; screenshots `docs/ori/screens/` (390 and 1440) and `docs/ori/screens/states/` (empty, error, offline, reduced motion) |
| Accessibility | ⚠️ partial | | named controls, focus trapped in dialogs and returned, 44 px targets, a 3 px focus ring, AA-checked text pairs, reduced motion; automated checks only, no screen-reader or text-enlargement pass |
| Android emulator (`Pixel_9_Pro`, Android 17) | ✅ | | label "Ori"; install and cold start; sign-in inside the shell; the shortcut intent opens Light directly, warm and cold (`docs/ANDROID.md`, `docs/ori/evidence/android/`). Pinning a new shortcut through the launcher dialog was not re-run this session |
| Physical phones (iPhone home screen, Android device) | ⏳ not run | | no device was available; nothing here is a physical-phone result |
