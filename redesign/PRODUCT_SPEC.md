# Product specification: agent + playground + apps

Version 1.0 | November 14, 2026

## 1. North star

A personal AI that turns your interests and everyday needs into a playground of apps made just for you.

The user should feel: "Something I cared about became something useful on my phone, and it feels like mine."

The product has three connected surfaces:

| Surface | Job | User language |
| --- | --- | --- |
| Agent | Receive inspiration, understand intent, help the user act, and improve existing apps. | "I saw this. Help me do something with it." |
| Playground | Reveal relevant possibilities, including things the user did not know to ask for. | "What could I explore or make next?" |
| My apps | Provide enduring, individually designed tools that work outside the main collection screen. | "This is part of my day now." |

The collection must serve both useful work and curiosity. Do not collapse everything into habit tracking, task management, journals, or chat.

## 2. What success looks like

The first complete demo journey:

1. The user shares a guitar inspiration with a link and a short note: "I like this sound and have 15 minutes to practice."
2. The agent acknowledges what it actually received. If the reel is inaccessible, it uses the user's note and clearly says it has not read the reel itself.
3. It offers two paths: explore related music, or create a small practice space. It may suggest updating an existing app instead.
4. The user previews a personal music app, adjusts one preference, and creates it.
5. The app has its own URL, identity, playable practice timer/tempo tool, and saved session state.
6. The user opens a photography app with a substantially different visual hierarchy and primary interaction.
7. The user adds the chosen app to their phone's home screen, opens it directly, saves an entry, and returns later with their data intact.

The first useful interaction should occur before lengthy profile import. Aim for a preview within the first minute using prepared local examples; measure actual live-model latency separately. This is a design target, not an established benchmark.

## 3. Agent behavior

### Capture

Support typed thoughts, pasted text, saved links, and images/screenshots. Reuse existing upload facilities where possible. Keep the existing AI-profile import as an optional accelerator, under "Bring more context."

For every capture, record the owner, source, time, and whether the content was actually read. A URL alone is not proof of access to the page or video. Show a useful saved-link state when the source cannot be read. The fallback is to ask for a short description, excerpt, or screenshot, not to fabricate an analysis.

### Understand and respond

- Distinguish a passing save from a lasting interest or commitment.
- Ask at most one useful clarifying question when the intent materially changes the result; otherwise show a small set of choices.
- Offer "Explore this," "Make something useful," "Add to an app," or "Just keep it" when appropriate.
- Reuse existing apps when that is more useful than creating another.
- Give each suggestion one brief reason grounded in a real source.
- Keep source detail, inferred/confirmed status, and editable memory available in a detail drawer or settings page.
- Let users correct or forget context and dismiss a recommendation without turning the dismissal into a new permanent fact.

### Improve

From an app, "Make this more me" opens a focused change request. Show a human-readable preview, preserve records when accepted, and retain undo. Agent suggestions may use explicit feedback and consented first-party events. Do not imply access to phone activity, private social feeds, or other AI chats.

## 4. Playground behavior

Replace the long recommendation cards with visual previews and concise reasons.

Each proposal contains:

- An outcome-led title, not a database/table name.
- A preview of what the user would see or do.
- One sentence on why it fits this user now.
- One primary action: Explore, Try, Make mine, or Open.
- Optional "Why this?" detail and a low-emphasis dismissal.

Show a small, varied set: deepen one existing interest, explore one adjacent interest, and address one recurring practical need. Do not force this balance when the available context does not support it.

Exploration may produce a listening queue, a photo exercise, a reading trail, a weekend experiment, or a compact interactive tool. It does not always need an app. Recommendations involving current artists, events, locations, or external resources require reliable retrieval or an explicitly curated source; do not invent links or availability.

Avoid an endless engagement feed. The useful destination is an activity, discovery, or retained tool.

## 5. App requirements

Every app must have:

- A stable direct URL, independent page title, icon, and install metadata.
- Its own layout, typography, accent palette, content hierarchy, and task-specific primary action.
- Working storage and owner authorization.
- A way to customize or revise the app without losing existing data.
- An understated link back to the collection, not the full store navigation filling the app.

### Photography: "Light" (example app title)

Primary content is photography. Include real photo upload/display, a contact sheet or visual gallery, a full-image view, and a small observation/caption. A light challenge can help the user act. Existing text-only walk entries must remain readable. Do not require a long questionnaire to save a photograph. Location is optional and user-entered in the first version.

### Music: "Riff" (example app title)

Provide a listening/practice space: saved song or inspiration links, a practice-session timer, adjustable tempo/metronome if feasible, and a short saved session result. Use link-outs for external music in the core scope; licensed streaming, automatic transcription, and music generation are not implied. Artist discoveries must be sourced, not invented. Sound starts only after an explicit user action.

### Relationships: "People" (example app title)

Use compact people cards and a next-action queue: who, what we discussed, promised action, and due date. Support due filters, completing an action, and returning to the right person. Keep communication drafts separate from sending. No automatic outbound messaging is required.

These are three high-quality reference experiences and capability families, not a claim that the product can only ever make three apps.

## 6. Screen changes

| Current screen | Required revision |
| --- | --- |
| Landing | Show the personal-device promise, a short product demonstration, and visually distinct app previews. Primary CTA: "Make it yours." Secondary: "Try an example." |
| Empty For You | Show a useful starting point: add one interest, share inspiration, or try a labeled example. Remove the mandatory context-import wall. |
| Bring your context | Rename to a human action. Make paste/upload optional and progressive. Hide the long export prompt behind a simple copy control. |
| Your Context | Move detailed facts, sources, confidence labels, and conflicts to editable memory/settings. Preserve transparency without making it the main product. |
| For You | Become Playground. Lead with visual outcomes, previews, variety, and first actions. |
| My Collection | Become My apps. Use an app-launcher layout with recognizable icons, recent-use affordances, and compact previews where useful. |
| App page | Use a task-specific design with its own identity and direct install flow. |
| Revision UI | Present "Make this more me," a change preview, accept/cancel, and undo. |
| Settings | Hold memory controls, source management, export/delete, appearance, and trial/account information. |

Guest examples should be obviously examples, with no personal data and no claim of personalization. Persisting personal content or publishing a private app can request sign-in at that point. Reuse current authentication rather than introducing a new provider during the redesign.

## 7. Delivery boundaries

### Core redesign

Agent capture and grounded suggestions; visual Playground; redesigned My apps; three differentiated functional app experiences; stable URLs and existing persistence/revision behavior; install guidance; mobile polish; an honest end-to-end demo.

### Next, if the core passes

Share-target integration where supported; broader task components; richer agent-initiated app improvement proposals; a guarded custom-frontend generation experiment; shareable app blueprints without personal data.

### Later vision

Authorized social/account connectors, deeper device integration, reliable background automation, richer generated frontends, distribution/remixing, and a broader personal software environment. These are roadmap items, not checked-off capabilities.

Do not imply unrestricted iOS background access, reading all social activity, automatic access to another assistant's memory, or automatic external artifact hosting merely because an AI API is connected.

## 8. Product value, distribution, and business model

Initial audience: curious, AI-comfortable students and early-career builders who save inspiration, juggle small recurring responsibilities, and already improvise personal tools. Zuyu can recruit an initial test cohort through existing campus entrepreneurship and creative communities. This is a launch hypothesis, not validated product-market fit.

Value to test: "My saves turn into things I do, and useful tools fit me without setup work." Users should pay for sustained discovery, reliable personal tools, hosting/persistence, and ongoing adaptation. Generating one novelty app is not enough.

Keep the previously selected offer as an experiment: 14 days of full feature access, then $7.50/month for two months, then $15/month. Display terms clearly. Do not claim unlimited compute unless a feasible policy exists; show a transparent generation allowance and keep exploration/use generous. Do not fake checkout, billing, or subscriptions. After a trial, preserve data and offer access/export rules that are clear before signup.

Potential defensibility comes from a consented history of which inspirations became useful actions, reusable application capabilities, quality of adaptation, and distribution within real communities. Personal context alone is not a proven moat. Keep user export and deletion possible.

First feedback cohort: five observed sessions, then a larger campus cohort if the first journey works. Measure first useful action, first saved app, home-screen installation, return on a different day, use across multiple apps, and willingness to pay after repeated use. Targets are experiments; do not put invented conversion or retention numbers in the pitch.

## 9. Three-minute demo

- 0:00-0:25: "Your interests have somewhere to go." Show one real inspiration and the note that explains it.
- 0:25-1:05: Agent understands the intent, offers exploration plus a useful app, and explains why in one sentence.
- 1:05-1:45: Customize one thing, create/open the app, perform its core action, save, and reload.
- 1:45-2:20: Open photography and music side by side to demonstrate different design and interaction.
- 2:20-2:45: Launch one from the physical phone home screen; make one safe revision with preserved data.
- 2:45-3:00: Explain the next vision and the actual Velocity contribution. Clearly label anything staged or not yet built.
