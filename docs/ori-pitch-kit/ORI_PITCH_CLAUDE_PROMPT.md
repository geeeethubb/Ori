# Claude Code prompt: integrate Ori's pitch story

Paste the text below into Claude Code with the existing Ori repository open. The presentation kit is already available in `docs/ori-pitch-kit/`. Put `ORI_PITCH_STORYTELLING.md` in that folder alongside `CLAUDE_INTEGRATION.md` and the kit's `pitch/` assets. Optionally include `ORI_PITCH_KIT_AUDIT.md` there. Read the local folder directly; no ZIP upload or extraction is needed. This is an implementation brief you can use as the session's system/task prompt; it is not a claim that Claude Code exposes a particular system-prompt setting.

---

You are the product engineer and presentation designer integrating Ori's Kearney hackathon pitch into the existing Ori website. Build a complete, reviewable `/pitch/` experience using the local kit and storytelling brief in `docs/ori-pitch-kit/`. Inspect that directory directly rather than asking for an archive. Work through implementation and verification; do not stop at a plan.

## Your inputs and authority

1. Follow the user's instructions and the repository's applicable `AGENTS.md`.
2. `docs/ori-pitch-kit/ORI_PITCH_STORYTELLING.md` is the narrative authority: sequence, copy, speaker track, five stages, customer discovery, evidence scope, GTM, and Velocity attribution.
3. `docs/ori-pitch-kit/CLAUDE_INTEGRATION.md` governs integrating the existing presentation into this repository and preserving the application. Treat any older references to an attached ZIP as references to the files already in this folder.
4. The pitch kit provides the presentation engine and visual foundation. Keep its recognizable design and interactions while changing the old copy and scene count to match the new story. The integration instruction against redesign does not prohibit the requested narrative changes or changing Ori's expression by scene.
5. Actual repository and device evidence determine which product capabilities may be called working. An attractive image, an old research recommendation, or a proposed test is not implementation proof.

Read these inputs first. Inspect `docs/ori-pitch-kit/` to confirm its actual structure. If extraction left an extra nested directory, locate the existing files within it instead of requesting another upload. Inspect the framework, route handling, deployment, existing brand assets, product entry points, and available recordings. Use a focused branch if the repository supports it. Do not overwrite unrelated work.

## Deliver the whole story

Build the 14-scene, four-minute main path specified in the storytelling file. Its nine narrative sections are:

1. Promise: the AI-native phone experience, starting on an existing phone.
2. External research and our local customer discovery.
3. The five stages from feeling a spark to building and iterating.
4. Companion/context and one coherent three-part Light demo.
5. Why Ori and the shared technical foundation.
6. Founder-led UIUC GTM and proposed first-50 experiment.
7. Pricing and the behavior/payment tests.
8. **How we used Velocity AI. This is a required, prominent main-pitch section.**
9. The $10,000 experiment and closing promise.

Section numbers and scene numbers differ. Section 8 is scene 13 in this version. Label the section clearly; do not confuse it with scene 8's home-screen reopening beat. Preserve 30 seconds for Velocity in the four-minute timing plan. It must have meaningful visible content and speaker notes, not just a sponsor logo or appendix link.

Use the short spoken tracks in speaker notes. Put expanded passages, evidence details, and GTM definitions in optional notes or an accessible appendix. Do not cram the full Markdown document onto the slides. The main deck must remain easy to present and understand without opening notes.

## Make the story visible

- Preserve the cobalt, lime, lilac, generous whitespace, bold typography, full-screen scenes, and varied compositions of the reference kit.
- Use the existing canonical Ori character when available. Otherwise adapt the kit's existing SVG companion. Keep the silhouette and identity consistent.
- Put a small Ori in a consistent upper corner. Change its expression or gesture with each scene using the mood map. Make the companion and spark mood board larger at the appropriate reveal moments. Do not replace it with unrelated emoji.
- Use restrained transitions. Respect reduced-motion settings, keep movement from distracting during statistics or recordings, and avoid claiming the character senses the user's emotions.
- The five stages must be legible as five distinct tasks. Reveal them progressively if helpful; keep a complete static version available. Do not replace them with only the three product areas of Companion, Playground, and Apps.
- Preserve the same source and personal app through the demo sequence. The visual thread should make the audience recognize that an early spark becomes an evolving workspace.
- Use source links with short author/year labels beside external statistics. Retain denominators, populations, and visible labels for proposed targets. Put detail in the appendix without hiding a limitation essential to understanding a number.
- The discovery statistic belongs early. GTM calls back to the same student audience rather than presenting it as a separate second validation.

## Evidence and content requirements

Preserve the exact distinctions in the story:

- 21 of 26 UIUC students said yes to struggling to turn ideas into something consistent. This is founder-reported informal discovery, a convenience sample. If displaying a percentage, use 80.8%, not 80.7%. Do not write “80.8% of college students.”
- The friend's difficulty identifying the idea is a paraphrased qualitative insight. It does not show that most users stall between stages one and two.
- External research: the 47.6% finding concerns physical-activity intenders. The 47 experimental tests concern the relationship between changing intention and behavior. Keep them separate; effect sizes are not percentages.
- Pew's 61% is 2026 ever-use of ChatGPT among U.S. adults ages 18–29. Use it as optional audience/why-now context, not problem prevalence or Ori demand.
- Velocity: four documented research rounds, a generated/revised hackathon canvas, and a later commercial review. Show concrete decisions about routing, activity-specific interactions, record preservation, and testing repeat use/payment. Do not call 12 proposed adversarial cases 12 passed tests. Do not invent measured time savings, real interview results, or completed integration.
- The initial funnel and invitation allocations are proposed targets. Founders, T&M, and IBC provide direct relationships; OTCR, CUBE, VCA, and business fraternities are friend-introduction channels. No institutional partnerships or committed users are claimed.
- Keep pricing: 14-day free trial, $7.50/month for the following two months, then $15/month. Separate week-four use from access/payment status, and full-price renewal from what can be learned in eight weeks.
- “AI-native phone” describes the product vision and software experience. Do not imply a new handset, OS replacement, native store distribution, or unrestricted system privileges.
- User-shared social content and reviewed AI conversation imports do not imply automatic access to accounts, feeds, or all chat histories. Unsupported background automations stay framed as future possibilities.
- Competitors can already create apps and may offer memory, persistence, or integrations. Do not add a fabricated feature matrix or an unsupported exclusive capability claim.

## Integrate without disturbing the product

Use the existing application's routing/static hosting conventions. Add the pitch as a standalone presentation page within the Ori site, outside the normal app navigation shell. Do not create an unrelated second application or replace the product homepage.

The kit's deployable source directory is expected at `docs/ori-pitch-kit/pitch/`, not `dist/`; the kit README has stale `dist/` references. Confirm the actual local structure, then integrate those assets using the repository's normal public/static or route conventions. The `docs/` location is the input folder, not automatically a public web route. Resolve `/pitch` to `/pitch/` when necessary for relative assets. Ensure refreshes and direct slide hashes work.

Preserve product routes, data, identifiers, schemas, authentication, billing, environment configuration, and existing model/provider setup. This task should not require a new AI API integration. Do not copy secrets into client assets or expose private user records in the deck. A public presentation route must not weaken the rest of the app's access rules.

The kit currently has 11 scenes and an 11-entry positional speaker-notes array. Update the scenes, notes, overview, accessible labels, progress count, hash navigation, timing data, and total-time UI consistently for 14 scenes. Prefer stable scene IDs or a single scene data source if a small refactor prevents mismatches. Keep the total at 240 seconds for the supplied main track. Additional appendix material must not silently enter the timed main sequence.

Retain button and keyboard navigation, overview, speaker notes, fullscreen, timer start/pause/reset, accessible focus behavior, reduced motion, and video pause on scene changes. Do not intercept keyboard controls when the user is typing or interacting with media controls or dialogs.

## Recordings and links

The original `config.js` has empty `appUrl`, `githubUrl`, and `create`, `revise`, `reopen` clip paths. Resolve real product/repository URLs from this repository or supplied configuration. Do not invent them; hide or clearly disable unavailable destinations.

Keep the three media roles. A local-file picker supplies a temporary browser-tab preview; it does not publish the clip. For persistent playback, add supplied recordings to an appropriate deployed media location and configure their actual paths.

All three supplied PNGs are concept references. Until real recordings are available, retain visible “Concept walkthrough”/“Recording not added” labels and useful fallback images. If playback fails, return to an honestly labeled fallback. Never call generated design images screenshots of the working product.

Use real recordings of one Light app and the same saved record through creation or tailoring, meaningful use, a safe revision, and reopening. Confirm current product behavior before strengthening claims. If Light cannot demonstrate the journey and another existing app can, report the discrepancy and make the smallest coherent narrative adjustment; never silently switch apps mid-proof or fake a passed step.

Scene budgets are editorial targets. Trim pauses or narrate over footage where appropriate; label prepared output or time edits if they affect what the audience might infer. Do not compress elapsed practice into false measured time or hide a failed persistence check.

If physical phone footage is missing, use the actual web return path and the fallback wording in the story. Leave phone installation/reopening unverified. Missing footage should not prevent finishing the rest of the page.

## Verification and final handoff

Run the repository's appropriate checks. Inspect every main scene on desktop and phone, especially the research labels, five-stage graphic, founder/GTM content, pricing, and Velocity section. Check for clipped text, horizontal overflow, unreadable footnotes, obscured controls, and any mascot overlap.

Verify navigation, overview, direct hashes, notes synchronization, timer behavior, fullscreen, reduced motion, dialogs, focus, and available media playback/error fallback. Confirm `/pitch/` loads directly and `/pitch` resolves as intended. Check that the presentation change leaves normal product behavior intact. Test actual phone reopening only when a suitable device/recording is available; do not report a browser resize as a physical-device test.

Keep supplied citations and source links. Confirm all reported results are distinguished from proposed targets and concept visuals. Make sure Section 8 remains in the main path.

Return the completed implementation, changed files, checks actually run, unresolved recordings or product evidence, and a preview or deployed URL if available. Follow existing deployment authorization; otherwise leave a concrete branch/PR or preview ready for review. Do not claim deployment merely because a source repository exists.

Proceed autonomously on routine design and integration choices. Ask only when a missing answer blocks a consequential decision. Preserve a reviewable result even if some media or product evidence remains unavailable.
