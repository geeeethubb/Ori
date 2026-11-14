# Build plan and acceptance checks

Version 1.0 | November 14, 2026

## 1. Starting point and evidence

The previous builder reported a Vite/React/TypeScript client, a Hono/Node server, SQLite persistence, validated AppSpec generation, email/password sessions, context import, recommendations, revisions with undo, app manifests, and a Capacitor Android shell. It also reported passing unit/API/browser tests. These are historical handoff claims, not newly verified results.

Inspect the actual repository, scripts, database schema, model adapter, app renderer, and deployment configuration. Establish a current baseline before using those claims. Retain the working stack unless a concrete problem requires a change.

Do not overwrite `.env`, change the configured AI model without a reason, reset the database, recreate users, or replace the project wholesale to achieve a visual redesign.

## 2. Implementation order

The following are suggested effort budgets for a focused 12-18 hour revision pass. They are planning estimates, not a promise of continuous agent execution. When time is shorter, reduce optional scope while retaining one complete journey.

### Phase 0: inspect and preserve (approximately 30-60 minutes)

- Read repository instructions, package scripts, existing build status, and this package.
- Identify the current entry points for routes, layout, global styles, auth, AppSpec, persistence, model calls, and install metadata.
- Capture a baseline of the main screens and run the appropriate existing checks.
- Preserve user changes; create a branch/checkpoint when appropriate. Back up persistent data before any schema migration.
- Write a concise implementation map into `BUILD_STATUS.md`, including actual files, current failures, and the first concrete slice.

**Exit:** the builder can identify what it is preserving and where it will make the change. Proceed to implementation in the same session.

### Phase 1: visual foundation and navigation (approximately 1-2 hours)

- Introduce parent design tokens and scoped app tokens.
- Add Agent / Playground / My apps navigation and a compact settings entry.
- Implement the responsive shell, a useful empty state, and a revised landing hero with a real product preview.
- Use the temporary product name from a central configuration.
- Capture mobile and desktop screenshots and correct obvious hierarchy/spacing problems immediately.

**Exit:** the shell visibly matches Electric Playground and no longer looks like the original cream/brown form portal.

### Phase 2: one complete inspiration-to-app slice (approximately 3-4 hours)

- Add capture of text, links, and images using existing facilities where possible.
- Implement honest source read states and a concise agent response with grounded proposals.
- Create a visual app preview, one meaningful customization, and the build/open flow.
- Make the music reference experience functional: saved inspiration links, practice timer, session save/reload, and a tempo helper if time permits.
- Preserve the stable URL and revision/undo behavior.

**Exit:** a user can share an inspiration, choose a useful direction, create/open a differentiated app, perform its main action, and keep the result.

### Phase 3: distinct apps and Playground (approximately 3-4 hours)

- Build the photography gallery with real upload/display and preserve text-only legacy records.
- Redesign the people/follow-up experience with a compact next-action queue.
- Replace recommendation reports with concise preview cards. Add exploration options that do not always require an app.
- Rebuild My apps as a recognizable launcher/collection.
- Implement "Make this more me" with a readable change preview and preserved data.

**Exit:** photography, music, and follow-up tools differ structurally and functionally; all three are usable.

### Phase 4: phone delivery, evidence, and polish (approximately 2-3 hours)

- Verify per-app URLs, titles, manifests, icons, authentication, and owner boundaries.
- Verify Add to Home Screen guidance on a reachable HTTPS origin; localhost on the development computer is not the phone's server.
- Preserve the existing Android shell and its pinned app shortcuts. Distinguish one shell APK with shortcuts from a separate APK per generated app.
- Finish empty/loading/error states, keyboard/touch behavior, long content, reduced motion, and contrast.
- Integrate actual Velocity outputs and record exactly how they affected the build.

**Exit:** the primary demo can run reliably on a phone, with remaining physical-device checks labeled.

### Phase 5: final verification and handoff (approximately 1-2 hours)

- Run the appropriate existing and new checks; fix regressions.
- Record before/after screenshots and inspect them, not just save them.
- Prepare a three-minute demo, exact run commands, known limitations, and a resume checkpoint.
- Update the repository README to describe actual behavior. Keep roadmap claims separate.

**Exit:** the acceptance checklist below is complete or each remaining item is specifically blocked/deferred with its reason. No placeholder buttons in the primary demo path.

## 3. Technical direction

### Preserve the stable core

Keep current auth, owner checks, record persistence, app URLs, migrations, exports/imports, app revisions, undo, and install metadata. Preserve old app IDs and field IDs. Use additive/backward-compatible migrations and keep unknown record fields where the existing system supports them.

### Proposed data contracts

These are conceptual contracts; adapt names and storage to the existing code rather than blindly adding duplicate tables.

| Entity | Minimum useful fields |
| --- | --- |
| Capture | id, ownerId, kind, original text/link or media reference, source label, createdAt, readStatus |
| Context item | id, ownerId, statement, explicit/inferred status, sourceIds, relevance/recency where meaningful, user correction/deletion state |
| Proposal | id, kind (exploration/new app/update app), outcome, first action, sourceIds, short rationale, targetAppId if applicable |
| App specification | schema version, identity, existing data schema/field IDs, design specification, views, allowed actions/capabilities, asset references |
| App revision | prior/current spec references, migration description, acceptedAt, reversible changes where supported |
| First-party event | ownerId, appId/proposalId when applicable, event type, time; minimize content payloads |

Suggested events: capture_saved, proposal_opened, app_created, first_action_completed, app_reopened, revision_accepted, revision_undone. Do not track private activity in other phone apps or claim installation based only on opening install instructions. Treat home-screen installation as confirmed only where actually observable or reported by the user.

### Generated UI contract

For the core pass, evolve the current AppSpec/runtime so the AI can choose and combine actual task capabilities, views, and designs. Keep data contracts stable while changing presentation. A design specification should cover layout, type scale, colors, density, and content hierarchy; actions must bind to real capabilities.

Examples of capabilities: image gallery/upload, source-link collection, session timer, tempo helper, next-action queue, record form, small summary, and revision controls. The renderer must be able to produce structurally different apps; a single universal form renderer with different labels does not meet the goal.

Keep validation at generation, revision, and runtime boundaries. Handle an unsupported proposal honestly: offer a supported version or explain that the capability is not ready. Do not simulate a working integration.

### Custom generated frontends: bounded next step

If the core is complete and time remains, prototype a separate, feature-flagged path for generating a custom frontend bundle. This is not required to replace the reliable core during this revision.

Use an isolated build/preview environment, dependency allowlist, narrow data/action SDK, server-side ownership enforcement, and a versioned publish/rollback process. Generated code must not inherit server secrets or arbitrary backend execution. Keep the working version live if validation fails. Use official documentation for any new sandbox or hosting integration.

The application owns hosting/publishing. Calling an AI model alone does not publish a hosted third-party artifact. Describe honestly whether a demo used a declarative runtime, a custom renderer, or generated frontend code.

### Media and shared URLs

Store media privately with owner authorization; validate file type/size and render safe content. Do not turn user-supplied URLs into unrestricted server-side network fetches. If a supported URL extraction path is absent, store the URL and the user's note. An inaccessible social post is a normal state, not a reason to invent its contents.

## 4. Acceptance checklist

### Product journey

- [ ] New users can see a useful example or enter one interest without importing a biography.
- [ ] Text/link/image capture preserves the source and correctly distinguishes read content from saved-only links.
- [ ] A passing inspiration can remain a save without becoming a permanent interest or new app.
- [ ] A proposal has a concrete outcome, short grounded reason, actual preview, and working next action.
- [ ] The agent can propose using or updating an existing app.
- [ ] Two different real profiles/inspirations produce materially different recommendations; explain the evidence.

### Visual quality

- [ ] Electric Playground governs the parent shell; Studio Pop provides expression within the apps.
- [ ] Agent, Playground, and My apps are easy to distinguish and navigate.
- [ ] Photography is image-first, music is session/control-first, and relationships are person/action-first.
- [ ] Main screens fit 390px, 768px, and 1440px; 320px has no accidental horizontal overflow.
- [ ] Sources and uncertainty remain accessible without dominating the interface.
- [ ] No generic sparkle logo, excessive metadata pills, repeated identical app cards, or nonfunctional primary CTA.
- [ ] Essential text, controls, keyboard focus, contrast, and touch targets are verified.

### Runtime and data

- [ ] Existing users, app IDs, URLs, and records survive the migration.
- [ ] Save -> reload -> restart preserves records and uploaded media.
- [ ] Accept revision preserves records; undo restores the previous supported design/behavior.
- [ ] Unauthorized users cannot read or mutate another user's records/media.
- [ ] Live AI failures retain user input and offer a useful retry or labeled example path.
- [ ] No API keys appear in browser bundles, logs, screenshots, docs, or commits.
- [ ] Real-model checks are bounded and record route, outcome, latency, and model identifier without secrets.

### Delivery and evidence

- [ ] Each app has its own direct URL, title, icon, and correct fresh-request install metadata.
- [ ] Physical iPhone home-screen launch is checked or explicitly pending; desktop WebKit is not physical iOS verification.
- [ ] Android shell/shortcut behavior is described precisely, including any unverified cold-start behavior.
- [ ] Sample/demo fixtures are visibly labeled; AI-grounding claims match the actual sources.
- [ ] Actual Velocity prompts and outputs are saved and attributed; pending work is not described as complete.
- [ ] README, BUILD_STATUS, demo guide, screenshots, and test results agree with the shipped behavior.

## 5. Testing strategy

Run existing checks relevant to modified areas, plus tests for changed behavior and real risks: owner boundaries, schema migration/data preservation, accept/undo, inaccessible source handling, media access, and the complete inspiration-to-app journey. Do not create dozens of tests that merely assert CSS classes or duplicate implementation details.

Visually inspect before/after screenshots at mobile and desktop widths. Fix composition issues even if tests pass. Log failures separately from unavailable environments. Do not repeat historical test totals as current results.

## 6. Velocity contribution

Use the actual hackathon workspace. If access is unavailable, leave the contribution pending and continue independent implementation. Never claim that a prepared prompt is an executed contribution.

### Prompt A: intent to useful proposal

```text
We are building a personal AI playground with three surfaces: Agent, Playground, and My apps. A user shares an inspiration or an everyday need. Design a compact decision workflow that chooses among: keep as a source, suggest an exploration, update an existing app, or propose a new app. Inputs: the user's explicit note, read-status of the source, existing app capabilities, and editable context. Output a small validated proposal contract with an outcome, first action, short reason, and source IDs. Never infer inaccessible video contents. Demonstrate the workflow on one guitar inspiration, one photography inspiration, and one follow-up task. Return the workflow, sample inputs/outputs, failure cases, and the implementation contribution that can be exported into our repository.
```

### Prompt B: capability and design mapping

```text
Review our app-generation contract and propose a maintainable mapping from user outcome to capability, view structure, and design. Photography must be image-first; music must be session/control-first; follow-up must be person/action-first. Shared data and auth should remain reusable. Identify where one generic form renderer prevents the desired result. Return a concrete contract/schema proposal, three worked app specifications, and validation cases. Label anything that requires an unavailable integration.
```

### Prompt C: evaluate the revised demo

```text
Evaluate the attached real screens and demo results against this promise: a personal AI turns interests and everyday needs into a playground of apps made for the user. Assess grounding, first-use friction, actual usefulness, structural differences between apps, and phone delivery. Separate observed evidence from assumptions. Return the five most consequential fixes, each with a reproducible acceptance check. Do not invent user research, test results, or product capabilities.
```

Store actual materials in `docs/velocity/` and summarize prompt, date, output, resulting code/design decision, and remaining gaps in `docs/velocity-contribution.md`.

## 7. Handoff contract

Update `BUILD_STATUS.md` after each meaningful milestone with:

1. Current phase and working behavior.
2. Files/components changed and important decisions.
3. Commands/checks actually run and their results.
4. Screenshots inspected and issues fixed.
5. Exact remaining work, blockers, and the next command/task.

The final response must describe actual changes, validation, limitations, and exact run/demo commands. Derive commands from the repository; never overwrite an existing `.env` as part of the run instructions.
