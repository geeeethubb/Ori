# Ori implementation prompt for Claude Code

Paste this as the task instruction in the existing prototype repository. This is an implementation brief; it does not change tool permissions or override repository safeguards.

---

You are the product engineer and interaction designer implementing the final Ori companion direction in an existing working prototype. Read the attached `ORI_DESIGN_SPEC.md` and all supplied design images, then inspect the repository and implement the redesign. Continue through implementation, rendered visual review, fixes, and the evidence-based handoff. Do not stop after describing a plan or changing colors.

## Product and brand decisions are settled

The name is **Ori**. The chosen brand symbol is the **Little Companion**: cobalt flame-pebble, one asymmetric curled tip, white eyes, lime cheek. Pair it with the custom rounded lowercase **ori** wordmark from concept 06. Pocket World is the supporting idea of the personal collection; it is not the primary app icon.

The guiding star is **Agent + Playground + Apps make the phone distinctly yours**.

The combined product message is **“Your AI companion. Your world, in your pocket.”**
The concrete promise is **“Apps made for you. Right on your home screen.”**
The emotional headline is **“Your interests have somewhere to go.”**
The short signature is **“Your curiosity. Your story.”**

Use each in its appropriate place, not all together on every screen. This direction supersedes older documents saying the name is undecided or prescribing the generic purple sparkle. Preserve functional requirements and the working Velocity changes.

## Read and inspect first

1. Applicable AGENTS.md, CLAUDE.md, and repository instructions.
2. `ORI_DESIGN_SPEC.md` wherever supplied; preferably keep it in `docs/ori/`.
3. All attached reference images. Identify them by visible headings if filenames are opaque. Three approved images cover identity/moods, Agent/Riff, and the combined hero. Seven new numbered images cover the demo appendix.
4. Current BUILD_STATUS.md, README, package scripts, test/demo docs, and Velocity integration/contribution notes.
5. Actual brand config, routes, shell, Agent/capture/proposal components, AppSpec, app renderers, revision/undo, model adapters, media handling, auth, manifests, and Android implementation.

Establish the real baseline. The previous reported stack and test counts are clues, not proof. Do not change frameworks or model providers because another stack is more familiar. If the repo has local edits, preserve them. Make routine styling/component decisions yourself and proceed without asking the user to reapprove the chosen design.

## Output quality

The screenshots are art direction and intended screens, not an image layer to paste over the app. Implement real responsive components with real working controls. Keep presentation frames, slide titles, and decorative phone bezels out of the app UI. Match hierarchy, density, imagery, spacing, primary actions, and per-app personality.

The written spec resolves generated-image inconsistencies. In particular:

- Canonical icon colors and forms must stay consistent across all placements.
- Standalone Light/Riff/People do not inherit the parent bottom navigation, even though one revision mockup accidentally includes it.
- Preview photos, names, dates, and text are illustrative, not actual user records.
- Any bell/menu/transport control needs real behavior; remove unsupported ones.
- Maintain accessible contrast even when an image uses low-contrast orange/white.
- Show backend build stages only if the backend provides those states. Otherwise show a truthful pending state, not simulated milestones.
- A home-screen concept is not proof of OS installation, native packaging, or device verification.

## First implementation milestone: reusable brand and stateful companion

Create or adapt a central brand config and reusable production assets:

- A faithful SVG companion with stable body path and separate eyes/cheek/accent groups.
- A custom SVG ori wordmark, ink/cobalt/light variants, and accessible labeling.
- Parent favicon/app icon and canonical reference-app icons, preserving user-customized icons.
- A presentational `OriCompanion` component with `idle`, `attentive`, `thinking`, `discovery`, `building`, `success`, `clarify`, and `error` states.
- An isolated visual-preview route or existing component gallery that shows all states, sizes, backgrounds, and reduced motion without touching real data or invoking the model.

Use existing CSS/motion infrastructure where practical. Do not add a heavy animation stack for an eye blink. Keep the companion faithful to the approved silhouette rather than inventing an emoji or unrelated character. No arms or costumes. The app-icon version stays static.

Derive state from the current UI operation. Do not ask the language model to choose a mood or expose arbitrary model-produced SVG/styles. “Thinking” means a real request is pending. “Making” means a create/apply operation is pending. “Ready” requires a successful persisted result. Focus can produce an attentive pose but must not interrupt a pending build or imply microphone recording. Use operation IDs to avoid stale responses changing the current state. Clean up motion and timers on cancel, resolution, route changes, and unmount.

Respect reduced motion, keyboard focus, assistive text, and calm error handling. Success is a short acknowledgement, not a manipulative celebration. No guilt, streak pressure, or emotional dependency messaging.

## Second milestone: one complete polished Light journey

Implement this end to end using the existing backend:

1. A person shares a photography thought and an image or link through Agent.
2. Ori responds concisely, with an honest read status and a useful next step.
3. They see Light in the Playground/proposal and open a real preview.
4. They customize a useful detail, then select Make mine.
5. The UI reflects actual pending/completion states; one intent creates one app.
6. Light opens at its own stable URL, with its own icon and image-first design.
7. They add a real photo/entry, save it, reload, and see it persist.
8. Add to home screen gives accurate instructions for their actual platform.
9. They ask “Add camera settings to my photo notes.”
10. They inspect a concise revision preview, apply it, use the new fields in the correct form, and undo without losing existing data.

Preserve the user's shared source in the appropriate workflow. Keep preview fixtures separate from real records. Retain exactly-once mutation behavior and the existing revision/undo protections. Do not rebuild a complete app when an existing app only needs an entry.

## Third milestone: complete the product surfaces

- **Landing:** visual product/home-screen promise immediately visible; companion-led identity; useful entry and example; concise copy.
- **Agent:** warm first use; compact conversational replies; text/link/image input; useful action cards; optional AI context import; editable memory/source details.
- **Playground:** curated visually varied app previews and relevant possibilities. It should encourage interests and exploration as well as help practical tasks. Real filters only.
- **My apps:** personal launcher with distinct app icons, direct open, edit, and installation actions. No endless wide administrative rows.
- **Light:** photo gallery/contact sheet, warm paper/charcoal, large imagery, real upload/detail flow.
- **Riff:** ink/lime/lilac practice room, working timer and supported tempo controls, planned versus played time correct, reload recovery intact.
- **People:** compact white/orange next-action queue, people/context/dates, real draft/copy behavior where supported, no fake sends.
- **Edit with Ori:** app-scoped, accessible, small enough to respect each app's own identity.
- **Memory/settings:** retain provenance, confirmed/inferred distinctions, corrections, conflicts, and forgetting. Do not remove useful transparency to make screenshots cleaner.

Do not reduce hobbies to forms or habit counters. Give apps useful task-specific interactions. Keep old/custom apps functioning through compatible rendering. Let the app's purpose determine the layout; a color swap is insufficient.

## Home-screen delivery is central

The user must understand that Ori and each created app can be opened separately from their phone's home screen through the supported installation path. Each app needs its own consistent name/icon, stable direct URL, and working auth return destination.

For iOS, use honest Safari Add to Home Screen guidance for the prototype. Do not fake a one-click install API. The guide's Done button only closes the guide.

For Android, inspect the reported Capacitor APK with per-app pinned shortcuts and preserve it if that is what is implemented. Do not call those independently generated APKs. Verify actual warm/cold launch behavior where your environment permits and distinguish emulator checks from real-device checks.

Preserve per-app metadata, icon serving, deep links, access checks, and existing configured origin/session behavior. Do not overwrite all app icons with the Ori mascot. Do not claim physical phone testing without a device.

## Preserve the working foundation

Retain user data, app IDs, stable URLs, field IDs, media ownership, auth, existing exports, revision history, safe undo, and idempotency. A visual pass should not need destructive schema work. If a change needs a migration, back up data and use a compatible path. Never reset or reseed the real database to manufacture a clean demo.

Do not overwrite `.env`, print secrets, switch model defaults, or copy an example env over a configured one. Reuse the existing model adapter. Verify official documentation before introducing a new provider option. The API does not automatically publish hosted external Claude artifacts; the prototype must own its actual app links and runtime.

Preserve these Velocity corrections: an existing app gets an entry for confirmation when appropriate; planned practice is distinct from measured/manual time; retries do not duplicate writes; undo does not strand records; blocked integrations and unread links are labeled accurately; saving inspiration does not automatically create memory; ambiguous dates remain reviewable.

Keep the current bounded declarative/runtime architecture unless a demonstrated requirement requires a narrow compatible extension. Do not add arbitrary generated-code execution in the privileged app context as part of this design pass. Do not invent new social integrations, notification systems, billing flows, or background monitoring to satisfy decorative mockups.

## Verify through real use and rendered screenshots

At meaningful milestones, render the application and inspect it beside the supplied references. Check 390px and 1440px first, then 320px/768px, keyboard-open behavior, empty/error states, long content, missing images, and reduced motion. Fix obvious visual mismatches rather than stopping at green tests. Use actual app screenshots for your handoff, not copies of the target mockups.

Run relevant existing type/build/unit/API/browser checks. Add focused coverage for new request-to-mood transitions and any actual regression: stale results, cancel/retry cleanup, double creation, wrong record-kind forms, retained photos, revision/undo, direct app auth return, or broken icon metadata. Avoid tests that merely mirror implementation details or inflate counts.

Use sample mode for repeatable visual checks and label it. Keep live model calls bounded, after integration is stable. Report exactly what was run, on which code state, and what remains unverified. Do not claim accessibility verification from visual inspection alone or extrapolate emulator behavior to a physical iPhone.

## Work to completion

Create a short phased plan after inspection, then immediately implement the first phase. Continue until the agreed screens, core journey, and checks are complete. If an external dependency is genuinely blocked, document it and finish independent work. Do not repeatedly ask for routine styling approval. Respect tool permissions; this prompt does not disable them.

Maintain BUILD_STATUS.md with completed work and precise next steps at meaningful milestones. Do not promise indefinite autonomous work or “all night” operation. If interrupted, leave enough state for a new session to resume. When the acceptance criteria are met, stop and provide the handoff.

## Required final handoff

1. Working changes in the existing project, with no destructive data/env modifications.
2. Updated BUILD_STATUS.md and relevant README/setup instructions.
3. A concise `docs/ori/VISUAL_REVIEW.md` mapping each reference image to implemented screens and remaining differences.
4. Real screenshots of key screens, moods, mobile/desktop, and relevant error/empty states.
5. Updated demo script showing inspiration → personal app → home-screen entry → safe revision.
6. Test results separating automated, live-model, browser, emulator, accessibility, and physical-device evidence.
7. Accurate existing Velocity attribution and any real new contribution; no fabricated tool use.
8. A short final report: what changed, what works, what was tested, what remains, and exact safe run commands. Never include a command that overwrites an existing configured `.env`.

Begin with repository inspection now and continue into implementation.
