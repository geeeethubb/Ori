# Ori pitch revision brief for Claude

Reviewed against the live 15-slide deck at https://ori-fjrx.onrender.com/pitch/ on November 15, 2026.

**Deliverable:** revise the existing browser pitch into a visually led 16-slide presentation. Implement the changes in the existing repository. This is a pitch refinement, not a product rebuild.

**Latest instruction from Zuyu:** Zuyu will film any new demo videos. Claude must not generate or record videos. Build the layouts, playback controls, and clearly mapped media slots; reuse appropriate existing clips or real screenshots until Zuyu supplies the replacements. Missing videos must not block the rest of the work.

**Final-slide correction from Zuyu (overrides the earlier closing-slide request):** the only visible content on slide 16 is **“Ori. Your phone, your story.”**, the supplied QR code, and his contact details. No “Thank you,” visible URL, signup instruction, or additional closing copy. Put the invitation to create an individual account in speaker notes instead.

## 1. Direction and editorial judgment

The existing identity works: Ori's expressive companion, large type, pale backgrounds, indigo, lime accents, and the Light story. Preserve that identity. The issue is hierarchy: explanations, qualifiers, decorative subtitles, and main claims frequently compete for attention.

The revised story should be:

**I feel something → Ori helps me understand it → we shape a useful app → using it gives Ori more context → the app evolves with me.**

This serves both personal interests and everyday productivity. The companion is the connective tissue throughout, not just a mascot in the corner.

My recommendations beyond the requested edits:

1. **Make the friend's insight the pivot.** The problem begins before someone can write a good app prompt. This is more distinctive than a generic claim that people struggle with habits.
2. **Make growth concrete.** Show what changes in the app, what new context informed that change, and the user's existing work still present. An animated circular arrow alone does not demonstrate adaptation.
3. **Give slides 9 and 10 different jobs.** Slide 9 explains the two use cases; slide 10 explains the competitive position. Zuyu's later ordering overrides the earlier suggestion to put the competitor graph on slide 9.
4. **Do not lose the direct-to-app moment.** Replace the current slide 8, but retain a brief return-to-Light moment at the end of slide 7 or in the demo appendix. An app with its own entry point makes the AI-native-phone vision tangible.
5. **Put proof behind the presentation, not all over it.** Keep sources, methodological detail, commercial assumptions, and research history accessible in notes/appendix. Keep short labels where they change how a judge interprets what they see: Goal, Proposed pricing, Sample-mode recording, or Concept.
6. **Use a meaningful competitor map.** “Potential” and “opportunity” are too vague to be useful axes. Show the particular product experience Ori is trying to own. The graph should make the advantage legible without pretending a positioning diagram is a measured benchmark.

## 2. Global presentation rules

- One dominant idea and one dominant visual per slide.
- Reduce visible copy substantially. Most slides should have a headline, short labels, and one takeaway—not paragraphs in cards.
- Slide 11 should retain roughly 30% of its current explanatory prose. Slide 14 should become a graphic, not a restyled table.
- Remove generic section descriptions and subtitles that repeat what the slide already says. Small navigation labels can remain if unobtrusive.
- Preserve meaningful qualifications compactly. Do not turn the main deck into a disclaimer wall or silently change what is being claimed.
- Use black/ink or very dark navy for dark scenes, with the existing lime for emphasis. Keep saturated blue as an accent, not the full background of the close.
- Use the canonical Ori art and existing happy/success expression. Do not substitute a generic smiling emoji, redesign the character, or introduce a new illustration style.
- Use consistent icon weight, spacing, and color. Prefer existing vector assets and the project's icon set over assorted emoji.
- Motion should explain a relationship: reveal a step, move context into Ori, connect the journey, or show an app changing. Avoid constant background motion and excessive animation delays.
- Preserve keyboard navigation, scene links, overview, presenter notes, timer, appendix, media expansion, and reduced-motion behavior.
- At presentation sizes, slides should fit the available screen without vertical scrolling. In the review, demo slides had visible overflow even at a 1600 × 900 viewport; check the actual presentation mode as well as the normal page.
- Design the main path for **four minutes**, leaving **two minutes for Q&A**. Sixteen slides do not require sixteen equal explanations.

## 3. Slide-by-slide implementation

### Slide 1 — Keep the opening

**Keep:** “Your phone, your story.” The current phone illustration, apps, companion, and introductory promise are effective.

- No conceptual redesign.
- Preserve “An AI-native phone experience. Apps that grow with you.”
- Keep “Starting on the phone you already own.” This makes the vision understandable without implying new hardware.
- Only adjust spacing or sizing if needed for presentation fit.

### Slide 2 — Two findings on the left; one takeaway on the right

**Headline:** Wanting is only the beginning.

**Layout:** dark ink background. Two compact findings stacked in the left 45%; one large lime statement in the right 55%. A subtle connecting line can join the evidence to the takeaway.

**Finding 1:**

- Large number: **47.6%**
- Label: **Intended to exercise. Didn't follow through.**
- Small source: Feil et al., 2023.

**Finding 2 — replace “47 experiments”:**

- Large display: **≈½**
- Label: **Behavior changed about half as much as intention.**
- Small caption: Standardized effects: 0.36 vs. 0.66.
- Small source: Webb & Sheeran, 2006.

**Dominant right-side takeaway:**

> Wanting needs a bridge to doing.

The second display is an approximate comparison of the paper's reported standardized effects (0.36 ÷ 0.66 ≈ 0.55), not a claim that half of intentions became actions. Make that distinction in a compact source note and the appendix. If the symbol alone is unclear, render two small labeled bars, “Intention 0.66” and “Behavior 0.36,” under it. Keep the interpretation readable.

**Remove:** “47 experiments” as a hero statistic, full study descriptions, large research IDs, and duplicated caveats. Study scope belongs in the source note/appendix: the first result concerns physical activity, and neither study measures Ori's effectiveness.

### Slide 3 — Make the question, 21/26, and friend's insight the whole slide

**Top:** retain the actual discovery question:

> Do you struggle to turn your ideas into something consistent?

**Center-left:** giant **21 / 26**, with “students said yes.” Use the current 26-dot visual, with 21 filled and five outlined, at a smaller supporting scale. Do not add a competing 80.8% headline.

**Center-right:** the friend's insight, much larger than today:

> Sometimes the hard part is pinpointing what the idea even is.

Use a small “A friend's insight · paraphrased” attribution. This is not a verbatim interview quotation; do not invent a person's name or testimonial.

**Below:** exactly two visual examples:

1. A saved Instagram reel: a simple reel thumbnail/play symbol, labeled “A saved reel.”
2. A note bubble: **“Why do I never…”**

Remove the third “sentence that stayed” example and the long “One conversation changed…” introduction. The insight itself should carry the moment.

**Bottom asterisk:** “Informal conversations with 26 UIUC students.” Keep the fuller convenience-sample explanation in the appendix. This is discovery evidence, not 21 users, paying customers, or proof of product-market fit.

### Slide 4 — Keep the transitions; make Ori own the whole journey

**Keep the five stages and existing transition rhythm:**

1. Feel it
2. Name it
3. Imagine it
4. Shape it
5. Build and iterate

Keep stage titles and simple icons central. Remove the blue explanatory sentences such as “Capture the spark with the context you choose to share,” and remove the human-task/Ori-role color legend.

If labels need support, use only short fragments: **A feeling / A clearer need / Possibilities / Your tool / Use and evolve.** Do not put another paragraph under every stage.

**Final reveal when step 5 appears:** a single continuous path or enclosing ribbon joins all five stages. The happy Ori companion becomes central to that connected path, with the clear label:

> Ori helps you through all five.

Then show a return curve from use back toward context/feeling, with the short line **“And keeps growing with you.”** The path should visibly connect every stage; coloring boxes blue is not enough.

Keep the five-stage framework explanation in notes. The visual expresses the product journey, not a scientifically validated behavioral model or a guarantee of habit formation.

### Slide 5 — Feeling / intuition → personal app

**Headline:** A feeling can become an app.

Replace the current text-heavy right half with a full-width transformation visual:

- **Inputs:** a shared ChatGPT/Claude summary, an Instagram reel/link, a photo, and a short thought bubble.
- **Center:** large Ori companion, helping clarify the feeling. Keep one tiny exchange if useful: “Keep photos, or notice moments?” → “Notice moments.”
- **Output:** a tangible Light app preview and icon.

Use the labels **Feeling → Ori → Your app** as the main structure. “Companion → Playground → Apps” can be secondary or move to notes if redundant.

Make the inputs feel personal, not like enterprise data integration. This slide should say: you do not need a polished app specification; bring something that interests or bothers you.

**Implementation truth:** represent user-shared context accurately. Pasting a summary, uploading a supported file, or sharing a reel link is different from automatically reading someone's ChatGPT, Claude, or Instagram account. Do not draw active sync connectors unless the implementation supports them. Verify actual attachment/link support in the repository; unsupported actions belong to a clearly marked concept, not the recorded-demo claim.

### Slide 6 — Creation demo plus a visual step-by-step guide

**Headline:** From a thought to Light.

Keep the product recording prominent on the left. Use the previously empty right side for three large visual steps:

1. **Share the spark** — photo/reel and a short thought.
2. **Shape the idea** — Ori's clarification or a real proposal/preview.
3. **Open your app** — Light's distinctive interface and icon.

Each step gets an icon or an actual cropped screenshot, a short label, and a visible connecting line. Remove the current repeated explanatory sentences and tiny bottom flow.

The active step can highlight with playback, but do not invent timestamps before the final video exists. Make the right-side sequence useful even when video is paused. Provide simple configurable cue points or manual step controls if appropriate to the existing code.

Keep replay, pause, and expand usable. Preserve a real poster image. Video should not race ahead of the spoken story.

**Media:** retain the existing creation clip temporarily. Zuyu will film a replacement if needed. Do not record or generate one.

### Slide 7 — Show an app growing with its user

**Headline:** Your app grows with you.

Keep the use/revise demo on the left. Replace the three prose statements on the right with a visual feedback loop:

**Use it → More context → Better fit → Use it again**

Add a small before/after pair showing the same Light app:

- Before: existing gallery and a real saved observation.
- Context: a new preference, observation, or user request.
- After: a visible change to the app while the earlier photo and observation remain.

Use the actual change shown in the supplied recording. Do not invent a complex automatic recommendation to make the demo look stronger. A changed focus, new field, revised view, or other supported edit is enough if the reason for it is clear.

**Short takeaway:** “New context. Better fit. Still your app.”

The visual must communicate both continued context and continued ownership of progress. It should not read as a one-time website generation demo.

Inspect the implementation before claiming automatic adaptation. If the present flow is user-led, show **“Tell Ori → Review → Update”** as the mechanism. The larger vision can remain apps that grow with you; do not depict passive monitoring or autonomous background redesign as already shipped.

Finish with a brief direct return to Light using its own link/icon when the available recording supports it. Reuse the current slide-8 return clip as an optional short ending or move it to the appendix. A browser link does not prove native installation; use an actual phone recording for a literal home-screen claim.

### Slide 8 — Replace the persistence slide with context import and Playground

**Headline:** Bring your context. Explore what could be yours.

Use two large, complementary feature views:

**A. Bring your context**

- Show the real “Bring context from your AI” flow.
- Visually summarize **Copy prompt → Ask your AI → Bring back the summary**.
- Show how the person reviews what to share, using the actual product flow.
- Use provider names as examples of where the user can obtain context, not as a claim of automatic account access.

**B. Explore your Playground**

- Show the actual Playground screen with a few visually distinct directions.
- Highlight choosing a possibility and the next app/proposal step.
- Label simply **“Explore possibilities”** or **“Choose a direction.”**

This is a feature reveal, not a catalog. Two strong features are enough. Do not add six small screenshots to fill space.

**Media:** Zuyu can film the import flow and Playground. Until then, use genuine screenshots of the relevant existing screens, or reuse available genuine assets. Claude must not create a video. Missing recordings are an asset handoff item, not an excuse to leave slide 8 untouched.

Remove “Tomorrow, your progress is still here” and its repeated supporting copy from this slide.

### Slide 9 — Interests and workflows in one platform

**Headline:** What you love. What you need to get done.

Create two visual zones around one shared Ori companion:

| Personal interests | Everyday workflows |
| --- | --- |
| Light: photography | People: follow-ups |
| Riff: music practice | A recurring task/workflow already supported in the product |

Use miniature app interfaces and recognizable actions, not abstract feature cards. The right-side second example is optional; do not invent a shipped calendar integration, email agent, or automation solely for symmetry.

Show both sides feeding a shared context ring or one phone containing the apps. One small return arrow communicates evolution over time.

**Bottom line:** “One companion. Personal apps. Both grow with you.”

Communicate Ori as a personal tool and productivity tool together. Use “automate” only for actions the build really automates. If current capabilities organize or guide a workflow, demonstrate that concretely and leave external automation to the vision/roadmap.

Move the old architecture explanation (“useful actions / durable records / careful revisions”) to the appendix. Those are implementation foundations, not this slide's story.

### Slide 10 — A competitor map with a clear, specific position

**Headline:** Personal context, turned into everyday apps.

Use one large XY positioning map, not another three-card feature list.

**Recommended axes:**

- **X: Starting point** — “An app you already know you need” on the left; “Your context, interests, and unclear ideas” on the right.
- **Y: Everyday experience** — “A general workspace” at the bottom; “Distinct personal apps you return to” at the top.

These describe product emphasis. They do not purport to measure intelligence, quality, revenue, or market potential. “Potential” and “opportunity” should not be axis names.

**Suggested visual regions to validate against current products:**

| Alternative | What the region illustrates |
| --- | --- |
| Traditional app stores / specialist apps | Ready-to-use apps; the user selects from existing products. |
| AI app builders, e.g. Lovable | Creating and revising software, with a product/project as the destination. |
| General AI assistants / artifacts, e.g. Claude | Rich conversation and context, increasingly with interactive apps and storage; meaningful overlap with Ori. |
| General workspaces, e.g. Notion | Organizing work and context in a broad workspace, with AI capabilities. |
| **Ori** | The intended combined experience: explore an unclear personal need and keep distinct daily-use apps together around the person. |

Place Ori prominently in the upper-right using its mascot and lime accent. Let alternatives occupy honest regions; do not fabricate precise numerical scores or crush every competitor into the bottom-left. A competitive product may overlap Ori. That makes a specific product-focus argument more credible, not weaker.

**One supporting line:** “From an unclear spark to an app that keeps growing.”

Use a small **“Product positioning”** label. Keep sources and rationale in the appendix. If the repo does not support a depicted capability, use an outlined **“Ori vision”** marker or a short dashed extension from the verified present position. Do not quietly score planned behavior as existing functionality.

**Research constraint:** Claude already documents interactive AI apps, persistent data, and connected tools. Lovable documents application generation and continuing iteration. Notion documents connected context and agent memories. Therefore the deck must not claim these competitors only chat, forget everything, cannot store data, or cannot build apps. Ori's proposed advantage is the integrated, phone-first personal journey and lower friction for the target user—not exclusive possession of these primitives.

### Slide 11 — Founder credibility, community access, and two dated goals

**Headline:** I'm building with the community I already know.

**Founder block:** make Zuyu visible and identifiable. Use an existing real portrait if available; otherwise use a clean name/initials treatment. Do not generate a fake portrait.

- **Zuyu Liu**
- **UIUC · Engineering × business**

**Around the founder, show the groups and actual relationships, without invitation counts or paragraphs:**

- **Founders — Illinois Entrepreneurs · President**
- **IBC · Project Manager**
- **Hoeft T&M · Student**
- **Friends in OTCR, CUBE, VCA, and business fraternities**

Use text chips or appropriate available visual marks. Keep the distinction between leadership, membership, and friends in other groups. This is personal access, not an institutional partnership announcement.

**Prominent evidence callback:** **21 / 26** with “students I spoke with share this problem.” Link back to the discovery question, not product adoption.

**Make this pipeline central, with icons and labels only:**

**Relationships → Personal onboarding → Observe → Product iteration → Referrals**

Use **iteration**, not “learning.” Remove explanatory sentences under every stage. The pipeline is a proposed recruiting and feedback mechanism, not a measured conversion funnel.

**Only two pilot targets on the main slide:**

- **150 invitations by Dec 1, 2026**
- **50 enrolled by Dec 15, 2026**

Put them under the short label **“Pilot goals.”** Remove the per-group 50/25/25/50 allocation, the 30 later-day actions, and the 15 week-four users from the visible slide. Keep activation and retention definitions in notes/appendix for Q&A.

The layout should make three things obvious: who Zuyu is, why he can reach these people, and what he will do next.

### Slide 12 — Keep the graph, simplify the roadmap, enlarge YC

**Headline:** Start at UIUC. Grow from there.

Keep the existing linear growth graph and its target values unless the founder changes them:

| Month-end | Cumulative registered-user goal |
| --- | ---: |
| January 2027 | 50 |
| March 2027 | 500 |
| May 2027 | 5,000 |
| July 2027 | 25,000 |
| September 2027 | 100,000 |

Replace **“Stretch targets — not traction”** with **“Goal.”** Title the chart **“Registered-user goal”** so the number is still defined. Retain a dashed goal line and an honest scale; do not make a tiny early increase appear comparable to the 100,000 endpoint.

Remove the prose under every milestone. Keep short channel labels: **UIUC / Other campuses / Young professionals.** A small branch graphic is enough; the detailed acquisition assumptions belong in notes.

Make **“YC Summer 2027”** a large, deliberate milestone card, with **“Application goal”** immediately nearby. It should be visibly important, not buried at the bottom. This is an ambition, not acceptance or backing. Do not invent a deadline.

**Consistency:** the 50 people targeted for enrollment by Dec 15 are the initial cohort; January is the pilot/observation checkpoint, not a new claim that enrollment first starts in January. Explain that in notes, or minimally update the first milestone caption to avoid conflicting stories. Preserve the graph's agreed numbers.

The main slide should feel ambitious. Detailed discussion of what growth requires remains available for Q&A.

### Slide 13 — Keep the pricing ladder, remove repeated justification

**Headline:** Try it. Make it yours. Keep it.

Keep three prominent stages:

**14 days free → $7.50/month for 2 months → $15/month thereafter**

Use a compact **“Proposed pricing”** label. Keep the introductory duration and “per month” readable; do not simplify away the actual terms.

Replace the three text-heavy value cards with three small icons/labels:

**Personal fit / Your progress / Room to grow**

Remove the visible measurement funnel and repeated trial-versus-tier explanations. Put useful return, conversion, renewal, and cost-to-serve definitions in notes. No claim that billing, conversion, or margins are already proven.

### Slide 14 — Show the questions Velocity helped answer

**Headline:** Velocity helped us ask better questions.

Replace the table with a clean **2 × 2 grid** of visual question → decision stories. Use neutral text, one accent per active element, and ample whitespace.

| Icon concept | Short question | Short decision |
| --- | --- | --- |
| Branching path | Build something new? | Save, reuse, revise, or create. |
| Cursor completing an action | What makes it useful? | Real actions, not just screens. |
| Record carried between two app views | Can it change safely? | Keep progress through revisions. |
| Return arrow + payment symbol | Will people keep it? | Test return use and payment. |

Animate a question resolving into its decision, or use a static arrow if that is cleaner. The icons must show the decision, not just decorate paragraphs.

**Small supporting line:** “Research → product decisions → pilot tests.”

Move the counts of rounds, canvas revisions, detailed adversarial cases, and research artifact list into the appendix. Keep enough attribution that the judges understand what Velocity contributed.

Do not claim Velocity established demand, proved willingness to pay, built the whole product, or passed tests just because it proposed them. The slide shows decisions informed by research; actual product behavior and pilot results require separate evidence.

### Slide 15 — Make the ask memorable and readable

Use an ink/near-black background with lime emphasis and a restrained happy Ori. Remove the full saturated-blue background.

**Hero:**

> $10,000. 0% equity.

**Small punchline directly below:**

> The perks of a hackathon.

Treat this as the founder's playful prize ask, not a claim that an investment round or award has been agreed. No need for a wall of investment disclaimers.

Replace the two prose-heavy lists with three simple visual uses:

**A reliable product / A 50-person pilot / Evidence to grow**

Optionally keep **“8 weeks”** as a small timeline motif if it helps the story. Detailed budget allocations stay in the appendix; do not invent new spending promises.

Delete the entire “It does not fund or guarantee…” line from the main slide.

**One large bottom line spanning the screen:**

> Help us build a phone that grows with you.

Move website/contact actions to slide 16 so this slide has one job.

### Slide 16 — Only the signature line, QR, and contact

Create a new final scene that can remain on screen throughout Q&A.

**The only hero line, exactly:**

> Ori. Your phone, your story.

**Content:**

- The attached QR image, **qr-code (15).png**.
- **Zuyu Liu**
- **zliu2017@illinois.edu**
- **847-962-2868**

Use a calm ink background, strong readable type, and generous spacing. The line should feel like the final payoff of the opening slide. No additional mascot, app illustrations, cards, badges, section labels, slogans, “Thank you,” visible URL, or signup CTA. In presentation mode, keep navigation chrome out of this final composition while preserving keyboard operation and access to controls when needed.

Give the QR a large white backing with its clear margin preserved; no logo overlay, distortion, heavy shadow across the code, or colored modules. Aim for at least roughly 300 px square on a 1600 px-wide presentation, and verify it scans at presentation distance.

Use the supplied image, not an AI-generated QR. The attached PNG was decoded during this review and correctly encodes **https://ori-fjrx.onrender.com/**. Retest the code after it is placed in the slide, especially at the final display size.

Use `mailto:zliu2017@illinois.edu` and `tel:+18479622868` for the contact links. Make the QR clickable to **https://ori-fjrx.onrender.com/**, without adding a visible URL label. In speaker notes only: “Scan the code, create your own account, and try Ori.” Do not display shared demo credentials or the account-creation instruction on the slide.

Update the scene count, overview, scene links, keyboard navigation, speaker notes, progress indicator, and end-of-deck behavior to 16. The Next button on 15 must now reach 16; 16 should remain visible during Q&A.

## 4. Video shot list for Zuyu — Claude does not film these

The build should proceed before these files are ready. Keep existing media where useful and use actual screenshots for the new slots. Do not produce simulated product videos or fabricated recordings.

| Clip | Destination | What Zuyu should record | Suggested usable length |
| --- | --- | --- | --- |
| A — Thought to Light | Slide 6 | Share a photo/thought → answer a useful clarification or choose a proposal → preview → open Light. Hold the resulting app so the payoff is readable. | About 20–25 seconds |
| B — Light grows with me | Slide 7 | Open Light with an existing entry → add a real observation/context → request one supported change → review/apply → show the change and the original entry still present. | About 20–25 seconds |
| C — Bring context from my AI | Slide 8, first feature | Open the context-import helper → copy its prompt → show an appropriate prepared response from ChatGPT/Claude → bring the summary back and review it in Ori. | About 8–12 seconds, or stills |
| D — Playground | Slide 8, second feature | Open Playground → show a few possibilities → choose one → hold on the relevant next step. | About 8–12 seconds, or stills |
| E — One tap back to Light | End of slide 7 or appendix | On a real phone if available, tap Light's home-screen icon and show the saved entry. Otherwise use the existing direct-link recording and describe it accurately. | About 3–5 seconds; optional |

For slide 8, two complete 12-second clips do not fit a 15-second talk beat. Show brief excerpts, use a two-state presentation, or let screenshots carry one feature. The full recordings can remain expandable for Q&A.

Recording guidance:

- Reuse the same account, Light app, photo, and saved record across clips so continuity is visually obvious.
- Record the real product. If using live AI, allow the genuine result; trim waiting time without fabricating behavior. If using Sample mode, retain a compact accurate label.
- Keep the cursor/taps deliberate and hold each result briefly. Avoid rapid screen changes that require the judges to read tiny text.
- Use a test account or deliberately chosen context. Do not expose unrelated private conversations, emails, passwords, API keys, or account settings.
- Product footage does not need narration; Zuyu is speaking live.
- Film the screen area, avoiding browser clutter where practical. Use consistent aspect ratio for each slot.
- Do not splice a phone-home-screen tap into a claim of verified installation unless that action was actually filmed.

Claude's handoff should name each slot, its aspect ratio, expected filename/location, poster, and optional cue points. Use the repository's existing asset conventions rather than hardcoding a guessed directory in advance. Add new clips later without a layout rewrite.

## 5. Four-minute rehearsal allocation

| Slide | Seconds | Cumulative |
| --- | ---: | ---: |
| 1 — Promise | 7 | 0:07 |
| 2 — Evidence and takeaway | 12 | 0:19 |
| 3 — Discovery and friend's insight | 19 | 0:38 |
| 4 — Five stages, one Ori | 17 | 0:55 |
| 5 — Feeling to app | 14 | 1:09 |
| 6 — Create Light | 26 | 1:35 |
| 7 — Adapt Light | 26 | 2:01 |
| 8 — Context and Playground | 15 | 2:16 |
| 9 — Interests and workflows | 13 | 2:29 |
| 10 — Competitor map | 16 | 2:45 |
| 11 — Founder and pilot | 19 | 3:04 |
| 12 — Growth goal | 12 | 3:16 |
| 13 — Pricing | 10 | 3:26 |
| 14 — Velocity | 15 | 3:41 |
| 15 — Ask | 12 | 3:53 |
| 16 — Signature close / spoken invitation | 7 | 4:00 |

These are editing budgets, not forced autoplay timers. Preserve manual pacing. Keep at least two minutes separate for Q&A. Update the existing timer/notes so the new scene is accounted for.

## 6. Source and claim notes for the appendix

### Research used on slide 2

- [Feil, Fritsch & Rhodes, 2023](https://pubmed.ncbi.nlm.nih.gov/37460164/): the reported intention–behavior gap among people intending physical activity is 47.6%. The meta-analysis included 25 samples and 29,600 participants overall; that overall sample is not the denominator of every reported subgroup percentage. Do not broaden the number to all ambitions or all students.
- [Webb & Sheeran, 2006](https://pubmed.ncbi.nlm.nih.gov/16536643/): 47 experimental tests; reported changes in intention and behavior had standardized effects of 0.66 and 0.36 respectively. The ≈½ treatment in this brief is an approximate comparison of those effects, not a quoted success rate or percentage-point change.

### Competitor capability checks

Checked November 15, 2026; recheck if implementation occurs substantially later. These sources support product capabilities. Placements on the proposed map are qualitative editorial judgments about product focus, not published scores.

- [Claude: artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them): documents interactive tools, AI-powered apps, persistent storage, and connected-app capabilities. Do not claim that Ori is unique merely because an app can save information or use AI.
- [Lovable: introduction](https://docs.lovable.dev/introduction/welcome): documents building, iterating, and deploying applications, including backend/database capabilities. Do not describe it as a static mockup generator or imply it cannot revise apps.
- [Notion: AI connectors](https://www.notion.com/help/notion-ai-connectors) and [agent memories](https://www.notion.com/help/view-your-notion-agent-memories): support context and memory capabilities. Do not label broad workspace tools as context-free.

### Keep these distinctions out of the hero copy but correct in the work

- The 21/26 discovery result is founder-reported informal discovery, not measured adoption or retention.
- The existing deck labels its demo recordings as Sample mode with scripted responses. Use one compact accurate caption per clip; do not remove the distinction just to reduce text.
- The growth graph and dated outreach/enrollment numbers are goals.
- YC Summer 2027 is an application ambition.
- Pricing is proposed. The eight-week pilot can test initial engagement and introductory payment; the two-month introductory period means it does not by itself prove a full-price renewal cycle.
- Velocity's recommendations and adversarial cases are not automatically passed implementation tests.
- Shared context, explicit revision, automatic adaptation, and external workflow automation are different capabilities. Ground each on-slide claim in current code or real footage.

## 7. Implementation and acceptance checklist

Work in the actual current repository, not an assumed earlier snapshot. Inspect existing pitch files, assets, notes, source links, and media configuration before editing. Preserve unrelated user changes and product records.

1. Make a concise implementation plan and then execute it; do not stop at a plan.
2. Keep slide 1 substantially unchanged and preserve the successful five-stage transitions on slide 4.
3. Apply all 16 slide instructions, including the final ordering of slides 9 and 10.
4. Reuse canonical branding and relevant assets. Move useful explanations to notes/appendix rather than deleting every evidence trail.
5. Use real screenshots for unfilled media slots. Claude must not film or generate videos; Zuyu supplies them.
6. Inspect and correct the desktop presentation at 1600 × 900 and 1920 × 1080, plus a normal laptop viewport. Check overflow, clipped labels, competing hierarchy, chart/axis readability, contrast, and video sizing.
7. Check all 16 navigation states, direct scene links, overview entries, arrow keys, pause/replay/expand behavior, and reduced motion. Confirm 15 advances to 16 and 16 remains usable for Q&A.
8. Confirm slide 2 retains two meaningful findings; slide 3 has exactly two illustrative examples; slide 11 shows only the two requested pilot targets; slide 12 uses Goal; and slide 16 visibly contains only the exact signature line, QR, and contact details. Its QR/link target must be the correct root URL; the URL itself is not visible text.
9. Decode and scan the QR. Preserve its margin and aspect ratio. Confirm the account-creation destination is usable; report a real blocker if found rather than putting shared credentials into the deck.
10. Run the existing relevant build/checks. Do not create a new testing framework for a presentation pass.
11. Finish with a concise summary of changes, checks performed, any actual claim/media limitations, and the exact video-slot handoff for Zuyu. Do not invent successful tests or footage.

This handoff requests implementation of the pitch. Follow the repository's established preview/deployment workflow and existing authorization. It does not itself authorize a product redesign, database migration, new external integration, or new public sharing configuration.

## 8. Paste-ready system prompt for Claude

Act as Ori's senior pitch designer and frontend engineer. Revise the existing browser pitch in the current repository using the attached ORI_Pitch_Revision_Brief_for_Claude.md and qr-code (15).png. Read the brief fully, inspect the actual pitch implementation, and complete the changes rather than stopping at recommendations.

Preserve the Ori identity, successful opening, working navigation, and slide-4 transition style. Make the presentation much more visual and cut redundant explanations. The central story is feeling/intuition → Ori clarifies and shapes it → a useful personal app → continued context and revisions as the person grows. Slide 9 covers interests plus workflows; slide 10 is the competitor map. Finish with 16 slides. The final slide must contain only “Ori. Your phone, your story.”, the supplied QR code, and Zuyu's contact details. No Thank you, visible URL, or signup copy; the invitation to create an account belongs in speaker notes.

Zuyu will film all new demo videos. Do not generate or record videos. Build the media slots and playback layouts, reuse suitable existing clips, and use real screenshots as fallbacks. Complete the rest now, then provide a short shot list and exact asset-slot mapping so his recordings can be dropped in later.

Follow the slide-specific copy, dates, pricing, layout, and animation directions in the brief. Use canonical Ori assets. Keep evidence details in notes/appendix and retain only compact labels that materially affect interpretation. Make the competitor map specific and fair; distinguish verified behavior from product vision. Do not invent automatic account imports, background adaptation, automation, traction, partnerships, or competitor limitations.

Keep the main presentation around four minutes with two minutes for Q&A. Verify all 16 scenes, desktop fit, contrast, navigation, videos/fallbacks, reduced motion, chart labels, QR destination, and contact links. Preserve unrelated product functionality and user data. End with the implemented changes, actual validation results, and the remaining video handoff for Zuyu.
