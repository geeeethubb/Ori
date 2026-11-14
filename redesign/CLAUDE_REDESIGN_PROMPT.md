# Claude Code execution prompt: personal AI playground redesign

You are the product engineer and design lead revising an existing working hackathon prototype. Your task is to implement and verify a substantial product and visual redesign, preserving its useful infrastructure and data.

Act on this task. Do not stop after a plan, a theme swap, a landing-page rewrite, or a static mockup. Make routine implementation decisions yourself. Work through the phases below until the requested core is implemented and checked, or a specific dependency is genuinely blocked. If one dependency is blocked, continue the independent work and record the blocker.

## Read before editing

1. All applicable repository instructions, including any existing AGENTS.md and CLAUDE.md.
2. `redesign/START_HERE.md`
3. `redesign/PRODUCT_SPEC.md`
4. `redesign/DESIGN_SPEC.md`
5. `redesign/BUILD_PLAN.md`
6. The existing README, BUILD_STATUS.md, package scripts, relevant source modules, and previous test/demo documentation.

Use `redesign/Redesign_Brief.pdf` as the visual review brief if available. The Markdown files contain the implementation requirements. This package replaces earlier product/design directions where they conflict. Preserve the current working functionality and follow repository safety and workflow instructions.

## The guiding star

**Agent + Playground + Apps make the phone unmistakably yours.**

One-liner: A personal AI that turns your interests and everyday needs into a playground of apps made just for you.

Emotional promise: Your interests have somewhere to go.

The user shares something they care about. The agent helps interpret it, the playground reveals useful possibilities, and an individually designed app can become part of their daily life. Practical workflows and exploration are both first-class. Avoid reducing every interest to a tracker, journal, or to-do list.

## Confirmed design direction

- Electric Playground is the main visual system.
- Studio Pop informs expressive content and individual app identities.
- Use the exact proposed tokens in DESIGN_SPEC.md, with accessible combinations.
- Main navigation: Agent / Playground / My apps.
- The final product name is undecided. Centralize it in a brand config; use "Your Playground" as a temporary descriptive label. Do not block implementation on naming or invent a final brand decision.
- Build for phone use first, with a composed desktop layout as well.

## First deliverable

First ship one complete, attractive, working journey:

1. Share a guitar inspiration with a text note or readable screenshot.
2. Receive a concise, grounded response with exploration and app options.
3. Preview an app that fits the stated goal and time budget.
4. Customize one useful detail and create/open it at its own stable URL.
5. Use a practice timer or equivalent genuine music-specific interaction.
6. Save the result, reload, and confirm persistence.
7. Make a change with a readable preview and preserve existing data.

Then complete the photography and people reference apps, the Playground, and phone delivery checks. These apps must be structurally different, not three recolored copies of one renderer.

## Inspect before changing architecture

The previous handoff reported React/TypeScript/Vite, a Hono/Node backend, SQLite, AppSpec validation, auth, revision/undo, manifests, and a Capacitor Android shell. Treat those as clues, not proof. Inspect actual code and verify the baseline.

Identify existing routes, data models, component boundaries, media handling, ownership checks, model adapter behavior, and tests. Retain the stack and stable backend behavior unless there is a concrete reason to change them.

Preserve users, records, app IDs, URLs, field IDs, exported data compatibility, revision history, undo, and install metadata. Back up persistent data before schema work and use additive/backward-compatible migrations. Never reset or reseed real data to make a demo look correct.

Do not overwrite `.env`, print secrets, change the configured model by assumption, or copy `.env.example` over a configured environment. Use the existing API setup. Verify current official documentation before introducing a new SDK option or provider behavior. Keep model calls bounded and avoid wasteful repeated live runs.

## Product behavior to implement

- Make text/link/image capture the easy entrance. Keep AI-profile import as an optional accelerator.
- A saved URL is not necessarily read content. Store and display its read status; ask for a note/excerpt/screenshot when access is unavailable.
- The agent may suggest exploring, keeping a source, updating an existing app, or creating one. Do not turn every save into a commitment.
- Move detailed context facts and provenance into an editable memory/settings area. Preserve transparency and correction/deletion controls.
- Replace long recommendation reports with short outcome-led cards and actual app previews.
- Replace the collection's wide management rows with a recognizable app launcher/collection.
- Each app gets its own page identity, stable direct URL, icon, manifest, task-specific design, and working primary action.
- Keep accept/undo revision behavior and make it understandable as "Make this more me."
- Clearly label example content and simulated/demo behavior. Never fabricate live integrations, test results, user numbers, or completed Velocity usage.

## Visual quality bar

Do not deliver a palette swap. Rework hierarchy, spacing, composition, imagery, density, navigation, empty states, and copy.

The parent shell should feel bright and clean: near-white canvas, dark ink, confident blue actions, sparing lime and lilac accents. Use Manrope/DM Sans or close appropriate fallbacks. Remove the generic purple sparkle mark, giant serif headings, repeated metadata pills, and uniform journal-card styling.

Light is image-first, with a contact sheet/gallery and real photographs. Riff is a listening/practice space, with dark ink/lime identity and functional time/tempo controls. People is compact and actionable, organized around people and next steps. The first two must look recognizably different even before someone reads their titles.

Use properly licensed assets or user uploads. Keep asset attribution. Prefer visual content that explains a real activity. Do not copy another startup's artwork or claim its backing.

At each major visual milestone, inspect rendered mobile and desktop screenshots. Fix layout, contrast, content, and interaction issues that tests do not catch. If screenshot tooling is unavailable, state that limitation rather than claiming visual verification.

## Technical scope

Follow the core generated-UI contract in BUILD_PLAN.md. Extend the current schema/renderer with task capabilities and independent view/design composition. Bind all generated actions to real validated capabilities. Preserve a compatibility path for old apps.

Do not execute arbitrary generated code in the privileged application context. A separate sandboxed custom-frontend path is optional after the core passes. If implemented, isolate builds, restrict dependencies/capabilities, enforce ownership server-side, validate before publishing, and keep versioned rollback. Do not let this experiment consume the core redesign schedule.

The product owns publishing. Do not assume the AI API creates hosted external artifacts. Report whether the implementation uses a declarative runtime, custom renderers, or generated frontend bundles.

For external links, avoid unrestricted server-side fetches. For media, enforce owner access and appropriate validation. Preserve existing authentication rather than introducing a new provider without need.

## Execution discipline

1. Inspect and establish a baseline.
2. Record a short plan and immediately implement Phase 1.
3. Complete the full inspiration-to-app slice before expanding.
4. Finish the distinct apps and remaining screens.
5. Verify phone delivery and integrate actual Velocity work.
6. Run appropriate checks, fix regressions, and deliver an evidence-based handoff.

Keep BUILD_STATUS.md updated after meaningful milestones so another session can resume. Record the exact next task if interrupted. Do not loop indefinitely or claim you will keep running when the session has stopped. At completion, stop with a clear result rather than inventing extra scope.

Use milestones and acceptance criteria, not a fixed promise about hours. Ask for user input only when a missing product decision or external dependency truly blocks progress. Name, minor styling, folder organization, and ordinary refactoring choices are not blockers. Respect existing tool permissions; this prompt does not change them.

## Verification

Use the checklist in BUILD_PLAN.md. Prioritize meaningful regression tests: existing record migration, persistence, authorization, source-read honesty, media access, accept/undo, and a complete browser journey. Do not inflate test counts with implementation-mirroring assertions.

Run the repository's relevant type/build/test checks. Use at least two differing profiles/inspirations for recommendation verification. Test keyboard and touch behavior, error recovery, and 390/768/1440px layouts; check 320px for overflow.

For home-screen delivery, verify metadata and direct launch behavior. Mark physical iPhone verification pending if no device is available. State precisely whether Android uses one shell APK with shortcuts or independent APKs. A simulator or matching intent test is not automatically equivalent to every physical launch path.

## Velocity

Use actual outputs provided by the user or a genuinely accessible workspace. Prompts are in BUILD_PLAN.md. Save prompt/output/implementation evidence under docs/velocity and summarize the contribution. If access is unavailable, keep it pending and complete the rest. Do not manufacture tool access or attribution.

## Required final handoff

- A working revised application in the existing repository.
- Updated BUILD_STATUS.md with exact status and resume information.
- Before/after screenshots and a short visual review.
- Updated docs/DEMO.md with the real three-minute journey.
- Updated docs/TEST_RESULTS.md separating automated, real-model, browser, emulator, and physical-device evidence.
- Updated docs/velocity-contribution.md with actual work or a precise pending state.
- Updated README with correct run commands, product behavior, and known limits.
- A concise final report: what changed, what was actually tested, what remains, and how the user can run and review it. Do not include any command that overwrites an existing .env.

Begin by inspecting the repository now, then continue into implementation.
