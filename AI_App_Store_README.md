# AI App Store

**A collection that grows with you.**

An AI app store that understands your life, recommends personal tools you might never have thought to build, and turns the ones you choose into working apps. Use it to automate recurring work, make progress on projects, and explore the interests that make your life yours.

**Your personal apps belong on your phone's home screen.** Create an app in the store, add its icon, and tap directly into that app whenever you need it. For the iOS prototype, use a home-screen web bookmark or web app. For Android, install an APK and pin direct shortcuts into individual personal apps.

Think **Pinterest for your own life, with tools you can actually use**. The inspiration becomes a photography journal, a relationship follow-up board, a music practice companion, or another app tailored to you. Each app joins a collection that evolves as your circumstances and interests change.

> **Status:** product vision and weekend build specification, November 14, 2026. This repository document describes the intended product; implementation, customer traction, pricing, and integrations remain to be validated. AI App Store is a working name. Installation instructions will be added with the implementation.

## Track and company positioning

| Question | Answer |
| --- | --- |
| Hackathon track | **Startup Track** |
| Kearney industry | **Technology** |
| Product form | Personal software with iOS home-screen web access and an Android APK |
| Startup category | Consumer AI; personal productivity and exploration |
| Customer relationship | B2C: an individual subscribes for personal use |
| Initial customer | AI power users juggling several projects and at least one active hobby |
| Revenue model | Full-product trial, introductory subscription discount, then recurring personal subscription |
| Long-term direction | A personal software collection informed by AI context, supported phone-app connections, and lived experience |

The organizer's deck explicitly includes Technology within the Startup Track and allows software products (pages 4 and 8). Consumer AI is our positioning within that industry, not an additional official track. Consumer and Retail is adjacent, but **Technology is the clearest submission category**. Kearney is the hackathon audience; the initial paying customer is the individual user.

## The vision

Your AI conversations contain ambitions, recurring frustrations, workflows, and interests. Your phone contains further clues about what you do and enjoy. With your permission, this product turns selected context into suggestions for software that belongs in your life.

The storefront includes apps that do not exist yet. A card explains why an app fits you, what it would do, and what information it needs. Choose **Build this for me**, add instructions, and open a usable app. Come back to the same collection to use it, change it, or discover something new.

Over time, the product should understand both the person you are and the person you want to become. Users can explicitly choose an emerging interest even when their previous activity does not suggest it. Exploration should expand possibilities, while personal automation removes repeated effort.

### One collection, two equally important purposes

| Purpose | Example | What makes it personal |
| --- | --- | --- |
| Get things done | Follow-up board for mentors and collaborators | Your relationship stages, commitments, and follow-up rhythm |
| Get things done | Study or project planner | Your milestones, available time, and preferred way of organizing work |
| Explore life | Photography field journal | The subjects you enjoy, your skill level, and the time you have |
| Explore life | Music practice companion | The instruments, songs, and practice habits you choose |
| Connect both | A weekend exploration board | Activities you want to try alongside the constraints of your week |

These are examples of apps the system could create, not separate businesses to build this weekend.

## Problems and product response

| Problem hypothesis | Product response | Evidence to seek |
| --- | --- | --- |
| People recognize a helpful app when shown one but struggle to specify it from scratch | Context-based recommendations with a reason for each suggestion | A user chooses a recommendation without extensive coaching |
| Advice and inspiration accumulate without turning into action | Convert a selected opportunity into a persistent tool with an immediate first action | The user records, completes, or organizes something real |
| Generic tools require repeated setup and do not fit personal routines | Generate fields, views, defaults, and workflows around the user's needs | The user prefers it to their current workaround |
| Interests change while personal tools become stale | Suggest revisions, preserve history, and let users archive or revive apps | A revised app is used again |
| Context is scattered across assistants and services | Start with reviewed context imports; add supported connections over time | Import feels useful and worth the effort |

The central assumption is **people will return to use the apps**, beyond enjoying the first generation. Interviews and usage must establish that.

## Core user journey

1. **Bring your context.** Copy the context-export prompt below into the AI conversations you choose. Paste or upload the resulting summaries. A short manual profile is an alternative.
2. **Review your portrait.** See goals, active projects, interests, routines, and uncertainties. Edit or remove anything before it shapes recommendations. Conflicting summaries remain visible until resolved.
3. **Browse For You.** Discover a visual mix of workflow and exploration cards. Each shows “Why this fits you,” a preview, and the context behind it.
4. **Make it yours.** Pick a card, add preferences, and review the proposed app. For example: “Make this a weekly photography challenge, with a place to record what I learned.”
5. **Build, add to home screen, and use.** The app appears in My Collection with its own URL and icon. On iOS, guide the user through Add to Home Screen. On Android, provide the APK and a shortcut into this app. Tapping that icon opens the app directly; its forms, boards, records, and rules actually work.
6. **Grow the collection.** Use or feedback can suggest an improvement. Accept a revision without losing earlier entries. Pin favorites, archive unused apps, or ask for a new direction.

### The hero demonstration

A user imports a summary mentioning startup networking and photography. The store recommends **People to Follow Up With**, **Photo Walk Journal**, and **Weekend Explorer**. They select the journal, request a weekly challenge and a reflection field, build it, and save an entry. They then ask for a “next experiment” field. The app updates and the existing entry remains.

Add the journal to the phone's home screen, leave the store, and tap the journal's icon. It opens the same journal with the saved entry. This direct return path is part of the core demonstration.

Next, open the follow-up board, add a commitment and due date, and show its due-soon view. This demonstrates both exploration and useful workflow behavior. Do not imply messages were sent or the app read a social account when those connections were not used.

## Weekend MVP

Build **one storefront containing small personal apps**, with a shared runtime and persistent records. Keep the broad vision visible in the product narrative while making this loop work end to end.

| Priority | Deliverable | Acceptance condition |
| --- | --- | --- |
| Must | Paste/upload `.txt`, `.md`, or `.json` context; manual fallback | User can review and correct the extracted profile |
| Must | Three grounded recommendation cards | At least one workflow and one exploration option; each cites imported evidence |
| Must | Natural-language customization | A request changes meaningful fields, views, or rules |
| Must | Generated app specification and working renderer | At least a board and a journal work; a tracker is the third reusable pattern |
| Must | My Collection and persistent app data | Saved entries survive a reload and an app revision |
| Must | Per-app URLs and iOS home-screen access | An icon opens the intended app; sign-in, if needed, returns to it with its data |
| Must, after the core web loop | Android APK with per-app pinned shortcuts | Build an installable test APK; verify direct launch and saved records on a supported device or emulator |
| Must | One simple workflow rule | Due-date filtering or a completed-item summary works on actual records |
| Must | One explicit improvement loop | Feedback produces a proposed revision; acceptance preserves data |
| Must | Explainable source and demo state | Imported, inferred, live, and sample information are distinguishable |
| Stretch | Portable app blueprint | Add after the complete loop and phone launch paths work |
| Later | Background notifications and external actions | Add with a real scheduler, permissions, and tested delivery |
| Later | Instagram, LinkedIn, other phone-app connections | Add only for data and actions the relevant integrations support |
| Later | Arbitrary generated code, third-party marketplace, separate APK per generated app, native iOS package | Expand after proving repeat usefulness |

In the weekend version, “Build” means generating a real app definition that an existing runtime can execute. The AI can change the app's data model and experience within supported components. Arbitrary software generation is a later capability. State that boundary plainly in the demo.

## How to build it

### Recommended implementation

- **Interface:** React and TypeScript; responsive layouts with For You, My Collection, and Your Context. Use a visual card grid with clear previews and an obvious first action.
- **AI boundary:** a server-side model adapter for context extraction, recommendations, and app specifications. Choose the available provider when implementation begins; never place credentials in client code.
- **App runtime:** a validated JSON specification rendered through reusable form, list, board, journal, and summary components. Use a narrow allowlist of field types, views, and actions.
- **Persistence and identity:** keep app definitions and records in a server-side store associated with the user. Reuse existing auth/database infrastructure; for a local build, a persistent SQLite-backed service is sufficient. Browser storage can cache data and support a clearly labeled local demo. Do not assume Safari, a home-screen web app, and an Android WebView share browser storage. Reauthentication must restore the same app and records. Retain JSON export/import as a recovery path.
- **Phone delivery:** every app has a stable `/apps/{appId}/` URL, display name, icon, and relevant web manifest. Deliver iOS through Add to Home Screen and Android through a Capacitor APK with user-approved pinned shortcuts into individual apps.
- **Evolution:** store specifications separately from records. Preserve stable field identifiers, create a new specification version, and support an undo to the preceding version.
- **Automation:** deterministic rules over app records, such as due-soon filters and weekly totals. The first release need not run unattended tasks in other apps.

The technical core is a small **context-to-app compiler**: selected evidence becomes a reviewed profile; the profile informs recommendations; a chosen recommendation becomes an executable app specification. The runtime handles rendering and data reliably.

### Home-screen delivery is a product feature

| Platform | Weekend implementation | What the user experiences |
| --- | --- | --- |
| iOS | Open the personal app's URL in Safari and use Share > Add to Home Screen; support web-app presentation where available | A named icon launches that specific app, with its saved data after any required sign-in |
| Android | Package the shared runtime as a Capacitor APK; request a pinned shortcut carrying a validated app ID | Install the APK once, then launch individual personal apps directly from their icons |
| Desktop | Direct app URLs and My Collection | Use and edit the same apps through the browser |

For iOS, supply a distinct manifest ID, app-specific start URL, appropriate scope, name, and icons. The installation flow is user initiated; do not imply the website can silently add an icon. Verify that two different icons launch two different apps rather than both opening the storefront. Include clear installation instructions and a copyable app link.

For Android, the first package is a shared app runtime. Its pinned shortcuts open the chosen personal app directly. This is an APK-based experience, not a claim that every generated app already has a separate Android package. Check launcher support and handle the user's shortcut confirmation. Keep the selected app ID through cold and warm launches, then authenticate and verify ownership before loading data. Separate per-app APK generation is a later packaging option.

Build the core web experience first, then produce a debug-signed test APK using the available Android toolchain. An APK source project is not a compiled APK, and a compiled APK is not a verified device installation. Report those states accurately. If the SDK or device is unavailable, finish the Android source and reproducible instructions while continuing the working web build; leave device validation explicitly pending.

### Main data objects

| Object | Essential fields | Purpose |
| --- | --- | --- |
| ContextSource | id, label, imported_at, text, user_approved | Track exactly what was provided |
| ProfileFact | id, value, source_ids, confidence, status | Separate confirmed facts, inferences, and unresolved conflicts |
| Recommendation | id, purpose, reason, evidence_ids, first_action | Explain why an app is worth creating |
| AppSpec | id, version, name, fields, views, rules, permissions | Define the usable app |
| AppRecord | id, app_id, field_values, created_at, updated_at | Preserve user work independently of presentation |
| AppEvent | app_id, event_type, time | Capture first use, return use, completion, and accepted revisions |

Minimal illustrative app definition:

```json
{
  "id": "photo-journal",
  "version": 1,
  "name": "Photo Walk Journal",
  "purpose": "explore",
  "fields": [
    {"id": "subject", "label": "What caught your eye?", "type": "text"},
    {"id": "reflection", "label": "What did you learn?", "type": "long_text"},
    {"id": "date", "label": "Date", "type": "date"}
  ],
  "views": [{"id": "entries", "type": "journal"}],
  "rules": [],
  "permissions": []
}
```

Adding a field is an additive revision with the same app ID. Keep old values if a field is hidden; do not silently discard them. For the weekend, decline unsupported transformations with an explanation and a supported alternative. Validate model output before changing any app.

### A 24-hour schedule

| Elapsed time | Work | Exit condition |
| --- | --- | --- |
| 0-2 hours | Three short user conversations; inspect Velocity; use it to pressure-test the customer, recommendations, and requirements | Agreed story, three demo app concepts, saved Velocity outputs |
| 2-5 hours | Build one journal runtime, stable app URL, identity/persistence, and a minimal iOS launch flow | A saved entry survives reopening the direct app link |
| 5-10 hours | Add import, editable profile, grounded recommendations, and spec generation | Context produces an app someone can actually use |
| 10-14 hours | Add board/tracker, versioned revision, collection, and workflow rule | Both purposes work; revisions preserve records |
| 14-17 hours | Package Android APK and pinned shortcuts; verify iOS home-screen launch | Direct phone launch reaches the correct saved app |
| 17-20 hours | Five user trials, mobile polish, recovery paths, and demo rehearsal | Resolve the largest observed failure |
| 20-24 hours | Pitch, backup recording, rest, and submission buffer | Submit before the organizer's deadline |

The supplied deck lists **Sunday submissions at 8:30 AM** and judging at 9:30 AM; it does not specify the timezone in its text. Treat these as event-local times and check any organizer updates. The 24-hour schedule is an allocation, not permission to build past the cutoff. If fewer hours remain, cut stretch features first.

### Velocity's concrete role

Use the provided Velocity workspace during development to examine the customer problem, refine product concepts, and produce requirements for the three demo apps. Feed those reviewed outputs into the build. Keep the prompts, exported results or screenshots, and the decisions they changed in the submission evidence.

Kearney describes Velocity as covering sensing, concept generation, simulation, building, and validation. Available hackathon access may differ. **Confirm the supplied capabilities in hour one.** The plan does not assume Velocity exposes a public runtime API. If it supports only interactive use, use it interactively and keep the live app's model adapter separate. Digital personas provide hypotheses; actual user feedback is still needed.

## Copyable context-export prompt

Give users this prompt to paste into each AI conversation they want to contribute. They should review the result before uploading it. Multiple summaries can be merged by the app after conflicts and stale information are surfaced.

```text
Help me create a portable context profile for a personal AI app store.
It will suggest tools for both my recurring workflows and my hobbies,
curiosity, and goals.

Use only information actually available in this conversation and memory
you are permitted to use. Do not claim to read other conversations,
accounts, apps, or my full history. If you know little about me, say so.
Keep information about other people separate from information about me.

Write a concise Markdown profile with these sections:
1. Goals I am actively pursuing.
2. Current projects, recurring responsibilities, and repeated friction.
3. Hobbies, interests, and things I want to explore or learn.
4. Routines, time constraints, and how I like to organize information.
5. Tools or systems I already use and what I like or dislike about them.
6. Recent changes that might make older information stale.
7. Uncertainties, contradictions, and questions I should resolve.

For each useful fact, label it Confirmed or Inferred, identify the
conversation/topic it came from, and include a date only if known.
Do not invent quotes, dates, preferences, problems, or sources.
Leave out passwords, API keys, account numbers, precise home addresses,
private information about others, and confidential employer/client data.
Use broad descriptions where those are sufficient.

Do not propose apps yet. Describe my needs and interests so the app store
can make its own recommendations. Keep the profile under 800 words.
End with a short list of items I should review before sharing it.
```

This is a user-mediated import, not a direct synchronization of another assistant's memory. It can work with whichever conversations the person chooses to supply. The manual profile keeps onboarding available to people with little existing AI history.

## Go-to-market

**Initial segment:** students, founders, and early-career builders who use AI frequently, juggle multiple projects, and maintain active personal interests. Start with people already feeling the burden of scattered tools and unfinished intentions. This is a recruitment hypothesis, not the eventual market boundary.

**First distribution advantage:** Zuyu's existing access to UIUC Founders and builder communities makes it possible to recruit early users directly. This is founder-led recruitment, not a claim of institutional partnership or endorsement.

| Stage | Action | What it tests |
| --- | --- | --- |
| Hackathon | Five observed sessions; each user brings a short profile and chooses one app | Does the recommendation feel personal, and can they use the result? |
| Weeks 1-2 | Invite 20 users from founder/student/AI communities; help each build one work tool and one interest tool | Which purpose produces repeat use? Where does onboarding fail? |
| Weeks 3-4 | Let users share a scrubbed app blueprint that friends personalize; demonstrate the context-export prompt in short videos | Does useful software bring the next user? |
| After retention evidence | Test creator communities and focused interest groups, then paid acquisition | Can a specific audience be acquired economically? |

Acquisition hook: **“See what apps your AI thinks you need.”** Follow it with a useful first action, not an endless feed. A shared blueprint should contain app structure and generic examples only, never private profile facts or records. Attribute signups and activations to the blueprint or channel that brought them.

## Business model

**A full-product trial followed by a subscription.** Give users enough time and freedom to create several apps and experience a collection that grows with them. The customer ultimately pays for continuing app creation and revision, reliable hosting and sync when offered, and ongoing automation. The conversion moment follows experience with useful personal routines.

| Plan hypothesis | Proposed allowance | Purpose |
| --- | --- | --- |
| Days 1-14: free full-product trial | All available product features, multiple app creation and revision, and no arbitrary one-app or active-app cap | Let users build a collection and use it across several real situations |
| Following two months: introductory price | Test $7.50/month, with the same product access | Give routines and app history time to develop before full-price renewal |
| Thereafter: Personal | Test $15/month for continued creation, evolution, and supported automation | Charge for sustained usefulness |
| Later expansion | Optional extra AI usage for unusually heavy users | Keep normal use generous while covering exceptional compute demand |

The trial structure follows the founder's preference; the dollar amounts are pricing-test hypotheses. Make the real trial end date, two discounted billing periods, and subsequent renewal price clear at signup. A genuine deadline can encourage users to build their collection early. Use onboarding milestones such as three personally useful apps, first saved actions, and return use to show what they can accomplish during the trial. Do not reset countdowns or imply a discount is ending when it is not.

Full access means access to all available product capabilities and freedom to create multiple apps. AI compute and external automation still need generous, clearly disclosed fair-use allowances, rate limits, and cost controls. Do not advertise unlimited generation if those limits exist. Set allowances from observed costs rather than choosing a small app count that undermines the product's promise. Failed validation should not consume a user's generation allowance. Ordinary data entry and viewing should not require a model call.

Track inference, hosting, storage, automation, support, and payment costs. A provisional target for compute plus hosting is below 30% of full-price subscription revenue ($4.50 at $15); this is a design target, not measured margin. Separately measure the cost of the free trial and discounted months against later contribution from retained customers. No payment integration is required for the weekend prototype. Users who do not subscribe should retain a way to view and export their records; further AI creation and premium actions can pause.

Measure trial-to-discount conversion, active use during both discounted months, and renewal at the full price. A high introductory conversion rate alone does not establish willingness to pay $15. The retention goal is a collection people repeatedly find useful, rather than simply a large number of generated apps.

A template marketplace or team edition could follow, but neither is needed to validate the first business. Do not rely on selling personal context or advertising as the initial revenue source.

## Competition and the advantage to test

Cyclon is a direct inspiration for adaptive personal computing and custom apps. Replit is a reference for AI-assisted app creation. Pinterest and Asana explain the discovery and organization experience, but the analogy is not evidence that our product is unique.

The proposed advantage is the combined loop: **understand the person, recommend what to build, deliver a usable app, and maintain it as the person changes**. Existing builders are credible substitutes and may add similar features. The initial differentiation must be demonstrated through better recommendations, easier first use, and repeated value. Over time, a user's permitted context, app history, and feedback could improve the experience; a durable moat is not yet established.

## Wider integration vision

| Stage | Context available | Product experience |
| --- | --- | --- |
| Weekend | User-reviewed AI summaries, manual notes, and in-app events | Personalized discovery and working apps without external account integration |
| Pilot | Repeated imports and selected user-shared links/content | Keep recommendations aligned with current interests |
| Connected product | Supported, authorized APIs and integrations | More timely suggestions and carefully scoped cross-app actions |
| Long-term | Broader phone and service context where access permits | A personal software environment that evolves with work, hobbies, and life changes |

Instagram, LinkedIn, and other social apps are part of this longer-term ambition. Access must be specific: Meta's documented Instagram Login API serves professional accounts and selected account-management functions; LinkedIn's standard OpenID Connect login supplies basic identity information. Neither should be described as a universal feed or browsing-history connection. Start with user-shared context while researching each future connector's actual capabilities.

Users should be able to inspect, correct, and remove imported context, choose which apps can use it, and export their own records. Present app changes for acceptance rather than silently replacing a familiar workflow. Keep new interests possible even when past behavior points elsewhere.

## Validation and demo readiness

**North-star outcome:** a person returns to complete meaningful actions in their collection. Opening the storefront, generating more apps, or scrolling cards alone does not establish value.

- Activation: import reviewed context, build an app, and save or complete a first real item.
- Relevance: user selects a recommendation and can explain why it fits.
- Retention: meaningful app use on another day and again in the following week.
- Evolution: an accepted revision leads to continued use without data loss.
- Business: users accept a real paid offer after trying the product; a compliment is not a sale.

For the first 20-person pilot, set provisional gates of 12 activations, eight users meaningfully using at least two apps during week two, and five starting the introductory paid plan after the trial. Track full-price renewal after the two discounted months as a separate test. These are internal decision thresholds, not market benchmarks or forecasts. If users create many apps but abandon them, investigate usefulness and maintenance before adding more integrations.

Before presenting, verify two contrasting profiles produce different grounded recommendations; malformed context fails gracefully; a newly created app saves data after refresh; additive revisions preserve records; unsupported requests explain their limits; one workflow rule works on real inputs; and the phone layout is usable. Test that two home-screen icons reach their respective apps, authentication preserves the requested route, and an Android shortcut opens the right app from both a cold and warm start. Record whether each check ran on a browser, emulator, or physical device. Back up the live demo with a recording of the same working flow.

## Pitch spine

1. **Observation:** people tell AI about their lives, but still have to discover, configure, and maintain useful personal tools themselves.
2. **Vision:** a collection that grows with you, supporting both what you need to do and what you want to explore.
3. **Demonstration:** context becomes a recommendation, then an app on your home screen, then a meaningful action and a data-preserving revision.
4. **Customer and distribution:** start with AI-heavy students and founders through communities we can reach directly.
5. **Business:** a 14-day full-product trial, two discounted months, then a personal subscription; validate repeat use, full-price renewal, and delivery costs.
6. **Expansion:** progressively connect supported services and build a richer personal software environment.
7. **Evidence:** describe exactly what users tried, what Velocity contributed, and what remains a hypothesis.

## References

Sources checked November 14, 2026. Product and API capabilities can change.

- Organizer-provided `OTCR.Overall_Presentation_V2.Kearney_Hackathon.pdf`: page 2 schedule, page 4 track definition, page 8 industry list.
- [Cyclon](https://cyclon.ai/): inspiration for an adaptive phone and user-created apps; not a product affiliation.
- [Replit mobile apps](https://replit.com/mobile-apps): reference for AI app creation and distribution workflows.
- [Kearney Velocity AI](https://www.kearney.com/web/product-excellence-and-renewal-lab/what-we-do/velocity-ai/): intended development partner and its publicly described product-development capabilities.
- [Meta Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login): documented account type and integration scope.
- [LinkedIn OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2): basic authentication and profile scope.
- [WebKit home-screen web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/): manifest identity and icons; [Safari 26 behavior](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/): user-controlled web-app presentation.
- [Capacitor Android](https://capacitorjs.com/docs/android): Android packaging for the shared runtime.
- [Android pinned shortcuts](https://developer.android.com/develop/ui/compose/system/shortcuts/creating-shortcuts): user-approved shortcuts to particular app content.

This project is an independent hackathon concept. Named products are references and analogies; no endorsement is implied.
