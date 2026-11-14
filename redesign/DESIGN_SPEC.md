# Design specification: Electric Playground + Studio Pop

Version 1.0 | November 14, 2026

## 1. Design decision

Use Electric Playground for the parent product: clean, bright surfaces; ink text; confident blue actions; a calm navigational structure. Use Studio Pop inside the content: expressive compositions, typography, imagery, and varied app identities.

The result should feel personal, capable, curious, and enjoyable to open. It should be appropriate for daily use and expressive enough to signal that each person's collection is different.

The final name is undecided. Keep the display name in one brand configuration. Use a temporary descriptive label such as "Your Playground" rather than cementing an unapproved name or designing an elaborate logo.

## 2. Parent product tokens

These are original proposed tokens, not extracted YC company brand guidelines.

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F7F8FC` | Main background |
| Surface | `#FFFFFF` | Composer, menus, bounded panels |
| Ink | `#162039` | Main text and strong icons |
| Muted ink | `#59617A` | Supporting text; verify contrast on its actual surface |
| Action blue | `#3147F2` | Primary actions, selected navigation, focus emphasis |
| Lime | `#DFFF76` | Sparing highlights, with dark text |
| Lilac | `#DBCBFF` | Exploration content and illustration surfaces |
| Border | `#DCE0EC` | Quiet structural separators |
| Studio orange | `#FF6A3D` | Expressive app artwork; use dark text |
| Studio mint | `#BCEED6` | Friendly app surfaces; use dark text |

Do not use pale colors for small text on white. Check WCAG AA contrast for actual combinations. Do not make every element an accent, a pill, or a gradient.

### Type

- Manrope for headings and expressive labels. DM Sans for body text and controls. Use licensed/local font assets if available, otherwise a suitable system sans fallback.
- Main desktop hero: approximately 56-72px; mobile hero: 36-44px, adjusted for actual line lengths.
- App page headings: 28-36px. Body: 16px. Secondary labels: 12-14px. Avoid tiny metadata.
- Use controlled weights, mostly 400/500/600/700. Avoid giant serif headings and heavy labels everywhere.
- Headline wrapping should be intentional. Keep body paragraphs short and readable.

### Geometry and interaction

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Desktop content width: roughly 1120-1200px. Mobile gutters: 16-20px.
- Parent surfaces: 16-24px radii; compact controls: 10-14px. Individual apps can differ deliberately.
- Use borders/spacing before adding shadows. At most a subtle elevation for floating UI and previews.
- Ensure comfortable touch targets, approximately 44px or larger where appropriate.
- Motion: short transitions for changing state, reduced-motion support, no perpetual decorative movement.
- Design and test at 390px, 768px, and 1440px, then check 320px for overflow.

## 3. Information architecture

Primary navigation is **Agent / Playground / My apps**. Settings and profile belong in a compact avatar menu. Use a three-item bottom navigation on mobile and a restrained top or side navigation on desktop. Individual apps do not inherit the complete parent navigation.

The Agent is available from the Playground through a compact composer. It is also a dedicated conversational surface. Avoid duplicating long chat transcripts into every view.

## 4. Screen-by-screen visual changes

### Landing

- Lead with "Your interests have somewhere to go."
- Explain in one sentence: "Share what inspires you. Discover what you could do with it. Make apps that feel like yours."
- Show a phone/product composition demonstrating Agent, Playground, and two visibly different apps. Product imagery should occupy real space above the fold.
- Primary action: "Make it yours." Secondary: "Try an example."
- Below the hero, tell one concrete transformation story. Use a brief three-step explanation only after showing the experience.
- Keep trial details available but subordinate to the product promise. Do not add fake endorsements, user counts, testimonials, or YC affiliation.

### Agent

- A compact, welcoming opening: "What caught your attention?"
- Composer accepts a thought, link, or image, with visible upload affordance.
- Shared media has an attractive preview when actually available. Otherwise render a clean source/link card with an honest status.
- Responses are concise. Show proposal cards within the conversation instead of paragraphs of reasoning.
- A useful output can be an exploration, an update to an app, or an app proposal.
- Keep source and memory details behind an accessible disclosure. This must remain available, not removed.

### Playground

- Hero copy is personal and short: "A few things you might be into."
- Use a responsive editorial grid: one featured opportunity plus smaller complementary cards. Keep logical DOM and keyboard order; avoid a visually random masonry layout that disrupts reading.
- Lead cards with imagery or a real mini-preview of the app. Do not lead with form field lists.
- Reason: one sentence. Additional provenance: "Why this?" disclosure.
- The first screen should contain visibly different possibilities, including at least one useful everyday task when supported by context.
- No blank wall requiring a full imported biography. Provide one-interest entry, inspiration capture, and labeled examples.

### App preview/customization

- Preview the actual layout that will be created. Clearly label seeded preview content.
- Ask only for choices that matter: desired outcome, available time, or presentation preference. Avoid an exhaustive setup questionnaire.
- Main CTA: "Make mine." Display real build states: planning, generating, validating, ready, or failed with retry.
- Do not show fake progress percentages or claim completion before the app is usable.

### My apps

- Use a launcher-like grid with distinct names/icons. Add a compact recent-use strip or useful preview only when it helps.
- Open directly into the task. App management stays in a menu rather than a large gear beside every row.
- Show install and edit actions contextually.
- Do not fill the page with repeated "GET THINGS DONE," "EXPLORE LIFE," and "SAMPLE" pills. A clearly visible example-mode indicator and local sample labels where needed are sufficient.

### Memory and source management

- Replace the main "Your Context" destination with "What you've shared" under settings or the Agent.
- Group into editable interests, current needs, and sources. Keep inferred/explicit status and conflicts available.
- Make delete/forget effects understandable: what will stop informing suggestions and whether stored app records are separate.

### Empty, loading, error, and offline states

- Empty: one useful next action and a believable example.
- Loading: maintain the intended layout, then show genuine progress/state.
- Error: preserve user input and provide a specific retry path.
- Offline: state what is available. Do not imply offline persistence unless implemented and tested.
- Long text and missing images must not break the grid.

## 5. Three app identities

### Light: photography

**Visual direction:** gallery/contact sheet. Large images, restrained chrome, generous negative space, image-led titles. Warm white or charcoal may be chosen by the app; this does not change the parent shell.

**Reference palette:** charcoal `#181A1F`, paper `#FAF8F4`, lilac `#DBCBFF`, orange `#FF6A3D` as a tiny accent.

**Main screen:** a photo grid and one active photo exercise. "Add photo" is the primary action. Image details open into a photo-first view with short notes.

**Functional difference:** real visual media, capture/upload, image enlargement, optional observations. The screen must not look like a generic journal with a camera icon.

### Riff: music

**Visual direction:** listening/practice room. Dark ink, electric lime, expressive album/link artwork, prominent transport/time/tempo controls.

**Reference palette:** ink `#162039`, lime `#DFFF76`, blue-gray `#27324D`, pale text `#F7F8FC`.

**Main screen:** what the user is exploring and a short practice session. Link to the source song; start/pause a timer; adjust tempo if implemented; save a small result.

**Functional difference:** time and sound controls, practice state, listening references. Do not use the photography layout with a music icon.

### People: relationships and follow-through

**Visual direction:** compact, calm, practical. White and mint, restrained blue actions, clear people hierarchy.

**Reference palette:** white `#FFFFFF`, ink `#162039`, mint `#BCEED6`, blue `#3147F2`.

**Main screen:** next actions grouped by person or due state. Contact initials/avatars, brief context, clear action, due date, completion.

**Functional difference:** a short actionable queue and contact details. Draft/copy messages if supported; never represent an unsent draft as sent.

## 6. App variation is structural

For any two apps, check five axes: layout, dominant content, typography, primary interaction, and color. At least the first four must have a clear task-specific reason for their choices. Color variation alone does not pass.

Use common infrastructure for authentication, storage, permissions, accessibility primitives, revision controls, and publishing. Do not force all apps into one common visual shell. Reuse reliable components without exposing a template catalog as if it were unlimited custom code generation.

## 7. Asset direction

- Use actual user uploads or properly licensed images when imagery is central. Preserve credits/license notes in `docs/ASSET_SOURCES.md`.
- Use coherent icons from one existing library for the parent product. Give apps independent icons from a consistent export pipeline.
- Use tasteful artwork to help explain an app, not as random decoration.
- Remove the generic purple sparkle identity. A temporary simple brand mark is enough until a name is chosen.
- Do not copy another company's logo, mascot, distinctive artwork, or entire homepage.

## 8. Research references

Live homepages and YC listings were reviewed on November 14, 2026. The following are inspiration sources, not evidence of affiliation or endorsement. Homepages can change.

| Reference | Borrow | Link |
| --- | --- | --- |
| Cyclon, YC F26 | Device-led demonstration and clear personal-device promise | https://cyclon.ai/ ; https://www.ycombinator.com/companies/cyclon |
| Speak, YC W17 | Bright consumer clarity, blue/white contrast, human outcomes | https://www.speak.com/ ; https://www.ycombinator.com/companies/speak |
| Gumloop, YC W24 | Small expressive agent identity within a restrained layout | https://www.gumloop.com/ ; https://www.ycombinator.com/companies/gumloop |
| Spline, YC W21 | Visible creation surface and useful starting examples | https://spline.design/ ; https://www.ycombinator.com/companies/spline |
| Rosebud AI, YC S19 | A varied gallery that demonstrates outputs | https://rosebud.ai/ ; https://www.ycombinator.com/companies/rosebud-ai |
| Sunsama, YC W19 | Daily usefulness supported by a substantial product preview | https://www.sunsama.com/ ; https://www.ycombinator.com/companies/sunsama |
| Onlook, YC W25 | Typographic restraint and product showcase discipline | https://onlook.com/ ; https://www.ycombinator.com/companies/onlook |

The proposed palette and compositions are original design directions. They are not measured brand tokens from these companies.
