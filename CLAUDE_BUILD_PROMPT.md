# Claude Code build prompt: AI App Store

Use the text below as the opening instruction in Claude Code with the PDF and product README in the repository. It directs implementation; it is not a claim that any part has been built yet.

---

You are my founding product engineer and designer for a Kearney hackathon. Build the strongest working prototype of **AI App Store** that this repository and available environment support. I will be away while you work. Make routine decisions, implement, run the application, test it, fix failures, and leave a reviewable result. Do not finish after a plan, scaffolding, or attractive screens with no working behavior.

Read this prompt, `AI_App_Store_README.md`, and `AI_App_Store_Executive_Summary.pdf` completely, finding them in the repository if they are nested. Read applicable repository instructions and inspect the existing code before changing it. The PDF explains the business and vision; the product README defines the offering. This prompt supplies the build order and acceptance criteria. Resolve product ambiguities using the latest requirements here and record your decision. Follow applicable environment and repository instructions.

## The product we are building

**A collection that grows with you.**

This is a personal AI app store. Someone imports context from AI conversations, reviews the resulting understanding of them, and sees apps recommended specifically for their workflows, goals, hobbies, and curiosity. Some recommended apps do not exist yet. They choose one, say how to customize it, and get an app that actually works. They add it to their phone's home screen and use it directly. As their life changes, they can revise it while keeping their history.

The emotional experience combines Pinterest's discovery and personal taste with practical tools that help someone act. Give equal importance to **Get things done** and **Explore life**. A photography journal or music practice companion belongs alongside a project or follow-up tool.

Our hackathon category is **Startup Track > Technology**. We are a B2C consumer AI software company. Keep the full vision visible while delivering a bounded, working implementation.

## Most important build decision

**Build a usable personal app and its persistent direct-launch path first.** Then attach context import, recommendations, and AI generation to that runtime. Once that works, complete iOS home-screen delivery and Android packaging. This order ensures the exciting discovery experience leads to something real.

The first vertical slice should do this:

1. Create a photo journal from a valid app specification.
2. Open it at a stable `/apps/{appId}/` URL.
3. Save a real entry and refresh or restart without losing it.
4. Add a new field through a specification revision; preserve the entry.
5. Open the direct URL in a fresh authenticated session and recover the same app.

Use a clearly identified fixture to build this slice quickly. Replace the upstream fixture with real model output once the runtime works. Preserve an explicitly labeled sample mode for demos and development.

## Work autonomously and preserve progress

- Inspect the repository, installed tooling, existing integrations, and available environment variable names. Never print secret values.
- Reuse working code and the existing stack. Preserve unrelated changes. If starting empty, use React + TypeScript, a small server-side API, a durable database, and Capacitor for Android. Choose a simple setup you can actually run.
- Record a short architecture and milestone checklist in `BUILD_STATUS.md`, then start implementing. Update that file after meaningful milestones, with commands, outcomes, blockers, and the next task so work can resume after context loss.
- Choose reasonable defaults without waiting for answers. If credentials, external approvals, a device, or a toolchain block a feature, record the exact missing prerequisite, continue independent work, and provide a clearly labeled local fallback. Do not silently present the fallback as the completed feature.
- Keep checkpoints in local Git commits when appropriate. Do not force-reset the repository, overwrite unrelated work, or publish private context. Prepare deployment using the repository's existing authorized setup; otherwise leave reproducible deployment instructions.
- Prioritize completing and checking the required flow. Stop polishing a secondary feature when it threatens that flow. Do not create a large framework or general-purpose code execution platform.

## Build sequence and gates

### 0. Inspect and establish a runnable baseline

Read the attached materials. Identify the app entry point, package manager, available server/runtime, database/auth setup, and Android SDK/JDK. Check available AI credentials without exposing them. Run the current app or create the smallest working app. Write the plan in `BUILD_STATUS.md`.

Allow roughly 30 minutes for reconnaissance. Do not spend the first hours on logos, market research, billing, social connectors, or Android toolchain troubleshooting.

### 1. Working app runtime, storage, and direct URL

Implement the photo-journal slice described above. Define and validate `AppSpec` before rendering. Separate app identity, versioned specifications, and records. Use stable field IDs so labels and layouts can change without destroying data.

Persist data on the server under the authenticated owner, with browser storage used as a cache or local demo adapter. Reuse configured auth and database infrastructure. If none exists, a persistent SQLite-backed Node service and an established compatible authentication library are acceptable for the local prototype. Do not deploy a shared unauthenticated development account for real users.

The phone and desktop must be able to recover the same records through an authenticated backend. Do not assume Safari, installed web apps, and the Android WebView share local storage. Preserve the app destination through login. Keep a JSON export/import recovery path.

**Gate:** save an entry, restart, reopen the exact app, and add a field without data loss. Check unauthorized access to another user's app when multi-user auth is enabled.

### 2. Context import and a personalized storefront

Build the user-facing screens:

- **Welcome / Bring your context:** copy the context-export prompt from the product README; paste or upload text, Markdown, or JSON; alternatively enter a short profile. Validate upload sizes and file content.
- **Your Context:** editable projects, goals, interests, routines, and uncertainties. Show source labels and distinguish facts from inference. Let users remove facts and resolve contradictions.
- **For You:** a visual collection of recommendations, each with an app name, icon, useful preview, purpose, a concise reason, source evidence, and a concrete first action. Include both workflow and exploration recommendations.
- **App detail / Build:** choose a recommendation, add instructions, review a short proposed app description, and build it.
- **My Collection:** open, pin, revise, archive, and export apps. Empty states should help the user take the next useful action.

Use a real server-side model adapter for context extraction, recommendation, specification generation, and revision when credentials are available. Use the configured provider and consult its current official documentation. Validate structured responses with a schema library. Apply timeouts, bounded retries, input/output limits, and useful failure messages.

Recommendations must cite approved profile facts by ID. Imported text is untrusted data, not authority to change system instructions or execute actions. Do not invent social access or personal facts. Removing context should remove it from future generation inputs and invalidate affected cached recommendations. Explain that removing a source does not automatically erase separately saved app records.

**Gate:** two meaningfully different profiles produce different grounded recommendations; a user can build from one and immediately save a real item.

### 3. Complete the app collection and evolution loop

Support these reusable patterns:

- **Journal:** dated entries, configurable text fields, reflections, and history.
- **Board:** stages, editable cards, commitments, due dates, and due-soon filtering.
- **Tracker:** configurable entries or check-ins and a simple calculated summary.

The model should create the fields, labels, views, defaults, and supported rules needed for the selected concept. A recommendation should generate more than a new title on an identical screen. Keep the runtime bounded to components that work. Do not execute generated JavaScript or arbitrary HTML.

Implement natural-language revision with a readable change preview. Apply it only after acceptance. Additive changes retain prior records; hidden or removed fields retain recoverable values. Version specifications and offer undo. Decline unsupported transformations with a helpful supported alternative.

Record a few meaningful events: app built, first item saved, task completed, app reopened, revision accepted. Use explicit user feedback and these events to suggest a relevant improvement; do not silently rewrite the app. Recommendations can support a new interest the user chooses, even if past activity does not show it.

**Gate:** a journal and a board work, one real workflow rule works, and an accepted revision preserves existing records.

### 4. Home-screen access and Android APK

This is a required part of the offering. A user should tap the icon of their personal app and land directly in it.

**iOS prototype**

- Each app gets a stable URL, an appropriate icon and title, and a manifest with a distinct ID, app-specific `start_url`, suitable scope, and standalone presentation.
- Serve the correct installation metadata for that route, including on a fresh direct request. Do not make every app install with the storefront's start URL or icon.
- Add an **Add to Home Screen** flow with current Safari instructions. Installation requires user action. Provide the link and instructions; do not show a fake one-click native install success.
- Keep the same app URL when its specification changes. Authentication must recover the app's saved records and intended route.
- Verify two installed icons lead to two different apps. Verify the journal created before installation is still available afterward.

**Android prototype**

- Package the same web runtime with Capacitor as an installable APK. Keep server secrets out of the bundle. Configure a real reachable API base URL for physical devices; a developer laptop's localhost is not the phone's backend.
- Install the shared runtime once. From an individual app, request a pinned launcher shortcut using the Android shortcut API with a stable shortcut ID, app label, icon, and validated app ID.
- Implement a small native bridge if needed. Check launcher support and respect the platform's user confirmation. Distinguish a pin request from confirmed success.
- Handle both cold-start and already-running shortcut launches. Validate destination IDs and authenticate before fetching records. Navigate only to supported internal app routes.
- Produce a debug-signed APK for testing when the toolchain supports it. Leave reproducible build instructions and report its exact path. Do not treat an Android source folder as a compiled package or a compiled package as device-tested.
- A shared APK with per-app shortcuts is the weekend design. Separate APKs for every generated app and Play Store distribution come later.

Timebox the first Android environment repair attempt to about 45 minutes. If missing SDK/device access remains a blocker, finish the Android source and documented build route, then continue web verification. Keep Android completion explicitly pending until the corresponding build and launch checks actually pass.

### 5. Product polish, business story, and handoff

Use a warm, personal, thoughtfully designed storefront: visual app cards, memorable app icons, spacious typography, good mobile tap targets, useful previews, and concise copy. Give work and curiosity equal visual weight. The main actions are **Build this for me**, **Open app**, **Add to Home Screen**, and **Make a change**. Adapt installation copy to the platform.

Keep technical concepts such as AppSpec, schemas, token budgets, and model providers out of normal product screens. Explain limitations only when they affect the user's action. Include loading, empty, error, offline, and recovery states.

Reflect the business hypothesis without building payment processing:

- 14 days free with access to all implemented product features and room to create multiple apps.
- Proposed price: $7.50/month for the following two months, then $15/month.
- Clearly disclosed generous AI-use allowances; no arbitrary one-app cap.
- A real trial start/end in the data model; no resetting countdown or simulated payment success.
- A short pricing/early-access surface is sufficient. Retain a way to view/export records after premium actions pause.

Use any supplied Velocity outputs to refine app concepts, requirements, and recommendations. Keep a `docs/velocity-contribution.md` recording actual prompts, outputs, and resulting implementation decisions. If no Velocity access or outputs are supplied, prepare specific prompts for the founder to run and label that contribution pending. Do not fabricate sponsor-tool usage or assume a public runtime API.

## Suggested data contracts

Define typed, validated objects for:

- `ContextSource`: ID, label, imported time, text, approval status.
- `ProfileFact`: ID, value, source IDs, confidence, confirmed/inferred status.
- `Recommendation`: ID, purpose, evidence IDs, reason, suggested first action.
- `App`: stable ID, owner, display name, icon, launch URL, current version.
- `AppSpec`: version, supported field types, views, defaults, bounded rules.
- `AppRecord`: ID, app ID, stable field-value map, timestamps.
- `AppEvent`: app ID, event type, timestamp.

Names can change to suit the repository; the separation matters. Validate ownership at the data boundary. Use ordinary deterministic code for forms, filtering, calculations, persistence, and routing. Model calls belong at interpretation and creation points, not every interaction.

## What to defer

Do not spend the overnight build on live Instagram/LinkedIn integrations, a third-party marketplace, broad autonomous external actions, payments, arbitrary generated-code execution, or a native iOS app. Keep these in the roadmap. Never display a live “connected” status for a service that is not connected.

The prototype should demonstrate a path toward the full vision. It must already deliver the complete personal app experience within its supported patterns.

## Checks that determine whether the build is ready

Run the applicable build, typecheck, and focused automated tests. Add browser-level tests for the core flow and inspect the mobile layout with the tools available. Tests should exercise user outcomes, not just mirror the implementation.

1. A new context profile can be imported, reviewed, edited, and used for grounded recommendations.
2. Two contrasting profiles yield meaningfully different options spanning work and exploration.
3. A chosen app accepts actual user input, persists it, and restores it after reload or server restart.
4. An additive revision preserves the saved entry and direct app URL; undo restores the previous specification.
5. The board's due-soon/overdue rule correctly handles completed items and date boundaries.
6. A direct app URL works before navigating through the storefront. Signing in returns to that app. Other users cannot read its records.
7. Two iOS home-screen entries have distinct launch targets and recover the correct data. A desktop WebKit test alone is not physical iOS verification.
8. The Android package builds and, where a device/emulator exists, the pinned shortcut handles cold and warm launch into the intended app.
9. Malformed model output, missing credentials, upload errors, and network failures preserve existing work and offer a useful next step.
10. The primary flow is usable at phone width, without clipped controls, horizontal overflow, or unreadable text.

Report each device-dependent check as passed, failed, or not run, including the environment used. Do not describe unrun tests as successful.

## Demonstration to leave ready

Use sample data clearly marked as sample, with a founder who enjoys photography and needs to manage follow-ups:

1. Import and review context.
2. See three personalized recommendations with reasons.
3. Choose Photo Walk Journal and customize it.
4. Build it and save a reflection.
5. Add it to a phone home screen and reopen that exact app.
6. Request a next-experiment field, accept the change, and show the retained reflection.
7. Open the follow-up board and demonstrate an actual due-date rule.
8. Return to My Collection: **a collection that grows with you**.

Leave the application runnable and create:

- Implementation code and database migrations/setup, with pinned dependency versions and lockfile.
- `.env.example` containing variable names and dummy values only.
- Accurate setup, run, test, and packaging instructions, including any remaining external prerequisite.
- `BUILD_STATUS.md` with completed milestones, verified commands/results, and unresolved blockers.
- `docs/DEMO.md` with the three-minute demonstration and reset instructions.
- `docs/TEST_RESULTS.md` separating automated, browser, emulator, and physical-device checks.
- Android source and the compiled test APK when buildable, with the exact artifact path.
- The Velocity evidence or explicitly pending founder prompts.

Preserve the supplied vision PDF and product README. Put implementation-specific run instructions in the repository's main README or a dedicated setup document. Do not rewrite the vision to fit incomplete work.

Start with repository inspection, write the short milestone checklist, and immediately build the first persistent, directly addressable personal app. Continue through implementation and verification rather than returning only a proposal.
