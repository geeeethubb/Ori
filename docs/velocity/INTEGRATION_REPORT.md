# Velocity integration report

Date: 2026-11-14. Repository state before this pass: commit `60f4c3a`. Integration: commit `a88d8e0` plus the review fixes listed in section 8.
Velocity inputs (actual workspace outputs, placed in this folder): `ACCEPTED_DECISIONS.md`, `04_final_corrections.md` (authoritative), `03_adversarial_review.md` (12 cases), `01`, `02` and `05` (provenance; superseded where they conflict).

**How this was done.** Eight readers mapped every accepted decision and adversarial case onto the code at `60f4c3a`, read-only, tracing each claim to a file and running throwaway scripts against the Sample adapter (138 items: 49 already met, 89 partial or gaps). Every gap below was then checked by reading the code before it was changed. Velocity's conceptual types (AppSpec v2, `viewsById`, `kind: "session"`, `duration_seconds`, an action registry) were mapped onto the existing v1 contract; **no schema version change and no data rewrite**. Migration `003_velocity.sql` only adds two nullable columns. The database was backed up first (`data/backups/app-20261114-150525-pre-velocity.db`, integrity ok).

**Legend.** *Before*: what the repository did at `60f4c3a`. *Gap*: a concrete failing scenario found in the code. *Now*: what this pass changed. *Evidence*: automated tests (file › test name), screens or logs that exist now. *Deferred*: not done, with the reason.

## 1. The 12 adversarial cases

Velocity proposed these as acceptance checks; none had been run. Each now has an automated end-to-end test in `tests/unit/velocity-cases.test.ts` (Sample mode, real HTTP routes, in-memory database). Live-model behaviour for cases 1, 3, 6, 7 and 11 is in the bounded smoke run (section 7).

| Case | Before (`60f4c3a`) | Gap | Now | Evidence |
| --- | --- | --- | --- | --- |
| 1. Save-only unreadable reel | Honest message, no content claims | Sample also offered "Make mine" on an unrelated app and an exploration quoting "Save this for later"; a variant ("I love fingerstyle blues…") stored an interest at reply time, and "Keep" said none was recorded | A passing save returns **keep only** (plus one question when only a link was shared) and learns nothing; **Keep removes anything learned from that share alone** (`forgetLearnedFrom`, memory sources now point at their capture); the live prompt routes passing saves the same way | velocity-cases › Case 1 (2 tests); live smoke case 1 |
| 2. 15-minute practice, no app | Riff preview at 15 from a template default | A 20-minute ask was previewed at 15; the Make page preselected 15 | Proposals carry `suggestedMinutes` (Sample and live); the Make page starts there and always offers it; the preview's first preset is the asked length; nothing is created before Make mine | velocity-cases › Case 2; sample-respond › guitar note (`suggestedMinutes`); browser journey (preset 15) |
| 3. Same need, Riff owned | No duplicate app | The reply proposed a **design change** ("Add this to Riff": rewritten prompts, a new "Clip" kind) for a need Riff already met; nothing offered to open Riff | New outcome **`use_app`**: opens Riff (`/apps/{id}/?from=…`), no revision; a shared link becomes **one** suggested entry, saved only when the person confirms it in Riff's own form, once (client id `use_<proposal>`); a design change is offered only for a length Riff lacks | velocity-cases › Case 3 (2 tests); redesign-api › "the demo note with Riff already made…"; live smoke case 3 |
| 4. Change Riff's design | Preview, accept and undo existed in Settings | A typed request ("Change my Riff layout…") got an exploration and a minutes question, with no route to a preview | A typed change naming an owned app becomes one `update_app` proposal carrying the person's sentence; preview writes nothing; accept writes one version; an unsupported layout is explained by the planner instead of guessed | velocity-cases › Case 4 |
| 5. Photo, no vision | Sample honestly says it cannot read images; live reads them and labels it | Make mine landed in an empty Light (the shared photo was lost); with Light owned, the agent offered a tags revision | **Make mine carries the shared photo** into the new app as its first entry (owner-checked, marked `origin: carried`); with Light owned, `use_app` opens "Add photo" with that photo; Sample says "image", not "screenshot" | velocity-cases › Case 5; velocity-cases › "Make mine carries the shared link…" |
| 6. Follow-up with People owned | — | The agent proposed **adding a Priority field** (a revision) and Maya was never recorded | `use_app` with a follow-up drafted by role (person, action); People opens its add form prefilled; one record, no version, nothing sent | velocity-cases › Cases 6 and 7; live smoke case 6 |
| 7. Ambiguous "Thursday" | No date was guessed | The words were lost; no clarification | The person's words are kept (`dueText`; new People apps store them in "When, in your words", older ones keep the note in "What we discussed"); the form **suggests** the next Thursday in the person's own calendar and says so, and nothing is stored until they save; the live designer may only default dates to "today" and the live agent is told never to resolve relative dates | velocity-cases › case 7; velocity-runtime › "words for when"; live smoke case 7 |
| 8. Duplicate accept / retry | Stale-preview check on Accept | Make mine twice made **two apps**; a retried Save session made **two records**; a retried share made **two captures and two model calls**; a retried Accept showed a false conflict; a retried Undo became a **redo** | Make mine is idempotent per proposal (`alreadyBuilt`); records and shares accept **client-minted ids** (a repeat returns the first, another owner's id gets a generic 400); Accept is idempotent per proposal (`alreadyApplied`) and marks it in the same transaction; Undo takes `expectedVersion`; auth is checked on every retry | velocity-cases › Case 8 (3 tests) |
| 9. Deleted context | Forgetting a share removed its proposals | A card whose cited memory was removed could still be drafted and **built from the cached preview**; Playground cards citing a forgotten share stayed | One selection guard on draft, build and update-preview returns `409 stale_proposal` (the Make page shows why and disables Make mine); forgetting a share also removes or stales the Playground cards it grounded and what was learned from it | velocity-cases › Case 9 |
| 10. Cross-owner app or media | 404 for foreign ids, 422 for foreign photos | — | Still met; the new inputs are covered too: client ids owned by someone else, another person's suggestion id, links or photos in drafts that the person did not share | velocity-cases › Case 10; api › "every app route answers 404…"; redesign-api › "every capture, media and proposal route answers 404…" |
| 11. Spotify / Instagram auto-sync | — | No way to say "not possible"; Sample even said the request "belongs" in Riff | Agent replies carry an **`unsupported`** list (stored with the reply, shown in the thread) naming each missing integration with what works instead; no card implies a sync; with Riff owned the alternative is "Save links by hand in Riff" | velocity-cases › Case 11; velocity-runtime › "unsupported integrations…"; live smoke case 11 |
| 12. Design undo after new records | Undo kept every record and value | Undo dropped the newer field's **definition** (its id could then be reused as another type, so "Blackbird" would read as a number), removed choices entries used, could strand entries in a removed view, ran on one tap with no explanation, and was never refused | **Data-safe undo** (`planUndo`): newer fields that hold values come back **hidden** (ids reserved, values intact, "show again" works); used choices stay; an undo that would leave entries reachable from no view is **refused with the reason**; Settings shows the plan before running it; re-adding a reserved id with another type is refused | velocity-cases › Case 12 (3 tests); api › "undo appends version 3…"; browser journey (undo plan + confirm) |

## 2. Accepted product decisions

| Decision | Before | Now | Evidence |
| --- | --- | --- | --- |
| P1. Agent captures; Playground offers choices; My apps is the launcher | Met | Unchanged | browser journey; `docs/screenshots/after/agent-*`, `playground-*`, `apps-*` |
| P2. Route among save-only, exploration, use existing app, update design, new app, clarification, unsupported | Four kinds plus an optional question | Seven outcomes: keep, explore, **use_app**, update_app (design only), new_app, the existing one-question clarify, and the **unsupported** list. Sample and live adapters, server guards, cards, Make page and runtime all understand `use_app` | velocity-cases (all); sample-respond (rewritten routing tests) |
| P3. A record action is not a revision; opening is not a data mutation | Opening wrote only `app_opened` and `last_opened_at` | Adding a session, follow-up or photo never creates a version anywhere (asserted in cases 3, 6 and the conflict test); opening still only records the event | velocity-cases › Cases 3, 6; "an edit made on an older copy…" (versions stay 1) |
| P4. Read status describes actual access | Met (review fixes at `60f4c3a`) | Unchanged | sample-respond › honesty tests; review-followups › read-status labels |
| P5. Concise reasons and source ids; uncertainty behind "Why this?" | Partly: filler cards cited unrelated facts as grounding | Filler ("a popular starting point…") cards are no longer padded into a set that matched something; a fallback app is offered only when it actually matched the share | sample-adapter › "grounds recommendations in recent captures…" |

## 3. Distinct app compositions

| App / part | Before | Now | Evidence |
| --- | --- | --- | --- |
| Light: image-first gallery with observations | Met (contact sheet, lightbox, real uploads, owner-only media) | Unchanged layout. A photo entry needs a photo or a written observation (blank entries refused; entries that were already blank stay editable). Editing an entry whose photo was deleted, or a legacy text-only entry, now works (edits send only changed keys) | velocity-cases › "a photo entry needs a photo or an observation…"; `light-*` screens |
| Riff: timer first, session history | Met (timer, presets, tempo helper, history) | **Plan and measurement apart**: new Riff apps bind "Planned minutes" and "Timed" (seconds the clock measured, empty for sessions typed in by hand); history shows "of 15 planned · timed 9:12" or "typed in"; existing Riff apps keep their fields and meaning | browser journey (planned 15, timed ≥ 1 s); velocity-runtime › practice clock |
| People: person and next action first | Met | "When, in your words" (new apps), explicit draft binding (no more label matching), **Undo** on "Marked done" checked against the latest saved copy | velocity-cases › "an edit made on an older copy…"; velocity-runtime › entry drafts |
| Shell tokens, fonts, no sparkle | Met (exact tokens; Manrope headings, DM Sans body) | Unchanged. Manrope on buttons is a deliberate expressive choice recorded in `docs/redesign-contract.md`. The dead ▶ inside card illustrations now opens the card's action | `landing-*`, `agent-*` screens |

## 4. Technical decisions (ACCEPTED 1–10, with the matching 04 decisions)

| Decision | Before | Gap | Now | Evidence |
| --- | --- | --- | --- | --- |
| 1. Preserve ids, URLs, users, data, field semantics, owner checks, revisions, undo, export/import, install metadata, `.env`, model (04 #4) | Met for ids and URLs | Undo freed field ids for reuse; import stored emptied entries and unchecked dates | Ids reserved across versions; import refuses entries it would empty, checks dates, and drops foreign photos from every version's photo fields; `.env` and the configured model untouched; backup before migration | velocity-cases › Case 12; review-followups › import |
| 2. Bind views to semantic fields; validate references and pairings at runtime (04 #8) | Bindings existed and were type-checked | A revision could hide the field a view is built around; one field could fill two roles (tempo written into minutes); "Copy draft" found its field by label | `viewRoles` (every role by explicit field id), `checkBindings` at generation, Make mine and every change (never at load, so stored apps keep loading); hiding a bound field is refused with the reason; queue draft and words-for-when are explicit bindings | revision › "refuses to hide a field a view is built around"; velocity-cases › "a view can never lose the field…" |
| 3. Declarative runtime; no executable payloads, unrestricted fetching, fake integrations or browser secrets | Met | — | Unchanged; drafts may carry only the person's own link and photo | velocity-cases › Case 10 |
| 4. New fields never invalidate old records; preserve unknown fields; fabricate nothing (04 #6) | Unknown keys were preserved | A newly required field blocked editing old entries; edits re-sent the whole stored entry | Edits send only changed keys and are validated as partial edits; change previews say "required for new entries only"; no backfill of targets or measurements | velocity-cases › Case 12 (edit keeps "Blackbird") |
| 5. Do not reinterpret an existing duration field (04 #5) | Met | — | `minutes` keeps its meaning ("Minutes played"); the plan and the measured seconds use **new** field ids in new apps only | fixtures; browser journey |
| 6. Timer default configurable; target vs measured; clock intervals; pause state; background and reload; save once per session (04 #7) | Configurable presets, clock-derived elapsed time | **The plan was saved as time played** when the timer never ran (and after a sub-second run); a preset tap or "Again" discarded measured time; a reload lost the session; a countdown that ended while away looked like full practice; one session could be saved twice | Untimed saves leave minutes empty for the person to type and say so; measured sessions save rounded minutes plus exact seconds and the plan; presets lock mid-session and discarding asks; the timer survives reloads (`aas_timer_*`), marks "finished at 8:42 PM while this page was closed" and asks for a check when the clock moved backwards; each timed session's id is its record id | velocity-runtime › practice clock (7 tests); browser journey (reload keeps the paused session; the form says what was measured) |
| 7. Keep relative date wording; clarify; date-only; no needless timezone question | No guess, nothing kept | See case 7 | See case 7 | velocity-cases › case 7 |
| 8. Separate record-status undo from design undo; conflict checks; data-safe design undo (04 #9) | Undo appended the previous spec; record edits were last-write-wins | See case 12; a stale device silently re-opened a "done" item | Data-safe design undo (case 12); record edits carry the copy they were made from and get `409` with the latest copy instead of overwriting; "Marked done" has an Undo that is a record change, never a design change | velocity-cases › Case 12 and "an edit made on an older copy…" |
| 9. Proposals have no write side effects; recheck ownership, context and revision at selection; idempotent confirmed writes (04 #1) | No writes before selection; ownership rechecked | See cases 8 and 9 | See cases 8 and 9 | velocity-cases › Cases 8, 9 |
| 10. Validate JSON at generation, acceptance and runtime; TypeScript is not validation (04 #10) | Specs validated at write time | Old proposal rows read by cast; live learned facts unchecked; offline copies rendered unparsed | Proposal rows parsed with defaults (never hidden); live facts kept only when their evidence quotes the person's note; agent `sourceCaptureIds` limited to the person's own shares; offline copies re-validated; binding checks at generation (the live designer retries on a binding problem), build and every change | velocity-cases; review-followups |
| 04 #2 / #3. Evidence apart from inference; check support before routing; never imply sync, extraction, audio analysis, messaging or calendars | Read status honest | No unsupported outcome; Instagram toast hinted at a signed-in path | `unsupported` list on replies; Sample detector names each service; live schema and prompt require it; Make mine still says a carried link's page was not read | velocity-cases › Cases 1, 11 |

## 5. Measures and demo judgment

| Item | Before | Now | Deferred |
| --- | --- | --- | --- |
| Capture success includes saved-only outcomes | Captures stored | Shares from the labelled example buttons are stored as examples (`is_example`), never as personal | Attempts that fail before saving are not logged (needs the study log) |
| Useful-action activation reported separately from saves, previews and app creation | `first_action_completed` fired for untimed saves | New `useful_action` event (timed session with seconds, photo kept, follow-up added or done, entry added from the agent); the first-action milestone counts **timed** sessions only; entries carried by Make mine are marked and never count | A read-only measures report over a copy of the database (cohort denominators, next-day reuse) is not written: no participants yet |
| Active reuse vs passive reopen; prompted vs organic | `app_opened` only | Unchanged | Needs the observed-study log (who was prompted); recorded as a founder task |
| Demo: real short session, never claim 15 minutes | The script could save "15 min" without playing | The product can no longer save the plan as played time; the demo script is rewritten around a short real session in the AI-native phone pass | — |

## 6. Where this repository deliberately adapts Velocity's proposal

| Velocity concept | Here | Why |
| --- | --- | --- |
| `use_existing_app`, `update_app_design`, `propose_new_app`, `suggest_exploration`, `keep_source` | `use_app`, `update_app`, `new_app`, `explore`, `keep` | Existing names kept; `use_app` is the one additive kind |
| `clarify` outcome | The reply's existing single `question`, plus the in-app date confirmation | A separate clarify card added nothing the question did not already do |
| `unsupported` outcome | A list on the reply (not a card) | It is information, not an action to click |
| Capture `text` / `link` / `upload`; `saved_only` / `content_read` | `note` / `link` / `image`; `not_read` / `read` | One-to-one mapping, existing data unchanged |
| `defaultDurationSeconds: 900`, min/max | First timer preset in minutes (1–180) | Same meaning; no migration of existing apps |
| `requestedDurationFieldId` / `elapsedDurationFieldId` | `targetMinutesFieldId` / `timedSecondsFieldId`, new field ids | Never reinterpret `minutes` (04 #5) |
| Queue `status: pending | done`, record revision | The existing done checkbox or stage, plus `updatedAt` as the record revision | Existing People data needs no backfill |
| `dueOriginalTextFieldId` | `dueTextFieldId` | Same role |
| AppSpec v2, `viewsById`, action registry | AppSpec v1 views with explicit role bindings, `viewRoles`, `checkBindings` | v1 already binds roles by id; a v2 migration would rewrite every stored app for no user benefit |
| "Clarify before setting the due date" in conversation | The app's form shows the person's words and a suggested date to confirm by saving | The person confirms in the place the entry lives; the conversation never stores a date |

## 7. Live model check (bounded)

One bounded run of `server/scripts/velocity-live-smoke.ts` on 2026-11-14 at 23:04 UTC: five calls to the configured model (`claude-opus-5-5`), straight to the adapter, with no database and no app writes. Full output: `docs/velocity/evidence/live-smoke-2026-11-14.txt` (it contains no key). **15 of 15 checks passed.** The code state was `a88d8e0` plus the routing review fixes in the working tree. The live adapter's prompts were not changed after this run.

| Call | What came back | Velocity case / decision | Latency |
| --- | --- | --- | --- |
| Guitar note + unread Instagram reel, Riff owned | `use_app` → Riff, with a `source` draft holding the reel URL, plus one exploration; no new app, no design change. "I couldn't open or watch the reel, so I'm working only from your note." | Case 3; use the app you have; honest read status | 105.2 s (the first call of the run; see note) |
| "Follow up with Maya on Thursday about the proposal", People owned | `use_app` → People with a `follow_up` draft: person Maya, action "Follow up about the proposal", `dueText` "Thursday"; no date guessed | Cases 6 and 7 | 5.8 s |
| "Auto-sync Spotify and Instagram into Riff", Riff owned | `unsupported`: both syncs named; a manual alternative (paste links into Riff by hand); no design change | Case 11 | 6.3 s |
| "Save this for later" + unread reel, no apps | `keep` only; nothing learned | Case 1; a save stays a save | 5.3 s |
| Designer: a 20-minute practice app | Valid definition; bindings sound; timer starts at 20; `minutes_played` has no default; plan (`planned_minutes`) and measurement (`timed_seconds`) bound separately | Decisions 4 and 5 (plan vs measured) | 21.2 s |

Note on latency: the first call took 105 s while the other four took 5 to 21 s. The script does not log retries, so whether that was a slow first response or an adapter retry is not known from this run. Live mode can therefore be slow on a first share; the demo plan uses Sample mode, labelled, for timed segments.

## 8. Checks run for this pass

See `docs/TEST_RESULTS.md` section 7 for counts and environments; this list names what was run.

## 9. Deferred, with reasons

- **Threaded answers to the agent's question.** An answer is a new share without a link to the question. Low impact for the demo; needs a reply-to field on captures.
- **A Riff session pointing at its saved source.** Sources stay in Inspiration; a per-session source picker is a new interaction, not a correctness gap.
- **A text-only observation in the reference Light.** Its photo field is required by design; legacy text-only entries stay readable and editable.
- **A measures report and the study log.** No participants yet; the events it needs now exist.
- **Physical iPhone and Android checks.** No device is attached here; pending until observed.
- **Prompt C itself.** Prepared, not run: it has to be submitted in the Velocity workspace with the assembled evidence (see `PROMPT_C_PENDING.md`).
