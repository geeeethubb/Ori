# Velocity run 4: 04_final_corrections

Date: 2026-11-14 (America/Chicago).
Source: https://kearney-perlab.growthsignals.com/research/id-1794674829478-0.d43a12a7b3c1c

Status: Actually submitted and completed in the user's Velocity workspace. Output copied using Velocity's Copy control. Generated design proposal; not app implementation or test results.

Precedence: 04 final corrections > 03 addendum > 02 B > 01 A. Earlier conflicting examples are preserved only for provenance.

## Exact submitted prompt

Final correction before handoff: Do not make the compatibility errors below in the accepted design.
- Never repurpose an existing field's meaning (your sentence making existing riff-duration explicitly mean elapsed is unsafe if its old meaning is unknown). Inspect legacy meaning first; add a new stable field ID for measured elapsed if needed. Do not overwrite historical durations.
- New required fields cannot invalidate legacy records: use additive nullable/version-gated fields or explicit safe defaults/backfill that preserve original unknown values. A new target duration must not be fabricated for historical sessions.
- defaultDurationSeconds must be numeric configurable within bounds; 900 is this example default, not a universal TypeScript literal constraint.
- Undo must preserve data independently of the older display schema.

Return the final accepted implementation DECISIONS in 10 bullets and a concise builder handoff, explicitly marking all earlier conflicting statements superseded. Include a precedence order (latest correction > addendum > B > A), one polished 45-second demo opening, and evidence requests for Prompt C. Do not generate more speculative features. Be precise: this conversation actually ran in Velocity, but it has not inspected code or executed product tests.

## Actual Velocity output

## Final accepted implementation decisions

**Precedence:** latest correction **>** contract addendum **>** Prompt B **>** Prompt A. Every earlier statement that conflicts with these decisions is superseded. This conversation ran in **Velocity**; it has not inspected repository code or executed product tests.

1. **Propose before writing.** Agent returns a validated proposal; opening an existing app, adding a record, and revising AppSpec are distinct outcomes. A mutation requires user selection and a fresh authorization/context check.
2. **Keep evidence separate from inference.** Captures may be `text`, `link`, or `upload`, with `saved_only`, `metadata_only`, `content_read`, or `unavailable` status. Displaying an image is not image analysis; an unreadable reel has no inferred contents. Saving an inspiration does not make it a permanent interest.
3. **Check support before build routing.** Unsupported requirements and material clarification have explicit outcomes. Do not imply social-content extraction, Spotify/Instagram sync, audio analysis, messaging, or calendar integration.
4. **Preserve identity and ownership.** Keep existing app URLs at `/apps/{appId}/`, app/record/field IDs, owner boundaries, records, revision history, and per-app install metadata. Validate owner-scoped media and action permissions at runtime.
5. **Do not reinterpret legacy fields.** Inspect the meaning of an existing field—including `riff-duration`—before mapping it. If measured elapsed time needs a field, allocate a **new stable ID**. Do not overwrite or relabel historical duration values.
6. **Make migration additive for old records.** New target-duration, elapsed, queue-status, and original-date fields must be nullable or version-gated unless a verified safe default applies. Do **not** fabricate a 900-second target for historical sessions or replace unknown legacy values.
7. **Configure sessions numerically.** `defaultDurationSeconds` is a configurable number validated within `minDurationSeconds` and `maxDurationSeconds`; **900 is Riff’s example default, not a universal type literal**. Measure elapsed active time from clock intervals, support pause/resume and background/reload reconciliation, and save once per session ID after confirmation.
8. **Bind views to semantic fields.** Light binds image and observation, permits nonblank text-only legacy records, and handles missing media. Riff binds requested and measured durations, notes, and source. People binds person, action, date-only due date, original date wording, and status; ambiguous “Thursday” remains unresolved until clarified.
9. **Separate design undo from data preservation.** Preview is read-only; Cancel writes nothing; Accept checks current revisions and additive compatibility. Design undo restores presentation without deleting or orphaning newer records or fields, **independently of what the older display schema shows**. Done/undo on a People record is a separate, revision-checked status transition.
10. **Use distinct, validated presentation—not executable specs.** The shared shell retains the brief’s authoritative tokens; allowlisted app accents, surfaces, typography, and compositions produce image-first Light, session/control-first Riff, and person/action-first People. Parse and validate AppSpec JSON at runtime, check contrast and bindings, and dispatch only allowlisted actions—never generated code.

### Concise builder handoff

Implement the proposal validator/router, semantic AppSpec bindings, owner-checked action dispatcher, additive data migration, session clock and idempotent save, queue date/status transitions, and specialized views. **First inspect v1 specs and stored records**, particularly duration semantics and existing undo behavior; adapt the migration to what is actually present. Use the 12 adversarial cases in the addendum as proposed acceptance criteria, not as claimed passes. Any older example assigning elapsed meaning to `riff-duration`, requiring new fields on legacy records, or typing the default as literal `900` is **superseded**.

**45-second demo opening:** “This is Personal AI Playground—a working name for a personal AI that turns everyday needs into apps made for you. Share a photo, and Light puts the image first so you can keep an observation. Bring a guitar inspiration, and Riff opens a practice session with the controls up front—without pretending it watched an unreadable video. Type ‘follow up with Maya,’ and People puts the person and next action first, using the queue you already have rather than creating another app. The Agent proposes; you choose what becomes part of My apps. Your sources can also simply stay saved.”

**Prompt C evidence request:** Provide the actual v1 AppSpec schema and representative stored records (including historical duration values), action/capability registry, migration and undo code, owner/media checks, and renderer components. Then provide real screens or a recorded walkthrough for Light, Riff, and People, plus observed results for preview/cancel/accept, timer background/reload and duplicate save, legacy text-only and missing media, ambiguous dates, cross-owner rejection, and design undo after a new record. **Real-screen evaluation remains pending** until that evidence is available.

