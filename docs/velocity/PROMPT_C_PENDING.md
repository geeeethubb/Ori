# Prompt C — pending real evidence

This prompt is PREPARED, NOT EXECUTED. Do not count it as completed Velocity evaluation.

## Evidence to attach

- Actual Agent, Playground, My apps, Light, Riff and People screens; 390px and 1440px plus 320px overflow/768px checks.
- Real demo recording or observed step-by-step results with route and environment.
- Existing AppSpec and relevant field semantics; migration/undo behavior; capability registry and owner/media checks.
- Actual results for save/reload/restart, timer elapsed/background/reload/duplicate save, legacy text-only entries, failed media, date handling, cross-owner denial, revision cancel/accept/undo after newer data.
- Device identity and physical home-screen launch evidence, or explicit pending status.
- Separate live AI results from labeled example fixtures; include latency and model identifier without keys.

## Evidence assembled so far (2026-11-14)

Observed in this repository; nothing here is a Velocity output. Sample mode = the deterministic adapter, labelled in the UI; live = the configured model.

- **Screens (Velocity pass, before the Ori redesign):** `docs/velocity/evidence/screens/` at 390 and 1440 px (Sample mode, throwaway database): landing, Agent, Playground, My apps, Light, Riff, People, memory, the Make page (preview, use an app you have), and four flows: opening Riff from a suggestion with the saved link waiting for confirmation (`flow-use-riff-*`), People with a drafted follow-up (`flow-use-people-*`), saving a timed practice session with plan and measured time kept apart (`flow-practice-save-*`), and the data-safe undo plan (`flow-undo-plan-*`). The Ori redesign that follows replaces these screens; attach its final screenshots (`docs/ori/`) when running this prompt, and treat these as the before state.
- **Observed journeys (Sample mode, browser):** share a sound → Make mine → practise → the session survives a design change and an undo (phone, small phone, desktop); direct app URLs serve app-specific install metadata, sign in in place and never leak across users; overdue/due-soon highlights clear when done; main screens fit 320/390/768/1440 without clipping. Suite: 14 passed, 4 skipped by design.
- **Live AI (bounded):** five calls on `claude-opus-5-5`, 15/15 checks: use the Riff you have (no duplicate, no design change, no claim of having watched the reel); a People entry keeping "Thursday" as said; Spotify/Instagram sync named as not possible; a save-only share stays a save; the designer keeps planned minutes and timed seconds apart. Latency 105.2 s for the first call, 5–21 s for the rest. `docs/velocity/evidence/live-smoke-2026-11-14.txt`.
- **AppSpec and field semantics:** v1 with additive bindings (practice `targetMinutesFieldId` = plan, `timedSecondsFieldId` = clock; queue `dueTextFieldId` = the person's words, `draftFieldId`); roles checked at acceptance (`checkBindings`), never at load. `docs/redesign-contract.md`.
- **Migrations and undo:** 003 and 004 are additive (reply unsupported list, share-linked memory, forgotten-share tombstones, `edited_at`); undo keeps newer fields someone filled in (hidden), keeps used choices, and refuses to strand entries; Undo/Redo alternate.
- **Owner and media checks:** foreign app/record ids → 404; another person's photo in a record → 422; client-minted ids owned by someone else → generic 400; a forgotten share id is never accepted again.
- **Results for the named risks:** save/reload (browser journey + persistence tests); timer elapsed, background, reload, two tabs and duplicate save (practice timer tests 19, browser reload check); legacy text-only entries readable (runtime tests); date handling keeps the person's words and suggests a date (Velocity cases 6 and 7); cross-owner denial (API tests); revision cancel/accept/undo after newer data (Velocity case 12, review-fix tests, browser journey).
- **Devices:** physical iPhone/Android home-screen launch **pending** (no device attached). The last emulator evidence is from session 2, before this pass (`docs/TEST_RESULTS.md` section 4).
- **Not yet available:** a recording of the full journey; Prompt C itself.

## Prompt

Evaluate the attached real screens and demo results against this promise: a personal AI turns interests and everyday needs into a playground of apps made for the user. Assess grounding, first-use friction, actual usefulness, structural differences between apps, and phone delivery. Separate observed evidence from assumptions. Return the five most consequential fixes, each with a reproducible acceptance check. Do not invent user research, test results, or product capabilities.

Use the final accepted implementation decisions from the Personal AI Playground Workflow thread. Consider older contradictory examples superseded. Identify evidence by provided file/screen/run. Mark missing tests as unknown; distinguish a browser simulation from a physical iPhone or Android launch. Prioritize the complete inspiration-to-app-to-use-to-reopen story and the visible difference between image-first Light, session-first Riff and person/action-first People. Do not rate “save-only” as app activation, and do not infer source contents from saved links.

