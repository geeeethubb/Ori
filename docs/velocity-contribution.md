# Velocity contribution

**Status: PENDING.** No Velocity workspace access and no exported Velocity outputs were available
while the redesign was built (as of 2026-11-14). Nothing in this document claims that Velocity was
used; every decision in the redesign so far came from `redesign/*.md`, `docs/redesign-contract.md`
and the repository itself. The three prompts below are copied verbatim from
`redesign/BUILD_PLAN.md` section 6 and are ready to run; the *Would change* lines say exactly which
code a reviewed output would touch, so an actual contribution can be integrated and attributed
honestly later. Never describe a prepared prompt as an executed contribution.

The live app does not depend on a Velocity runtime API. Velocity is used interactively by the
founder; the model adapter (`server/model/anthropic.ts`) and the deterministic sample adapter
(`server/model/sample/*`) are separate.

## How to complete this

1. Open the actual hackathon Velocity workspace. Run Prompt A, then B, then C.
2. Save each output (export or screenshots) under `docs/velocity/` with the file names given below,
   plus the run date and the exact prompt text used (if it had to be adapted, keep both versions).
3. Apply the integration for each prompt (small, targeted edits at the paths listed), run
   `npm run typecheck` and `npm test`, and record what the output changed and what it did not.
4. Fill the evidence table at the bottom. Keep Velocity outputs, hypotheses and observed user
   behaviour distinguishable.

## Prompt A: intent to useful proposal

```text
We are building a personal AI playground with three surfaces: Agent, Playground, and My apps. A user shares an inspiration or an everyday need. Design a compact decision workflow that chooses among: keep as a source, suggest an exploration, update an existing app, or propose a new app. Inputs: the user's explicit note, read-status of the source, existing app capabilities, and editable context. Output a small validated proposal contract with an outcome, first action, short reason, and source IDs. Never infer inaccessible video contents. Demonstrate the workflow on one guitar inspiration, one photography inspiration, and one follow-up task. Return the workflow, sample inputs/outputs, failure cases, and the implementation contribution that can be exported into our repository.
```

- **Output stored at:** `docs/velocity/01-intent-to-proposal.md` (plus screenshots as PNG next to it).
- **Would change:** the Sample-mode decision workflow in `server/model/sample/respond.ts` and
  `server/model/sample/domains.ts` (when to keep / explore / update / make, the honesty lines per
  `readStatus`, what is learned from a note); the Agent system prompt and proposal instructions in
  `server/model/anthropic.ts` (`respondToCapture`); the failure cases become tests in
  `tests/unit/sample-respond.test.ts`. The proposal contract (`RecommendationDraftSchema` in
  `shared/context.ts`) changes only if the output shows a field the current contract cannot carry.

## Prompt B: capability and design mapping

```text
Review our app-generation contract and propose a maintainable mapping from user outcome to capability, view structure, and design. Photography must be image-first; music must be session/control-first; follow-up must be person/action-first. Shared data and auth should remain reusable. Identify where one generic form renderer prevents the desired result. Return a concrete contract/schema proposal, three worked app specifications, and validation cases. Label anything that requires an unavailable integration.
```

- **Output stored at:** `docs/velocity/02-capability-design-mapping.md`.
- **Would change:** the app contract in `shared/appSpec.ts` (views, capabilities, `design`), the
  three reference specifications in `server/fixtures/specs.ts` (Riff, Light, People), the
  generation prompt and its outcome-to-capability guidance in `server/model/anthropic.ts`
  (`generateSpec`), and the validation cases in `tests/unit/appSpec-redesign.test.ts`. Anything the
  output marks as needing an unavailable integration is recorded as not built, not simulated.

## Prompt C: evaluate the revised demo

```text
Evaluate the attached real screens and demo results against this promise: a personal AI turns interests and everyday needs into a playground of apps made for the user. Assess grounding, first-use friction, actual usefulness, structural differences between apps, and phone delivery. Separate observed evidence from assumptions. Return the five most consequential fixes, each with a reproducible acceptance check. Do not invent user research, test results, or product capabilities.
```

- **Output stored at:** `docs/velocity/03-demo-evaluation.md`, together with the exact screenshots
  that were attached (from `docs/screenshots/`).
- **Would change:** `docs/TEST_RESULTS.md` gains the five acceptance checks with their observed
  pass/fail status; each fix is applied where the evaluation points (storefront pages under
  `client/src/pages/`, runtime renderers under `client/src/runtime/`, or the adapters) and recorded
  in `BUILD_STATUS.md`. Fixes that cannot be verified on a phone are listed as pending, not done.

## Evidence (empty until outputs exist)

| Prompt | Run date | Output file | Decision changed | Where in code | Remaining gap |
| --- | --- | --- | --- | --- | --- |
| A | not run | pending | none yet | – | workspace access |
| B | not run | pending | none yet | – | workspace access |
| C | not run | pending | none yet | – | workspace access |
