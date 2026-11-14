# Reviewed implementation decisions

Review by the assistant, based on four actual Velocity research rounds and the supplied Build Plan / Redesign Brief. This is a proposed implementation guide, not verified behavior.

## Precedence

Original user direction and repository facts > final correction (04) > review addendum (03) > capability mapping (02) > initial routing (01). Adapt conceptual types to existing contracts. Do not paste partial patch notation such as viewsById or fieldsToAdd into an AppSpec validator as if it were a complete runtime schema.

## Product decisions

- Agent captures thoughts, links and images. Playground presents useful choices. My apps is the durable launcher.
- Route among save-only, exploration, use existing app, update design, new app, clarification and unsupported capability. Keep save-only and exploration real outcomes; don't force every inspiration into a new app or permanent interest.
- A record action and an AppSpec revision are different. Adding a People task or saving a Riff session should not create a new design revision. Opening an app is not a data mutation.
- Read-status describes actual source access. A displayed image was not necessarily analyzed; an unreadable video contributes only the URL and explicit note. Text-only captures never need fabricated links.
- Preserve concise reasons and source IDs, with uncertainty available in Why this? rather than dominating the main product UI.

## Distinct app compositions

| App | First screen | Real main action | Critical binding |
| --- | --- | --- | --- |
| Light | Editorial image gallery with observations | Upload/display image and/or save a nonblank observation | Image ref and observation field IDs; legacy text-only support |
| Riff | Large timer with practice controls and session history | Run/pause/resume a session and save measured elapsed time | Requested vs measured durations, notes, source refs |
| People | Person, next action, due state | Add task, mark done, conflict-safe status undo | Person, action, date, original wording, status |

Shell: #F7F8FC canvas, #162039 ink, #3147F2 action blue, #DFFF76 lime, #DBCBFF lilac, #FF6A3D orange. Manrope headings and DM Sans interface, with suitable licensed/system fallback. App styles may choose scoped allowlisted variants with checked contrast. No sparkle mark, brown/serif shell, identical universal-form layouts or dead primary buttons.

## Technical decisions and corrections

1. Preserve existing IDs, URLs, users, data, field semantics, owner checks, revisions, undo, export/import, install metadata, .env and configured model. Inspect real repo first.
2. Bind views explicitly to semantic fields, not field order or display labels. Validate all referenced IDs and operation/capability/field-type pairings at runtime.
3. Keep the working declarative capability runtime. No arbitrary executable AppSpec payload, unrestricted URL fetching, fake integrations or browser-held secrets.
4. New fields must not invalidate old records. Use nullable/version-gated additions or verified safe defaults; preserve unknown fields. Never fabricate old session targets, elapsed values or statuses from assumptions.
5. Do not reinterpret an existing duration field. Inspect its old meaning. Allocate new stable field IDs if the meanings differ. This explicitly rejects the original addendum's unsafe riff-duration remapping.
6. Timer default is a configurable number within bounds; 900 is an example. Target duration and measured active time differ. Use clock intervals, preserve pause state, reconcile background/reload honestly and save once per session ID.
7. Preserve original relative date wording. Resolve an ambiguous date with available user date/timezone context or clarification before recording a final date-only value. Avoid unnecessary timezone questions when the app already knows it.
8. Separate record-status undo from design undo. Record undo uses record revision/conflict checks. Design undo restores presentation without deleting or orphaning newer records/unknown fields; reject incompatible rollback with a concrete reason.
9. Proposal generation has no app/record write side effects. At selection and retry, recheck ownership, context deletion/version and target revision. Use transactional idempotency for confirmed writes.
10. Validate JSON at generation, acceptance and runtime boundaries. TypeScript alone is not validation. Test actual runtime risks and whole journeys, not only string types/CSS labels.

## Measures and demo judgment

Capture success includes saved-only outcomes. Useful-action activation requires a real exercise/session/task action and is reported separately from saves, previews and app creation. Active reuse on another day differs from passive reopening; prompted returns do not demonstrate organic retention. Use actual cohort denominators.

The three-minute demo should make the consumer benefit visible: an inspiration becomes practice tonight, a custom app stays useful, and its result survives reopening. Use an actual short session, never claim that 15 minutes elapsed during the demo. Show data/source caveats in the product when relevant and keep engineering preflight separate from the spoken story.

## Next implementation slice

Inspect repo → preserve baseline → implement proposal/action distinction and semantic view bindings → complete Riff with persistence → show Light/Riff structural contrast → validate revisions/owner boundaries → capture real screens for Prompt C. No product tests were run in this Velocity session.

