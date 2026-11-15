# Velocity run 3: 03_adversarial_review

Date: 2026-11-14 (America/Chicago).
Source (Kearney Velocity; may require workspace access): https://kearney-perlab.growthsignals.com/research/id-1794674829478-0.d43a12a7b3c1c

Status: Actually submitted and completed in the user's Velocity workspace. Output copied using Velocity's Copy control. Generated design proposal; not app implementation or test results.

Precedence: 04 final corrections > 03 addendum > 02 B > 01 A. Earlier conflicting examples are preserved only for provenance.

## Exact submitted prompt

Implementation-readiness review: fix the gaps rather than passing the current examples as complete.

Your B output correctly admitted two missing pieces: numeric timer configuration and queue status/undo. Also its fixed color literals/fonts prevent app-level Studio Pop expression and its view.fieldIds arrays do not explicitly bind semantic roles (which field is the photo vs the observation, person vs action).

Return a corrected compact contract ADDENDUM (only replacement types/config and necessary JSON patches for Light/Riff/People):
- session config: defaultDurationSeconds:900, allowed min/max, explicit duration/notes/source bindings; elapsed time versus requested duration; pause/resume; page-background/reload semantics; exactly-once save. Use elapsed clock logic rather than counting ticks. State what needs implementation.
- queue config: person/action/due/status field bindings; record revision; done/undo scope, previous state and conflict behavior; pending date clarification preserves original "Thursday", timezone/date-only semantics. No messaging.
- gallery config: explicit image/observation binding, text-only legacy handling; don't allow blank records; authorized media and missing/deleted media states.
- scoped design: shell tokens remain authoritative but each app may override allowlisted typography, accent and surface tokens with contrast checks. Choose a concrete different composition for each; don't recolor the same template.
- preview acceptance/rollback: stable field IDs, additive migrations; restoring an old design cannot orphan or delete new records or unknown fields.
- typed operation/capability/semantic-binding checks and separate runtime vs schema validation; no claim that TypeScript alone validates runtime data.

Then adversarially evaluate your final proposed routing behavior on 12 cases in a table with case ID, exact input, expected outcome/action, must-not-happen, and reproducible acceptance check:
(1) save-only unreadable guitar reel; (2) explicit 15-minute recurring practice with no app; (3) same need with existing Riff; (4) change Riff visual design; (5) image upload with no vision analysis; (6) follow-up text-only capture; (7) ambiguous date; (8) duplicate accept/retry; (9) deleted context; (10) cross-owner app/media; (11) unsupported Spotify/Instagram auto-sync; (12) design undo after new records.

Evidence level: this is a design evaluation of the prompts, not a real app test. No actual repo/screens/test results have been provided. Give the five highest-priority implementation tasks and their exit checks. Keep the actual Prompt C real-screen evaluation explicitly pending.

## Actual Velocity output

# Contract addendum — design proposal, not implementation evidence

This replaces the incomplete session, queue, gallery, and design portions of Prompt B. The examples below are **patches to the fictional AppSpecs**, not complete standalone specs. No repository, screen, runtime, or test result has been supplied.

## 1. Replacement contract

Keep stable `appId`, `recordTypeId`, field IDs, record IDs, `/apps/{appId}/`, and per-app install metadata. View configuration supplies **semantic bindings**; field order is not a binding.

    type FieldId = string;
    type ActionId = string;

    type GalleryConfig = {
      imageFieldId: FieldId;          // media_ref
      observationFieldId: FieldId;    // text
      legacyTextOnly: "show_observation_without_image";
      emptyRecord: "reject";         // require image or nonblank observation
      missingMedia: "show_unavailable_state"; // retain record and observation
    };

    type SessionConfig = {
      defaultDurationSeconds: 900;
      minDurationSeconds: number;
      maxDurationSeconds: number;
      bindings: {
        requestedDurationFieldId: FieldId; // duration_seconds
        elapsedDurationFieldId: FieldId;   // duration_seconds
        notesFieldId: FieldId;             // text
        sourceFieldId: FieldId;            // source_ref
      };
      clock: "monotonic_elapsed_while_active";
      background: "continue_if_clock_valid_else_pause_for_review";
      reload: "restore_session_and_reconcile_clock";
      save: "confirmed_once_per_session_id";
    };

    type QueueConfig = {
      bindings: {
        personFieldId: FieldId;       // text
        actionFieldId: FieldId;       // text
        dueDateFieldId: FieldId;      // date, YYYY-MM-DD or absent
        dueOriginalTextFieldId: FieldId; // text; retains e.g. "Thursday"
        statusFieldId: FieldId;       // status: pending | done
      };
      date: "date_only_in_user_timezone";
      ambiguousDate: "clarify_before_setting_due_date";
      doneUndo: "last_status_transition_on_same_record";
      conflict: "reject_and_refresh";
    };

    type ConfiguredView =
      | { id: string; kind: "gallery"; config: GalleryConfig }
      | { id: string; kind: "session"; config: SessionConfig }
      | { id: string; kind: "queue"; config: QueueConfig }
      | { id: string; kind: "history" };

    type AppDesign = {
      layout: "image_first" | "session_first" | "person_action_first";
      composition: "editorial_gallery" | "practice_console" | "action_list";
      density: "comfortable";
      typography: {
        heading: "Manrope" | "DM Sans" | "system_sans";
        interface: "DM Sans" | "system_sans";
      };
      accent: "action_blue" | "studio_orange" | "lilac" | "lime";
      surface: "canvas" | "white" | "tinted_lilac" | "tinted_lime";
      hierarchy: string[];           // existing view IDs
    };

    type OperationCapability = {
      upload_image: "image_gallery";
      create_record: "record_form";
      add_source: "source_links";
      start_timer: "session_timer";
      pause_timer: "session_timer";
      resume_timer: "session_timer";
      reset_timer: "session_timer";
      save_session: "record_form";
      add_next_action: "next_action_queue";
      mark_done: "next_action_queue";
      undo_last_status: "next_action_queue";
    };

`status` is an added field type; its allowed values are `pending | done`. **Record revision, session ID, active/paused timestamps, idempotency key, and status-transition history are runtime data**, not user-editable AppSpec fields. The timer’s requested duration is the target; elapsed duration is measured work, never inferred from the target.

The shell retains authoritative canvas `#F7F8FC`, ink `#162039`, action blue `#3147F2`, lime `#DFFF76`, lilac `#DBCBFF`, and studio orange `#FF6A3D`. App design selects **allowlisted token roles**, not arbitrary colors. A renderer must check actual text/control contrast for each foreground/surface pairing and fall back to an accessible combination. Body text targets about 16px and controls comfortable touch sizes. Do not silently substitute an unlicensed font.

**Two validation layers are required:**

- **Schema validation at ingestion and revision acceptance:** parse untrusted JSON at runtime; reject unknown capability/operation pairs, missing or wrongly typed semantic fields, duplicate IDs, dangling view/action references, unsupported token choices, and invalid timer bounds (`min ≤ 900 ≤ max`). TypeScript types alone do not validate JSON.
- **Runtime validation at every action:** recheck authenticated owner, app/record/media access, action allowlist, current spec and record revisions, input values, and idempotency key. Never execute AppSpec content as code or expose secrets to the browser.

## 2. Necessary patches to the fictional examples

These are merge-style patches: **add or replace the named properties while retaining all other Prompt B properties and stable IDs**. Newly introduced field IDs are fictional.

**Light — editorial image composition.** The image occupies the leading area; observation entry and a text-only history are distinct, rather than identical cards.

    {
      "design": {
        "layout": "image_first",
        "composition": "editorial_gallery",
        "typography": {"heading":"Manrope","interface":"DM Sans"},
        "accent": "studio_orange",
        "surface": "white"
      },
      "viewsById": {
        "light-gallery": {
          "config": {
            "imageFieldId":"light-photo",
            "observationFieldId":"light-observation",
            "legacyTextOnly":"show_observation_without_image",
            "emptyRecord":"reject",
            "missingMedia":"show_unavailable_state"
          }
        }
      }
    }

`viewsById` identifies the existing view to patch; it is **not** a new AppSpec property. `light-save` must require at least one authorized image reference or nonblank observation. An absent/deleted image produces an unavailable-media state without discarding its observation. Displaying an image is not evidence of image analysis.

**Riff — practice console.** Add the requested-duration field without changing the existing `riff-duration` ID, whose binding now explicitly means *elapsed* duration.

    {
      "data": {
        "fieldsToAdd": [
          {"id":"riff-requested","key":"requestedDurationSeconds",
           "type":"duration_seconds","required":true}
        ]
      },
      "design": {
        "layout":"session_first",
        "composition":"practice_console",
        "typography":{"heading":"Manrope","interface":"DM Sans"},
        "accent":"lime",
        "surface":"canvas"
      },
      "viewsById": {
        "riff-session": {
          "config": {
            "defaultDurationSeconds":900,
            "minDurationSeconds":60,
            "maxDurationSeconds":3600,
            "bindings": {
              "requestedDurationFieldId":"riff-requested",
              "elapsedDurationFieldId":"riff-duration",
              "notesFieldId":"riff-notes",
              "sourceFieldId":"riff-source"
            },
            "clock":"monotonic_elapsed_while_active",
            "background":"continue_if_clock_valid_else_pause_for_review",
            "reload":"restore_session_and_reconcile_clock",
            "save":"confirmed_once_per_session_id"
          },
          "actionIdsToAdd":["riff-resume","riff-save-session"]
        }
      },
      "actionsToAdd":[
        {"id":"riff-resume","capability":"session_timer","operation":"resume_timer"},
        {"id":"riff-save-session","capability":"record_form",
         "operation":"save_session",
         "fieldIds":["riff-requested","riff-duration","riff-notes","riff-source"]}
      ]
    }

Replace the previous `riff-save`/`create_record` session-save binding with `riff-save-session` rather than exposing both as ways to save the same session. **Implementation needed:** persist/recover session state and a stable session ID; calculate elapsed time from clock intervals rather than incrementing timer ticks; reconcile background/reload intervals using a valid clock anchor, otherwise pause and ask the user to review elapsed time. Pause excludes paused intervals; resume starts a new active interval. A unique `(owner, app, sessionId)` save key and transactional idempotency make repeated confirmation one history record. Saving stores actual elapsed seconds even when it differs from the 900-second target. No audio analysis or tempo helper is implied.

**People — action list.** Lead each row with the person and verb/action, with due state visibly secondary.

    {
      "data": {
        "fieldsToAdd": [
          {"id":"people-due-original","key":"dueOriginalText",
           "type":"text","required":false},
          {"id":"people-status","key":"status",
           "type":"status","required":true}
        ]
      },
      "design": {
        "layout":"person_action_first",
        "composition":"action_list",
        "typography":{"heading":"DM Sans","interface":"DM Sans"},
        "accent":"action_blue",
        "surface":"tinted_lilac"
      },
      "viewsById": {
        "people-queue": {
          "fieldIdsToAdd":["people-due-original","people-status"],
          "config": {
            "bindings": {
              "personFieldId":"people-person",
              "actionFieldId":"people-action",
              "dueDateFieldId":"people-due",
              "dueOriginalTextFieldId":"people-due-original",
              "statusFieldId":"people-status"
            },
            "date":"date_only_in_user_timezone",
            "ambiguousDate":"clarify_before_setting_due_date",
            "doneUndo":"last_status_transition_on_same_record",
            "conflict":"reject_and_refresh"
          }
        }
      },
      "actionFieldIdsToAdd": {
        "people-add":["people-due-original","people-status"]
      }
    }

**Implementation needed:** an additive default of `pending` for existing queue records, record revisions, and a stored status transition containing previous status and resulting revision. `mark_done` conditionally writes `pending → done` against the current record revision. `undo_last_status` applies only to that record’s latest eligible status transition; if the record changed meanwhile, reject and refresh rather than overwrite. “Thursday” remains in `dueOriginalText`; resolve `dueDate` only after clarification supplies an unambiguous date in the user’s timezone. Store a date-only `YYYY-MM-DD`, not a UTC instant. No messaging or calendar action exists.

## 3. Preview, acceptance, and rollback invariant

A design preview is read-only. **Cancel** writes nothing; **Accept** rechecks owner, current spec revision, and migration compatibility, then commits the new design and any additive fields. New fields receive new IDs; existing IDs are never repurposed. Design undo restores an earlier presentation/spec revision **without deleting records or orphaning fields introduced afterward**: preserve unknown-to-that-revision fields in a compatible data-schema envelope, and reject an undo if the older view/runtime cannot safely render the retained data. Record-status undo is independent of design undo. The app URL and per-app install metadata remain attached to the same app ID.

## 4. Adversarial routing evaluation

The following are **proposed reproducible acceptance checks**, not observed test results. Assume user `u1` owns named items unless the input says otherwise; `c1` is the current context version.

| ID | Exact input | Expected outcome / action | Must not happen | Reproducible acceptance check |
|---|---|---|---|---|
| 1 | `u1`, note “Save this for later,” guitar reel `g1` `kind=link, readStatus=unavailable`, no app, context `c1` | `keep_source` / view saved `g1` and note | Describe reel contents; create app or interest | Supply only URL and note; assert output has no content claims or build action. |
| 2 | `u1`, text capture `t2`: “I want a 15-minute guitar practice every day,” no suitable app, `c1` | `propose_new_app` / preview session-first Riff-like spec | Claim the user practised or create app before selection | Assert 900-second configured preview and zero writes before accept. |
| 3 | Same `t2`; authorized Riff `app-r`, revision `r4`, supports session timer and history | `use_existing_app` / open its session; confirm any record save separately | Duplicate Riff or revise AppSpec | Assert target `app-r`, no spec revision, no history record until save. |
| 4 | `u1`: “Change my Riff layout to a practice console”; `app-r`, `r4`, `c1` | `update_app_design` / revision preview | Treat as practice record; mutate on preview | Assert accept changes design revision only; cancel leaves `r4`. |
| 5 | `u1`, upload `p1` `kind=upload, readStatus=metadata_only`; note “Let me log observations about this photo”; no suitable app | `propose_new_app` / image-first Light preview | Claim image subject or vision analysis | Render authorized image and observation binding; assert no generated image description. |
| 6 | `u1`, text capture `f1`, `content_read`: “Follow up with Maya about the proposal”; owned People `app-p`, `r2` | `use_existing_app` / preview adding Maya/action record | Invent link; revise design; send message | Confirm once; assert one record, unchanged AppSpec revision, no outbound action. |
| 7 | `u1`, text `f2`: “Follow up with Maya Thursday”; owned People; date reference/timezone not supplied | `clarify` / ask which calendar date and timezone; retain “Thursday” | Store guessed `dueDate` or lose original words | Assert `dueOriginalText="Thursday"` in pending draft and no resolved date/write. |
| 8 | `u1` accepts the same `f1` add twice with key `k8`, current owned `app-p` | First accept writes once; retry returns same result **after authorization/context recheck** | Two records or bypass newly revoked access | Assert one record; revoke access before a later retry and assert rejection. |
| 9 | Proposal from `c1`; user deletes context; current version `c2`; accept references `c1` | Reject stale selection / recompute from `c2` | Restore deleted context or apply cached proposal | Delete context between preview and accept; assert no write and fresh-context response. |
| 10 | `u1` supplies `app-other` owned by `u2`, or `u2`’s media ref `m-other` | Reject authorization / generic unavailable response | Reveal other-owner metadata or display media | Test both IDs; assert no payload details, media bytes, or writes. |
| 11 | `u1`: “Auto-sync my Spotify and Instagram into Riff”; only stated allowlist available | `unsupported` / name both missing integrations; optionally offer manual source saving separately | Pretend sync or extraction works | Assert unsupported requirements list and no integration action/spec binding. |
| 12 | `u1` accepts design revision `r5`; creates record with new field `new-x`; requests design undo to `r4` | `update_app_design` selection / compatibility-checked undo preview, then accept or explicit rejection | Delete record or silently discard `new-x` | Create record, attempt undo; assert record and field value survive, or undo is blocked with reason. |

## 5. Highest-priority implementation tasks and exit checks

1. **Runtime proposal/AppSpec validators and routing.** Exit: untrusted JSON is parsed and rejects unsupported operation–capability pairs, mismatched semantic field types, stale context, and cross-owner IDs; cases 1–7 and 11 route as specified.
2. **Owner-scoped action dispatcher and idempotent writes.** Exit: authorization is rechecked on retries; duplicate acceptance yields one record; foreign app/media references disclose nothing (cases 8–10).
3. **Session runtime and history persistence.** Exit: 900-second target is distinct from measured elapsed time; pause/resume, background/reload reconciliation, and repeated saves meet case 2–3 checks without tick-count drift.
4. **Queue date and reversible status model.** Exit: ambiguous “Thursday” remains original text until clarified; date-only timezone semantics, conditional record revisions, done, and conflict-safe undo are exercised.
5. **Specialized views and safe design revisions.** Exit: Light, Riff, and People have visibly different image/session/person-first compositions; legacy text-only records and missing media render; preview/cancel/accept and case 12 preserve IDs, records, URL, and install metadata.

**Prompt C real-screen evaluation remains pending.** It needs actual repository artifacts or screenshots and observed behavior; this addendum does not substitute for those observations.

