# Ori: companion, product design, and demo specification

Version 2.0 — November 14, 2026

## 0. What is decided

**Ori is the chosen brand. The Little Companion is the chosen symbol.** Pair it with the custom lowercase wordmark from concept 06. Electric Playground remains the parent visual direction. Pocket World is a supporting metaphor for the user's collection, not a second logo.

**Guiding star:** Agent + Playground + Apps make the phone distinctly yours.

**Product sentence:** Ori is your AI companion for turning your interests and everyday needs into personal apps that live on your home screen.

**Messaging hierarchy:**

- Brand promise: **Your AI companion. Your world, in your pocket.**
- Concrete benefit: **Apps made for you. Right on your home screen.**
- Emotional homepage headline: **Your interests have somewhere to go.**
- Short signature: **Your curiosity. Your story.**

Use one headline and one explanatory line per surface. Do not stack every slogan into the interface. The phone becomes personal through the apps and shortcuts Ori helps create; the prototype does not replace its operating system.

This spec supersedes earlier directions saying the name is undecided, using a purple sparkle, using the pocket as the primary icon, or forcing every app into the same design. Existing functional requirements remain in force. The user has reported a working redesign and Velocity integration; inspect the repository to establish the actual baseline. This document does not certify that implementation or its test results.

## 1. How to use the images

Put this file and `ORI_CLAUDE_BUILD_PROMPT.md` in `docs/ori/`. Put the reference images in `docs/ori/references/`. If the files arrive with generated filenames, identify them by their visible headings; do not block on renaming.

The images are target designs with illustrative content. They show composition and intended behavior. They are not production assets, app screenshots, proof of completed integrations, or exact implementation requirements at every pixel. Rebuild interactive screens as real components. Never place a screenshot over an unusable page and call the flow implemented.

### Existing approved images

| Reference | Role |
| --- | --- |
| A / LITTLE COMPANION | Canonical mascot silhouette and four core expressions; logo relationship; lilac app icon |
| A / A COMPANION FOR YOUR CURIOSITY | Agent warmth and Riff's separate dark practice-room identity |
| C / YOUR COMPANION. YOUR POCKET WORLD. | Marketing composition and combined agent/personal-world vision |

### Seven new demo appendix images

| Image heading | What the audience learns | What must work in the prototype |
| --- | --- | --- |
| 01 / YOUR WORLD, IN YOUR POCKET | Ori and the generated apps have individual home-screen icons | Distinct icons, stable app links, honest installation guidance, direct launch |
| 02 / GIVE YOUR INSPIRATION SOMEWHERE TO GO | Share a thought, image, or link; Ori suggests an appropriate next step | Capture, truthful read status, concise response, keep/preview/open-existing actions |
| 03 / EXPLORE WHAT COULD BE YOURS | Discover useful apps and possibilities beyond a task list | Responsive visual proposals, real previews, useful filtering or honest empty states |
| 04 / SEE IT. SHAPE IT. MAKE IT YOURS. | Inspect the result before creating it | Preview, a useful customization, creation state, ready screen, open/install/link actions |
| 05 / YOUR APPS. ONE TAP AWAY. | The collection becomes accessible outside Ori | My apps launcher, platform-specific install guidance, independent app entry |
| 06 / EACH APP FEELS LIKE ITS PURPOSE | Photography, music, and people need different interfaces | Light gallery, Riff practice interaction, People next-action queue |
| 07 / YOUR APPS GROW WITH YOU | Ask for a revision while keeping existing data | Preview/apply/undo, correct forms, preserved records and photos |

### Resolve these mockup discrepancies in code

The following written rules take precedence over accidental details in generated images:

1. Use one canonical icon per app across cards, preview, launcher, manifest, shortcuts, and install instructions. Some slides show alternate icon colors. Canonical choices are in section 3.
2. Standalone apps do not carry the parent Agent / Playground / My apps navigation. Image 07's first panel accidentally shows it. Remove that parent navigation from the actual Light app.
3. Decorative waveform/play artwork on a discovery card opens the preview unless a real, explicitly supported playback interaction exists. It must not pretend to play a linked song. Riff's practice timer button starts a timer, not streaming audio.
4. Build stages appear only when backed by actual job states. If the backend exposes one pending state, use “Making Light yours…” until validated completion. Do not animate invented milestones or percentages.
5. Mockup bell, menu, and profile icons need working destinations. Remove unsupported controls. Do not build notifications merely because a bell appears in an image.
6. Example photos, contacts, dates, and reasons are illustrative. Use licensed existing fixtures or user media, label examples, and never present example data as the person's history. Use approved fixture data consistently through the demo.
7. White text over bright orange may fail contrast. Use ink text on orange or a darker accessible action color, even when a mockup shows white.
8. A “Done” button in install instructions closes the guide. It is not proof of installation. Never set “Installed” merely because the guide was opened or dismissed.
9. “Your photos are safe” in a mockup is not a blanket guarantee. Prefer “Updated. Existing photos and notes kept.” only after a successful compatible revision. If that is uncertain, use “Updated” and explain the actual result.
10. Pocket-themed hero illustrations belong on marketing or empty states. They do not replace the useful app collection with decorative scenery.

## 2. Experience and scope

The main loop is **share → understand → explore → preview → make → use → add to home screen → evolve**. A returning user can enter any step through a direct app link. Do not force them back through onboarding or the launcher.

A useful reply does not always create an app. Preserve these distinct intents:

- **Keep:** save an inspiration without inventing a goal or adding memory.
- **Explore:** offer a grounded next step or useful possibility.
- **Use:** open an existing suitable app with a proposed entry to confirm.
- **Create:** preview a new app when the existing collection does not meet the need.
- **Revise:** change an existing app only when the user requested a design or capability change.

Examples: “15 minutes of guitar” should use existing Riff when appropriate. “Follow up with Maya” should propose a People entry, not add a new Priority field. “Add camera settings to my photo notes” is a revision. Keep the Velocity behavior already implemented.

The current pass is a brand, interaction, and visual-quality implementation. It does not require arbitrary-code generation, a new backend, native OS replacement, automatic Instagram monitoring, a new billing system, or a new model provider. Preserve the current trial and billing behavior; do not invent a new pricing policy.

## 3. Brand assets and canonical app icons

### Ori companion

Preserve the approved shape: a compact cobalt flame/pebble, one asymmetrical curled tip, rounded base, two white oval eyes, one small lime oval cheek on the viewer's right. No arms, legs, mouth, costumes, or additional creatures. Variation comes from eyes, subtle lean, the curl, and a small accent dot or short rays.

Use a faithful, clean SVG reconstruction for production. Keep the body path stable across moods. Separate body, eyes, cheek, and accents into controllable groups. Do not create a different character by independently generating each expression. Do not crop the entire reference board into the product. A temporary raster logo is acceptable during implementation, but the final scalable mark and animated companion need a clean asset.

At 16–24px, simplify accents and the cheek if needed; preserve silhouette and legible eyes. Check at 24, 40, 80, and 160px on actual backgrounds. Use a deliberate single-color variant where color is unavailable.

### Wordmark

Lowercase **ori**. Bold rounded custom lettering: open-at-upper-right round o, soft sweeping r, rounded i with a lime dot framed in blue. Preserve legibility: the o must not read as c, and the r must remain visible. Reconstruct a static SVG with an accessible “Ori” label. Use ink lettering on light backgrounds for compact headers; use cobalt for large brand treatments. Use a light mono version on ink surfaces.

Use the companion plus wordmark on landing/brand headers. Wordmark alone is sufficient in compact navigation. Do not place a large companion, full wordmark, large greeting, and decorative hero illustration together on every small screen.

### Canonical icon registry

| App | Icon | Surface | Notes |
| --- | --- | --- | --- |
| Ori | Cobalt companion, white eyes, lime cheek | Lilac | Only Ori uses the companion as its app icon |
| Light | White camera | Charcoal `#181A1F` | Photography identity |
| Riff | Lime waveform | Ink `#162039` | Music identity; use consistently instead of alternating note/wave icons |
| People | Orange people silhouette | White | Practical identity; outline if needed for contrast |

These are the reference-app defaults. User-created apps can have independent icons. Do not overwrite their existing custom icons during this rebrand. Give exports enough safe padding and test platform cropping rather than baking one rounded-square mask into every asset.

Centralize display name, taglines, color tokens, logo references, and defaults in the existing brand configuration. Update the parent document title, parent favicon, and parent install identity. Preserve each generated app's own metadata and icon.

## 4. Visual system

| Token | Value | Role |
| --- | --- | --- |
| Canvas | `#F7F8FC` | Parent page background |
| Surface | `#FFFFFF` | Composer, sheets, menus |
| Ink | `#162039` | Body and primary text |
| Muted | `#59617A` | Supporting text; check actual contrast |
| Cobalt | `#3147F2` | Primary action and brand |
| Lime | `#DFFF76` | Small highlights, dark text |
| Lilac | `#DBCBFF` | Companion icon and soft accents |
| Orange | `#FF6A3D` | People/art accents, usually ink text |
| Border | `#DCE0EC` | Decorative separators, not sole focus/input affordance |
| Light paper | `#FAF8F4` | Photography app |
| Light charcoal | `#181A1F` | Photography chrome |

Use Manrope for shell headings and DM Sans for body/controls, reusing the existing self-hosted files if present. Parent type is sans. A restrained editorial serif is permitted within Light, not across the entire shell. Riff uses strong sans headings and tabular timer numerals. People uses compact readable sans.

- Mobile page title: 28–34px; body/input: 16px; useful secondary labels: 13–14px.
- Desktop hero: 52–68px with intentional wrapping; mobile hero: 34–42px.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Mobile gutters: 16–20px. Main desktop width: about 1120–1200px. Agent reading column: about 720px.
- Card radius: 20–24px; buttons: 12–16px or deliberate pill; sheets: 24px top corners.
- Use borders and spacing before shadows. No glossy logo gradients, glass haze, decorative waves on every page, or huge empty gaps between small useful controls.
- Touch targets at least about 44px; visible keyboard focus. Input borders/focus indicators must have adequate contrast.
- A quiet surface dominates. Reserve bold color for decisions, the companion, and distinct app previews.

The screenshot's device bezel, status bar, slide title, page number, and illustration backdrop are presentation framing. Do not recreate a phone frame inside the actual mobile app. Let real content scroll; do not hard-code screenshot heights or truncate needed actions.

## 5. Companion moods and motion

The character communicates interface state. It does not pretend to have emotions, watch the user's other apps, or listen to a microphone that is not active.

Suggested component contract, adapted to repository conventions:

```ts
type OriMood =
  | 'idle' | 'attentive' | 'thinking' | 'discovery'
  | 'building' | 'success' | 'clarify' | 'error';

// Render from actual UI/job state, never an arbitrary model-supplied mood.
// <OriCompanion mood={mood} size={48} motion="auto" decorative />
// Keep state derivation outside the SVG presentation component.
```

| Mood | Real trigger | Expression | Motion and exit |
| --- | --- | --- | --- |
| idle / Here | No current operation | Relaxed oval eyes, upright curl | Still; an occasional single blink is optional |
| attentive / Listening | Composer focus or typing | Slight lean toward input | One 120–180ms lean; return on blur. “Listening” is a design label, not a recording claim |
| thinking | Submitted capture/revision request is pending | Eyes glance upward | Small eye movement and restrained dot motion while pending; no invented progress |
| discovery / Found something | A valid useful proposal is available | Open curious eyes, small lime discovery dot | One gentle 200–300ms arrival; settle to static proposal |
| building / Making | A real create/apply operation is pending | Focused eyes and a restrained accent orbit | Pending-only motion; stop immediately on resolution or cancellation |
| success / Ready | Server-confirmed save/build/apply succeeded and result is usable | Happy curved eyes, same cheek and silhouette | Brief 1–2 second response, then stable state; no screen-blocking confetti |
| clarify / Need a detail | A genuinely missing choice blocks this action | Small head tilt, inquisitive eyes | One tilt with clear text/question; no endless thinking animation |
| error / Try again | Active request failed | Calm neutral expression, slight tilt | Static; preserve input and show a concrete retry action. No guilt, distress, or streak punishment |

Offline is a connection status, not a ninth emotional character. Reuse a calm static pose with accurate text about what is available.

### State correctness

Bind state to the current operation and target app. A late response from an old request must not celebrate over the user's new task. Use existing request/job IDs and cancellation patterns. Errors and clarification for the active operation take priority over ambient focus. A late focus/blur event must not hide an active build.

Success starts after the server's successful response and any required validated navigation target exist. A timer expiring is not a successful save. A persisted capture is not evidence a URL was read. A rendered proposal is not a created app.

Cancel, retry, route changes, timeout, and unmount must stop animations and release timers/listeners. Do not attach animation intervals to every app card. After roughly ten seconds of pending motion, it is fine to settle the character while keeping a truthful pending label and cancel/retry affordance where supported. Do not invent a time-to-completion.

With `prefers-reduced-motion`, show the corresponding static expression without bouncing, orbiting, pulsing, or auto-scrolling. Announce meaningful completion/error once with an appropriate live region, not on every animation frame. If adjacent text describes the state, keep the SVG decorative; do not make screen readers announce it twice. Interactive mascot buttons have a real button label such as “Edit Light with Ori.”

### Placement

- Agent empty state: one 72–96px companion. In chat: 28–36px avatar or 40–56px status, not both repeated excessively.
- Build state: 96–128px focal companion.
- Playground: one optional 56–80px section illustration on spacious layouts; reduce or remove it on narrow screens.
- Standalone app: a quiet 24–32px edit/help affordance, with accessible label. Do not obscure the app's own brand.
- Toast: optional 20–24px static expression.
- App icon: static, recognizable default expression.

## 6. Screen requirements

### Landing and home-screen promise — image 01 and approved C

Show the product above the fold: the companion, actual app previews, and separate Ori/Light/Riff/People icons on a phone home screen. Use “Your interests have somewhere to go.” with “Your AI companion turns interests and everyday needs into apps made for you. Open them right from your home screen.”

Primary CTA “Make it yours”; secondary “Try an example.” Preserve working auth behavior. Show a useful example before demanding a full context export. Do not imply automatic installation or general access to social accounts. Keep trial/pricing details accessible but subordinate to the product demonstration.

### Agent — image 02

Header: small wordmark and working account menu. First-use greeting “What caught your eye?” with a companion. Composer accepts supported text/link/image input. Starters “Something to try,” “A task to simplify,” and “Just save this” prefill intent; they are not fake navigation buttons. Optional context import remains accessible as “Bring context from your AI.”

After submission, move to a compact conversation with retained user input/media, concise reply, and a useful action card. Keep source status accurate. When a link was not read, say so plainly and invite a screenshot or note if needed. Do not display an invented thumbnail or summarize unseen reel content.

Use source/provenance disclosure “Why this?” with real references. Preserve memory editing/forgetting and confirmed/inferred distinctions in “What you've shared.” Saving an item alone must not silently turn it into a permanent inferred preference.

Keep the composer reachable when the keyboard opens and reserve space for mobile navigation and safe areas. Avoid two stacked fixed footers covering the transcript.

### Playground — image 03

Heading “A little more you.” Use visual mini-previews with different compositions, one sentence explaining relevance, and a clear Preview action. Lead with a strong relevant feature and complementary smaller options. Discovery and everyday usefulness are both first-class.

Use a logical CSS grid and DOM reading order. On desktop, 2–3 columns; at 768px, 2 where comfortable; on phones, a wide feature and smaller cards only when labels/actions remain usable. At 320px, prefer one column over cramped two-column content.

“For you,” “Explore,” and “Everyday” need real filtering/ranking semantics. If the current contract cannot support one, omit that chip instead of shipping a dead control. “Something unexpected” must lead to a supported exploration, not fabricated live recommendations. Keep Example labels on example items and avoid silently replacing a failed live response with unlabeled sample cards.

### Preview, Make, Ready — image 04

Use the same app spec, renderer family, and design tokens for preview and created app. Clearly mark example content. Prefer an isolated preview that cannot mutate real user records. One or two meaningful controls are enough; do not expose raw schema fields as the main customization experience.

“Make mine” creates exactly one app for the submitted intent; preserve existing idempotency. Prevent repeat submissions in the UI while retaining server-side retry protection. Do not generate a fresh idempotency key on a transport retry of the same mutation.

Map build labels to actual backend states. If only pending/complete exists, show only those. Ready requires a valid persisted app ID and navigable URL. Show “Open Light,” “Add to home screen,” and “Copy app link.” Preview fixtures must not silently become the user's real records.

### My apps and installation — image 05

My apps is a launcher: independent icons, short names, optional real recent-use information, and a useful “Make something new” action. Show Open, Edit with Ori, and Add to home screen contextually without placing a large management toolbar on every tile. Returning users should open their app in one deliberate action.

Each generated app retains its own stable URL, name, icon, and supported installation metadata. Launching that URL should open that app directly. If sign-in is needed, retain the intended app destination through sign-in. The user should not have to find it again in Ori.

**iOS prototype:** a Safari home-screen bookmark/web app. Explain how to open the app link in Safari, open Share, and choose Add to Home Screen, using device-appropriate instructions. Do not promise automatic installation, guaranteed background execution, or native App Store distribution. “Done” closes the instructions. Physical device verification must be labeled separately from browser/WebKit checks.

**Android prototype:** inspect what actually exists. The reported implementation uses a Capacitor APK shell with distinct pinned app shortcuts. Preserve and accurately describe it if confirmed. A shell APK with many shortcuts is not an independently built APK for every generated app. Do not rebuild the architecture solely to make that claim. Use a supported web-install path when appropriate and available. Test the actual launch route, including authentication and warm/cold starts; record unverified paths.

Phone demos need a reachable origin and correct HTTPS/session behavior. Do not overwrite configured environment values or present localhost as a phone-accessible deployment. Preserve owner checks even when icon/name metadata is intentionally available to support installation.

### Individual app identities — image 06 and approved Riff

**Light:** warm paper/charcoal, images first, real gallery/contact sheet, optional small editorial serif. Main action Add photo. Photo detail has large image and short notes. Keep uploads owner-scoped. Empty gallery should invite a first photo; it must not silently invent a personal portfolio.

**Riff:** dark ink, lime and lilac, tabular timer, practice presets, purposeful tempo controls where implemented. Main action starts a measured practice session. A 15-minute plan is not 15 minutes played. Keep elapsed-time tracking, pause/stop, reload recovery, explicit manual entry labeling, and no metronome sound after Stop. Source links open sources; decorative waveforms do not imply audio analysis or music streaming.

**People:** clean white with orange accents, compact avatars and an actionable queue. Main actions add a person/next step, draft or copy where supported, and mark done. A draft is not a sent message. Preserve the user's words for ambiguous dates and ask them to confirm a suggested date. If “Draft message” is unsupported, implement a genuinely useful draft/copy flow within existing capabilities or omit the button with a recorded gap.

Every app has its own direct identity, usable primary action, and compact Edit with Ori access. Shared authentication/storage/accessibility primitives are encouraged. A universal card/form page with three colors does not meet the design intent. Preserve older/custom apps and provide a coherent compatible fallback renderer.

### Evolve with Ori — image 07

App-scoped editing opens from the current app and names it. The prompt “Add camera settings to my photo notes” should produce a concise proposed change and an actual affected-screen preview. Show both Apply change and Keep current version.

After acceptance, Camera/Shutter/Aperture must appear in the appropriate photo edit/add form and saved record view where applicable. They must not become requirements for unrelated record kinds or disappear because all views are filtered. Keep old entries and photos. Preserve the existing undo plan and protection against stranding records; never erase hidden fields simply to mimic an old visual version.

Use a brief success acknowledgement only after apply succeeds. Make undo discoverable from version history as well as any transient toast, if the existing interface permits. Failed revisions retain the current app and the user's requested change.

## 7. Implementation sequence

1. Inspect actual routes, components, adapters, asset pipeline, AppSpec, installation paths, and repo instructions. Record baseline failures without claiming historical tests were run today. Read BUILD_STATUS and Velocity docs before changing behavior.
2. Build the central brand assets/tokens and an internal component preview page for every companion mood, icon size, light/dark background, reduced-motion state, and interactive label. Keep the page isolated from real data/model calls.
3. Implement the full Light slice: capture → proposal → preview → Make mine → open → save a photo → reload → installation guide → revision preview → apply → undo. Reuse functioning backend contracts.
4. Finish responsive Agent/Playground/My apps; polish Riff and People with their own identities. Avoid rebuilding features already working. Maintain model/sample honesty.
5. Update parent installation identity and the selected reference-app icons, preserving user customization and direct URLs. Verify routes and installation instructions.
6. Review real rendered screenshots against the references and correct discrepancies. Complete appropriate functional checks and deliver a factual handoff.

Keep persistent data, app IDs, URLs, field IDs, ownership, schema compatibility, revisions, and undo intact. Back up before any migration; prefer no schema change for a visual pass. Do not reset/reseed real data. Do not overwrite `.env`, print keys, switch model/provider defaults, or assume an API creates externally hosted Claude artifacts. The product's own runtime and hosting own the app links.

## 8. Acceptance criteria

### Visual and interaction review

- [ ] Ori's chosen companion, custom wordmark, and canonical icons are consistent throughout.
- [ ] Each meaningful screen matches its reference's composition and purpose, not just its palette.
- [ ] Agent feels approachable; Playground feels exploratory; My apps feels like a launcher.
- [ ] Light/Riff/People differ in layout, content, primary interaction, and type treatment as appropriate.
- [ ] A user can identify the primary action within a few seconds on a phone.
- [ ] No dead controls, placeholder links, fake progress, unsupported audio/sync claims, or example content masquerading as personal data.
- [ ] Validate 320, 390, 768, and 1440px layouts; include keyboard-open, long text, missing-image, empty, loading, error, and reduced-motion states.
- [ ] No horizontal overflow, covered composer/actions, clipped app names, or inaccessible scroll regions.
- [ ] Check contrast, touch targets, keyboard flow, dialog focus/escape/return, and screen-reader labels. Report what was actually checked.

### Meaningful regression coverage

- [ ] Correct current-request mood on success/error/cancel/retry; stale responses do not hijack another task.
- [ ] No success before persistence; no timers/animation left after teardown.
- [ ] Same action retried or double-tapped creates one app/entry.
- [ ] Existing-app entry intents remain distinct from app revisions.
- [ ] Photo/media access and other ownership checks remain effective.
- [ ] Timed versus planned/manual practice remains accurate through reload.
- [ ] New fields appear in correct filtered forms; unrelated kinds are unaffected.
- [ ] Revision/undo retain existing data and handle unsupported rollback safely.
- [ ] Direct app URL opens the right app; sign-in preserves the destination.
- [ ] Each app's own icon/name/manifest or shortcut metadata remains coherent.

Run relevant existing type/build/unit/API/browser checks. Add targeted tests for new state integration and demonstrated regressions, not dozens of assertions that merely restate CSS. Batch real-model checks after stable integration and keep them bounded. Use mock/sample mode for repeatable visual snapshots and label that evidence. Record physical device checks separately.

## 9. Demo appendix and presentation use

These images complement the three approved boards. Suggested appendix order:

1. Approved combined hero: introduce the emotional vision.
2. New 01: make the home-screen value concrete.
3. New 02: share one actual inspiration.
4. New 03: explore personalized possibilities.
5. New 04: preview and create Light.
6. New 06 plus approved Riff screen: prove apps have individual personalities.
7. New 05: show separate direct-launch icons and actual install guidance.
8. New 07: revise a useful app while preserving its data.
9. Approved mood board: explain the interaction language if asked.

For a short live demo, follow one real Light journey rather than hopping among unrelated prefilled examples. Acknowledge when an appendix image is a target design. Use screenshots of the implemented prototype as evidence after the build; do not describe this design appendix as tested software.

## 10. Required implementation handoff

Update BUILD_STATUS with changes, remaining gaps, and exact resume/run steps. Add a brief visual-review note with reference-to-screen mapping and before/after screenshots. Update demo and test-result docs with checks actually run and explicit unverified device paths. Preserve actual Velocity attribution; do not fabricate new usage.

Deliver a concise final report covering implemented screens, companion states, preserved flows, actual validation, installation behavior, and remaining limitations. Do not promise the agent will continue indefinitely after the coding session ends.
