# Velocity contribution

**Status: PENDING.** No Velocity workspace access or exported outputs were available in this repository while the prototype was built. Nothing below claims Velocity was used. The sections marked *Founder to run* are ready to paste into the Velocity workspace; the *Integration point* under each one says exactly where the reviewed output changes the build.

The live app does **not** depend on a Velocity runtime API. Velocity is used interactively; the model adapter in `server/model/anthropic.ts` is separate.

## How to complete this (≈ 45 minutes)

1. Open the Velocity workspace. Run the four tasks below in order (sensing → concepts → requirements → validation).
2. Save each output (export or screenshot) into `docs/velocity/` as `01-customer.md`, `02-concepts.md`, `03-requirements.md`, `04-validation.md` (screenshots as PNG next to them).
3. Apply the integration point for each task (small, targeted edits; file paths given).
4. Fill the *What changed because of Velocity* table at the bottom. Keep hypotheses and Velocity outputs distinguishable from observed user behaviour.

## Task 1 — Pressure-test the customer hypothesis (sensing)

*Founder to run:*

```text
We are building "AI App Store": a personal AI app store for individuals. Someone imports a
context summary from their AI conversations, reviews the facts, sees apps recommended for both
their recurring workflows and their hobbies/curiosity, builds one in a minute, adds it to their
phone home screen, and revises it later without losing data. B2C subscription: 14 days free,
$7.50/month for two months, then $15/month.

Initial segment hypothesis: AI-heavy students, founders and early-career builders juggling
several projects and at least one active hobby.

1. Stress-test this segment. Which three sub-segments feel the pain of "advice and inspiration
   that never becomes a tool" most acutely, and why?
2. For each sub-segment, list the top 3 recurring workflows and top 3 interests they would
   realistically want a small personal app for.
3. Which objections would stop them from pasting an AI-generated profile into a new product?
4. What would make them return on day 2 and in week 2?
Return a concise table plus 5 interview questions to ask in a 10-minute first-use session.
```

*Integration point:* interview questions → `docs/DEMO.md` (observed-session script). Sub-segment workflows/interests → trigger keywords and concept list in `server/model/sample/catalog.ts`, and the two sample profiles in `server/fixtures/sampleContext.ts` (keep them fictional and labelled sample).

## Task 2 — Concept generation for the three demo apps

*Founder to run:*

```text
Generate concepts for three small personal apps our runtime can build. The runtime supports only:
fields (text, long text, date, number, choice, checkbox, 1–5 rating, link, tags), views (dated
journal, board with columns from a choice field, list, summary with count/sum/average/streak),
and rules (due-soon/overdue highlighting; a rotating daily/weekly prompt). No notifications,
integrations, attachments or custom code.

Apps: (a) "People to Follow Up With" for a founder who forgets follow-ups after networking;
(b) "Photo Walk Journal" for someone learning street photography on weekend walks who wants a
weekly challenge and a reflection; (c) a third app that connects work and exploration for a
student learning guitar with assignment deadlines.

For each: the 5–8 fields with conversational labels, the default view, the one rule that makes it
useful on day one, the empty-state sentence, the first action in the first minute, and two
revisions users are likely to ask for after a week.
```

*Integration point:* field labels, prompts and rules → `server/fixtures/specs.ts` (fixtures) and the matching `buildSpec` functions in `server/model/sample/catalog.ts`; likely revisions → `tests/unit/sample-adapter.test.ts` and the "quick suggestion" chips in `client/src/pages/RecommendationPage.tsx`.

## Task 3 — Requirements and edge cases

*Founder to run:*

```text
Write acceptance requirements for a personal-app runtime with versioned definitions and
records that must survive revisions. Cover: adding a field after entries exist; hiding a field
without losing values; undo; due-date boundaries (due today vs overdue vs due in 3 days,
completed items never overdue); offline save failure; a sign-in that returns to the exact app
URL on an iPhone home-screen web app; two home-screen icons that open two different apps.
Format: Given/When/Then, max 20 items, ordered by demo risk.
```

*Integration point:* new Given/When/Then items → browser tests in `tests/e2e/` and unit tests in `tests/unit/rules.test.ts`; record pass/fail in `docs/TEST_RESULTS.md`.

## Task 4 — Persona validation of recommendations (simulation)

*Founder to run:*

```text
Here are two context profiles (paste fixtures/sample-context-founder-photographer.md and
fixtures/sample-context-student-musician.md). For each, act as that persona and react to these
recommendation cards: <paste the For You cards from the app, including "Why this fits you">.
Which card would you tap first and why? Which reason felt generic? What is missing that you
would have expected from someone who read your profile? Suggest better one-line reasons that
quote the profile.
```

*Integration point:* reason wording → the recommendation system prompt in `server/model/anthropic.ts` (`recommend`) and `reasonTemplate` strings in `server/model/sample/catalog.ts`. Persona reactions are hypotheses; confirm with the five observed first-use sessions.

## What changed because of Velocity

| Task | Output file | Decision changed | Where |
| --- | --- | --- | --- |
| 1 | pending | – | – |
| 2 | pending | – | – |
| 3 | pending | – | – |
| 4 | pending | – | – |
