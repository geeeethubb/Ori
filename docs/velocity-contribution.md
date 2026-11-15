# Velocity contribution

**Status (2026-11-14):** Velocity design outputs 01–05 were produced in the founder's Kearney Velocity workspace. Their accepted decisions are now **integrated and tested in this repository** (section 3). **Prompt C, the real-screen evaluation, is still pending**: the evidence for it is assembled in `docs/velocity/PROMPT_C_PENDING.md`, but the prompt itself has to be run in the Velocity workspace.

Velocity was used to design and challenge decisions. It did not write application code, inspect this repository or run its tests; everything under "Integration" was implemented and checked here. The live app does not call Velocity.

## 1. What Velocity actually produced (as delivered with the package)

Used the signed-in Kearney workspace at kearney-perlab.growthsignals.com. Created the Personal AI Playground concept under Kearney 2026 — Personal AI Playground, saved the supplied Build Plan as a source, attached research and final corrections, and generated/revised the Hackathon Decision & Demo Canvas. The concept is favorited.

| Run | Actual output | Resulting decision | Status in this repository |
| --- | --- | --- | --- |
| 01 — Prompt A plus context | Routing table, proposal union, three fictional fixtures and negative cases | Route intent before creating apps; retain source evidence | Integrated through the 04 decisions (01's flaws were superseded by Velocity itself) |
| 02 — Prompt B plus corrections | Text captures, seven routing outcomes, three AppSpec examples, renderer mapping | Separate use_existing_app from update_app_design; specialize gallery/session/queue | Integrated: `use_app` vs `update_app`; the specialized views already existed |
| 03 — review/addendum | Semantic binding configs, clock/status behavior, scoped styling, 12 adversarial cases | Make interactions concrete; runtime validation and data-safe revision gates | Integrated; **all 12 cases now run as automated tests** (`tests/unit/velocity-cases.test.ts`) |
| 04 — final correction | Ten final decisions and builder handoff | Preserve legacy field meaning; nullable/version-gated additions; configurable timer duration | Integrated (authoritative); mapped decision by decision in `docs/velocity/INTEGRATION_REPORT.md` |
| Canvas — generated then revised | Pitch, three-minute demo, pricing experiment, pilot metrics and risk checks | Benefit-led demo; separate capture success, useful action and active reuse | Measures instrumented (`useful_action`); demo script rewritten in the next pass; market and pricing claims are not product evidence |

Live workspace links (from the package; they may require Kearney Velocity workspace access): [research thread](https://kearney-perlab.growthsignals.com/research/id-1794674829478-0.d43a12a7b3c1c) · [concept](https://kearney-perlab.growthsignals.com/concept/32c37b9f-e0b8-4c35-a1c2-1a45bfe7c1a4) · [canvas](https://kearney-perlab.growthsignals.com/concept/32c37b9f-e0b8-4c35-a1c2-1a45bfe7c1a4/canvas/2800237e-d388-4420-a883-d1b204347149). Exact prompts and outputs: `docs/velocity/01_intent_to_proposal.md` … `05_hackathon_canvas.md`; the package's own note is kept as `docs/velocity/velocity-contribution.from-velocity-package.md`.

## 2. What already existed before Velocity (not attributable to it)

The redesign that Velocity evaluated was built before its outputs arrived (commits up to `60f4c3a`): Agent / Playground / My apps; honest read status for links and screenshots; grounded proposals with "Why this?"; real app previews; the three structurally different apps (Riff, Light, People) with Electric Playground and Studio Pop design; revisions with preview, accept and undo; owner-scoped media; per-app install metadata and the Android shell. A read-only mapping of the code against Velocity's decisions found 49 of 138 items already met; those are existing functionality, confirmed (not created) by Velocity.

## 3. Decisions adopted from Velocity, exactly

All from `ACCEPTED_DECISIONS.md` and `04_final_corrections.md`, adapted to this repository's v1 contract (no AppSpec v2 migration; the table of adaptations is in `INTEGRATION_REPORT.md` §6).

1. **Use the app you have.** A need an owned app already meets is answered by opening that app (`use_app`), never by a duplicate app or a design change; adding an entry is a record action confirmed in the app. (02, 03 cases 3 and 6, 04 #1)
2. **Unsupported and save-only are real outcomes.** Replies list impossible integrations by name; a passing save stays a save and adds nothing to memory; "Keep" removes what was learned from that share. (02, 04 #2–#3, cases 1 and 11)
3. **Semantic bindings, validated at acceptance.** Views bind roles by field id; a bound field cannot be hidden; one field per role; checks run at generation, Make mine and every change, never at load. (03, 04 #8, #10)
4. **Never reinterpret a duration; plan and measurement apart.** `minutes` keeps its meaning; planned minutes and timed seconds are new field ids in new apps only; the plan is never saved as time played. (04 #5–#7)
5. **A real clock.** Elapsed time from clock intervals, pause excluded, reload and away reconciliation, one save per session id. (03, 04 #7)
6. **Dates keep the person's words.** No date is guessed; the form suggests one to confirm. (03 case 7, 04 #8)
7. **Exactly-once confirmed writes and fresh checks at selection.** Client ids, idempotent Make mine and Accept, expected versions on undo, stale proposals refused. (04 #1, #9, cases 8 and 9)
8. **Data-safe design undo, separate from record undo.** Newer fields come back hidden, used choices stay, undo that would strand entries is refused with a reason; record edits are conflict-checked and "done" has its own undo. (03 §3, 04 #9, case 12)
9. **Measures that separate saving from doing.** A `useful_action` event; first-action counts only timed sessions; carried entries and example shares never count. (Canvas, ACCEPTED "Measures")

## 4. Files changed for the integration

New (commit `a88d8e0` unless noted): `shared/drafts.ts`, `server/services/revisionGuards.ts`, `server/model/sample/unsupported.ts`, `server/db/migrations/003_velocity.sql` (additive), `server/scripts/velocity-live-smoke.ts`, `tests/unit/velocity-cases.test.ts`, `tests/unit/velocity-runtime.test.ts`, `docs/velocity/INTEGRATION_REPORT.md`.

Review fixes (`26381e8`, after an adversarial review of the integration): `server/db/migrations/004_forgotten_captures.sql` (additive), `tests/unit/velocity-review-fixes.test.ts`, `tests/unit/velocity-memory-fixes.test.ts`, `client/src/runtime/recordFlows.test.ts`, `client/src/runtime/practiceTimer.test.ts`, plus changes to files listed below.

Changed: contracts `shared/appSpec.ts`, `shared/context.ts`, `shared/revision.ts`, `shared/records.ts`, `shared/time.ts`, `shared/api.ts`; server `server/routes/{agent,apps,recommendations,revisions}.ts`, `server/repos/{apps,captures,context}.ts`, `server/model/anthropic.ts`, `server/model/types.ts`, `server/model/sample/{respond,domains,recommend,revise,heuristics,generate}.ts`, `server/fixtures/specs.ts`, `server/services/linkMeta.ts`, `server/config.ts`; client `client/src/runtime/{AppHome,PracticeView,QueueView,RecordForm,RecordSheet,practiceTimer,runtimeUtils,useAppData,viewLogic}.tsx|ts`, `client/src/runtime/settings/{HistorySection,ReviseSection}.tsx`, `client/src/pages/{AgentPage,MakePage}.tsx`, `client/src/pages/parts/{helpers.ts,ProposalBits.tsx}`; tests `tests/unit/{api,appSpec-redesign,redesign-api,revision,sample-adapter,sample-respond}.test.ts`, `client/src/**/*.test.ts`, `tests/e2e/{journey,mobile}.spec.ts`, `tests/e2e/helpers.ts`, `playwright.config.ts`; docs `docs/redesign-contract.md`, `BUILD_STATUS.md`, `docs/TEST_RESULTS.md`. Review fixes after `a88d8e0` are listed in `INTEGRATION_REPORT.md` §8.

## 5. Checks actually run

Recorded with counts and environments in `docs/TEST_RESULTS.md` §7, all on 2026-11-14:
- Typecheck: 0 errors.
- Unit and API suite: **555 passed in 26 files** at `eb2f82c` (526 in 24 files at `26381e8` alone), including the 12 Velocity cases (22 tests), the runtime decisions (14), the review fixes (15), memory and idempotency (26), client record flows (35) and the practice timer (19).
- Browser suite (Playwright, Sample mode, throwaway database): 14 passed, 4 skipped by design, on phone, small phone and desktop.
- One bounded live run of five model calls on `claude-opus-5-5`: 15/15 checks (`docs/velocity/evidence/live-smoke-2026-11-14.txt`).
- Evidence screenshots at 390 and 1440 px in Sample mode: `docs/velocity/evidence/screens/`.

Not run: a live browser journey after these changes, the Android emulator, physical devices, Prompt C.

## 6. Remaining gaps

- Prompt C has not been run in Velocity; the evidence package is ready (`docs/velocity/PROMPT_C_PENDING.md`).
- Physical iPhone and Android home-screen checks are pending (no device attached).
- Deferred design items (threaded answers to the agent's question, a per-session source link in Riff, a text-only observation in the reference Light, a measures report with the observed-study log) are listed with reasons in `INTEGRATION_REPORT.md` §9.

## 7. Honest judge-facing attribution

"We used Velocity to design and challenge the decision workflow, map three different app experiences to capabilities, identify failure cases, correct data-preservation risks, and prepare the demo and validation plan. We then integrated and tested those decisions in our product repository."

(The second sentence is now accurate: the integration and its tests happened here. Velocity itself did not implement the app or execute its tests.)
