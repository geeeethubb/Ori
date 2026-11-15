# Velocity run 2: 02_capability_and_design

Date: 2026-11-14 (America/Chicago).
Source (Kearney Velocity; may require workspace access): https://kearney-perlab.growthsignals.com/research/id-1794674829478-0.d43a12a7b3c1c

Status: Actually submitted and completed in the user's Velocity workspace. Output copied using Velocity's Copy control. Generated design proposal; not app implementation or test results.

Precedence: 04 final corrections > 03 addendum > 02 B > 01 A. Earlier conflicting examples are preserved only for provenance.

## Exact submitted prompt

BUILD PLAN PROMPT B — capability and design mapping, plus corrections to Prompt A.

First repair three issues in the initial proposal contract:
1. Support text-only captures as kind "text"; don't invent a link in the follow-up fixture. Read status must distinguish saved_only / metadata_only / content_read / unavailable as appropriate and never imply that an image was analyzed simply because it displays.
2. Check capability support before routing to a build. Represent unsupported requirements/clarification explicitly in the contract rather than an untyped "No build proposal".
3. Distinguish use_existing_app (perform/add a record with user confirmation where needed) from update_app_design (revision of AppSpec). Adding a follow-up task must not unnecessarily revise app design. Cached retries must recheck current authorization/deleted context.

Then: Review our conceptual app-generation contract and propose a maintainable mapping from user outcome to capability, view structure, and design. Photography must be image-first; music must be session/control-first; follow-up must be person/action-first. Shared data and auth should remain reusable. Identify where one generic form renderer prevents the desired result. Return a concrete contract/schema proposal, three worked app specifications, and validation cases. Label anything that requires an unavailable integration.

Authoritative visual tokens from the November 14 Redesign Brief:
canvas #F7F8FC; ink #162039; action blue #3147F2; lime #DFFF76; lilac #DBCBFF; studio orange #FF6A3D. Manrope headings, DM Sans interface or licensed/system fallback. Body text about 16px, accessible contrast, comfortable touch targets. No generic sparkle logo, serif/brown shell, excessive metadata pills, or repeated identical app cards. Name undecided; use Personal AI Playground only as a working label.

Proposed AppSpec must cover schemaVersion, identity, stable data/field IDs, design (layout/type/color/density/hierarchy), views, allowed actions bound to supported capability IDs, and owner-scoped media references. Capability runtime is allowlisted/declarative, not arbitrary executable code.

Return concise but implementable TypeScript types and three valid JSON AppSpec examples (fictional IDs clearly labeled):
- Light: actual photo upload/display gallery + observation; preserve legacy text-only records.
- Riff: saved inspiration links + 15-minute session timer + save/reload practice history. Tempo helper explicitly optional/unavailable unless verified; no auto audio analysis.
- People: person/action-first next-action queue with due-date clarity, mark done and undo; no automatic messaging or calendar integration.

Include existing v1 AppSpec compatibility, additive migration, accept/cancel revision preview, undo that restores design without deleting new records, stable URLs /apps/{appId}/, per-app install metadata. Give concrete renderer component responsibilities, actual action bindings and meaningful acceptance cases. Do not claim implementation, repository access, tested behavior or physical phone verification.

## Actual Velocity output

# Personal AI Playground — proposed contract and renderer mapping

**Status:** Product-design and implementation proposal only. The repository, v1 schema, runtime adapters, and device behavior have not been inspected or tested. “Personal AI Playground” remains a working label.

## 1. Repair the proposal boundary

A proposal is not an AppSpec and has no write side effects. In particular, a task typed by the user is a `text` capture—not a fabricated link.

    type Capture = {
      id: string;
      kind: "text" | "link" | "upload";
      readStatus: "saved_only" | "metadata_only" | "content_read" | "unavailable";
    };

    type ProposalBase = {
      evidence: { explicitNote: string; captures: Capture[] };
      inference: { shortReason: string };
      sourceIds: string[];              // owned capture IDs; may include a text capture
      contextVersion: string;
    };

    type Proposal = ProposalBase & (
      | { outcome: "keep_source"; firstAction: "view_capture" }
      | { outcome: "suggest_exploration"; firstAction: "open_temporary_exploration" }
      | { outcome: "use_existing_app"; appId: string;
          appRevision: string; firstAction: "preview_record_action" }
      | { outcome: "update_app_design"; appId: string;
          appRevision: string; firstAction: "preview_spec_revision" }
      | { outcome: "propose_new_app"; firstAction: "preview_new_spec" }
      | { outcome: "clarify"; firstAction: "ask_question";
          question: string }
      | { outcome: "unsupported"; firstAction: "explain_capability_gap";
          unsupportedRequirements: string[] }
    );

**Routing order:** validate ownership and current context → separate the note from readable source evidence → check required capabilities against the allowlist → clarify material ambiguity or report unsupported requirements → prefer `use_existing_app` for an action its current design supports → use `update_app_design` only when the AppSpec must change → otherwise offer an exploration or new-app preview. Saving a capture never establishes a permanent interest.

`content_read` means content was actually available to the relevant reader; displaying an uploaded image does **not** establish that it was analyzed. An inaccessible video stays `unavailable` or `saved_only`, as appropriate. A cached proposal may be returned on retry only **after** rechecking authentication, ownership, deleted context, and target revision. Selection must also perform those checks and use an idempotency key.

**Corrected follow-up fixture:** A capture `{id:"cap-followup-text",kind:"text",readStatus:"content_read"}` contains the user’s explicit “Follow up with Maya about the proposal on Thursday.” If an owned queue already supports adding tasks, the outcome is `use_existing_app`, first action `preview_record_action`. Confirming it adds a record; it does **not** revise AppSpec.

## 2. Outcome → capability → presentation

| User outcome | Capability binding | Primary view and hierarchy |
|---|---|---|
| Photograph and annotate | `image_gallery` + `record_form` | **Image-first:** large gallery/image, then observation entry; older text-only entries still render. |
| Practise from an inspiration | `source_links` + `session_timer` + `record_form` | **Session/control-first:** timer and start/pause controls, then save a practice record; inspiration links remain accessible. |
| Follow up with someone | `next_action_queue` | **Person/action-first:** person, action, unambiguous due date, then done/undo controls. |

Shared ownership checks, records, media authorization, action dispatch, and revision history should be reusable. **A single generic form renderer fails at the view layer:** it would make the photo a secondary attachment, bury music controls among fields, and present “person” and “action” as undifferentiated inputs. Keep a shared field/record engine; let declarative views choose specialized, accessible components.

## 3. Proposed AppSpec v2 contract

These types describe an **allowlisted runtime**, not generated executable code. Action targets are IDs resolved by the authenticated server; neither arbitrary scripts nor browser-held secrets are accepted.

    type CapabilityId =
      | "source_links" | "image_gallery" | "session_timer"
      | "next_action_queue" | "record_form" | "small_summary"
      | "revision_controls";

    type Field = {
      id: string;                         // persistent within app; never recycle
      key: string;                        // persistent stored-data key
      type: "text" | "date" | "media_ref" | "source_ref" | "duration_seconds";
      required: boolean;
    };

    type Action = {
      id: string;
      capability: CapabilityId;
      operation:
        | "add_source" | "upload_image" | "create_record"
        | "start_timer" | "pause_timer" | "reset_timer"
        | "add_next_action" | "mark_done" | "undo_last_status";
      fieldIds?: string[];                // validated against this app's fields
    };

    type View = {
      id: string;
      kind: "gallery" | "session" | "queue" | "history";
      title: string;
      fieldIds: string[];
      actionIds: string[];
    };

    type AppSpecV2 = {
      schemaVersion: 2;
      identity: { appId: string; title: string; description: string };
      data: {
        recordTypeId: string;             // stable; records live outside the spec
        fields: Field[];
        mediaScope: "owner_scoped_refs";  // references, never public/raw media URLs
      };
      capabilities: CapabilityId[];
      design: {
        layout: "image_first" | "session_first" | "person_action_first";
        type: { heading: "Manrope"; interface: "DM Sans or licensed/system fallback" };
        color: {
          canvas: "#F7F8FC"; ink: "#162039"; action: "#3147F2";
          lime: "#DFFF76"; lilac: "#DBCBFF"; studioOrange: "#FF6A3D";
        };
        density: "comfortable";
        hierarchy: string[];             // ordered, known view IDs
      };
      views: View[];
      actions: Action[];
    };

The validator additionally enforces the **operation-to-capability pairing**, unique stable IDs, resolvable field/action/view references, permissible field types for each operation, authorized owner-scoped media references, and contrast/touch-target rules. It rejects unknown operations rather than treating strings as code. UI body text targets about 16px; controls need comfortable touch targets and verified contrast in their actual foreground/background combinations. The Electric Playground shell can use the supplied tokens while each app takes a distinct Studio Pop composition—no generic sparkle mark, serif/brown shell, metadata-pill clutter, or repeated identical cards.

### Three fictional, valid v2 AppSpec examples

All IDs below are **fictional examples**, not repository IDs. Records, authenticated owner IDs, revisions, and install metadata are intentionally outside AppSpec.

**Light — image-first photography.** `photo` is optional so a legacy observation-only record remains valid.

    {
      "schemaVersion": 2,
      "identity": {
        "appId": "fictional-light-01",
        "title": "Light",
        "description": "Keep photographs and observations together"
      },
      "data": {
        "recordTypeId": "fictional-light-entry",
        "fields": [
          {"id":"light-photo","key":"photoRef","type":"media_ref","required":false},
          {"id":"light-observation","key":"observation","type":"text","required":false}
        ],
        "mediaScope": "owner_scoped_refs"
      },
      "capabilities": ["image_gallery","record_form"],
      "design": {
        "layout": "image_first",
        "type": {"heading":"Manrope","interface":"DM Sans or licensed/system fallback"},
        "color": {
          "canvas":"#F7F8FC","ink":"#162039","action":"#3147F2",
          "lime":"#DFFF76","lilac":"#DBCBFF","studioOrange":"#FF6A3D"
        },
        "density": "comfortable",
        "hierarchy": ["light-gallery","light-history"]
      },
      "views": [
        {
          "id":"light-gallery","kind":"gallery","title":"Your photographs",
          "fieldIds":["light-photo","light-observation"],
          "actionIds":["light-upload","light-save"]
        },
        {
          "id":"light-history","kind":"history","title":"Observations",
          "fieldIds":["light-photo","light-observation"],"actionIds":[]
        }
      ],
      "actions": [
        {"id":"light-upload","capability":"image_gallery","operation":"upload_image","fieldIds":["light-photo"]},
        {"id":"light-save","capability":"record_form","operation":"create_record","fieldIds":["light-photo","light-observation"]}
      ]
    }

**Riff — session/control-first music.** Starting a timer does not save history; `riff-save` explicitly writes a practice record. No tempo helper or audio analysis is represented.

    {
      "schemaVersion": 2,
      "identity": {
        "appId": "fictional-riff-01",
        "title": "Riff",
        "description": "Practise for 15 minutes and keep a history"
      },
      "data": {
        "recordTypeId": "fictional-riff-session",
        "fields": [
          {"id":"riff-source","key":"inspirationSourceRef","type":"source_ref","required":false},
          {"id":"riff-duration","key":"durationSeconds","type":"duration_seconds","required":true},
          {"id":"riff-notes","key":"practiceNotes","type":"text","required":false}
        ],
        "mediaScope": "owner_scoped_refs"
      },
      "capabilities": ["source_links","session_timer","record_form"],
      "design": {
        "layout": "session_first",
        "type": {"heading":"Manrope","interface":"DM Sans or licensed/system fallback"},
        "color": {
          "canvas":"#F7F8FC","ink":"#162039","action":"#3147F2",
          "lime":"#DFFF76","lilac":"#DBCBFF","studioOrange":"#FF6A3D"
        },
        "density": "comfortable",
        "hierarchy": ["riff-session","riff-history"]
      },
      "views": [
        {
          "id":"riff-session","kind":"session","title":"15-minute session",
          "fieldIds":["riff-duration","riff-notes","riff-source"],
          "actionIds":["riff-start","riff-pause","riff-reset","riff-add-source","riff-save"]
        },
        {
          "id":"riff-history","kind":"history","title":"Practice history",
          "fieldIds":["riff-duration","riff-notes","riff-source"],"actionIds":[]
        }
      ],
      "actions": [
        {"id":"riff-start","capability":"session_timer","operation":"start_timer"},
        {"id":"riff-pause","capability":"session_timer","operation":"pause_timer"},
        {"id":"riff-reset","capability":"session_timer","operation":"reset_timer"},
        {"id":"riff-add-source","capability":"source_links","operation":"add_source","fieldIds":["riff-source"]},
        {"id":"riff-save","capability":"record_form","operation":"create_record","fieldIds":["riff-duration","riff-notes","riff-source"]}
      ]
    }

**People — person/action-first follow-up.** `undo_last_status` is a proposed reversible record operation, **not** a claim that the reported app-design revision/undo feature already supports record undo.

    {
      "schemaVersion": 2,
      "identity": {
        "appId": "fictional-people-01",
        "title": "People",
        "description": "Keep the next follow-up clear"
      },
      "data": {
        "recordTypeId": "fictional-people-action",
        "fields": [
          {"id":"people-person","key":"person","type":"text","required":true},
          {"id":"people-action","key":"nextAction","type":"text","required":true},
          {"id":"people-due","key":"dueDate","type":"date","required":false}
        ],
        "mediaScope": "owner_scoped_refs"
      },
      "capabilities": ["next_action_queue"],
      "design": {
        "layout": "person_action_first",
        "type": {"heading":"Manrope","interface":"DM Sans or licensed/system fallback"},
        "color": {
          "canvas":"#F7F8FC","ink":"#162039","action":"#3147F2",
          "lime":"#DFFF76","lilac":"#DBCBFF","studioOrange":"#FF6A3D"
        },
        "density": "comfortable",
        "hierarchy": ["people-queue"]
      },
      "views": [
        {
          "id":"people-queue","kind":"queue","title":"Next follow-ups",
          "fieldIds":["people-person","people-action","people-due"],
          "actionIds":["people-add","people-done","people-undo"]
        }
      ],
      "actions": [
        {"id":"people-add","capability":"next_action_queue","operation":"add_next_action","fieldIds":["people-person","people-action","people-due"]},
        {"id":"people-done","capability":"next_action_queue","operation":"mark_done"},
        {"id":"people-undo","capability":"next_action_queue","operation":"undo_last_status"}
      ]
    }

For Riff, the renderer sets the session’s configured **15-minute default** from the session view configuration or an existing runtime setting; this minimal contract currently exposes that duration only in the view title. **Before implementation, add and validate a numeric `defaultDurationSeconds: 900` on session views** rather than parsing the title. Likewise, a production contract should define queue status storage and reversal semantics explicitly. These are contract-completion tasks, not behavior implied to exist by the JSON.

## 4. Renderer, compatibility, and acceptance

**Component responsibilities.** A shared `AppShell` supplies navigation, theme tokens, accessibility defaults, and stable `/apps/{appId}/` routing. `GalleryView` resolves authorized media refs, shows the image prominently, and handles image upload plus observation entry. `SessionView` owns timer controls and a separate save-history action. `QueueView` renders person/action/due date prominently and dispatches add, done, and reversible status actions. `HistoryView` reads saved records, including Light’s text-only records and Riff’s practice sessions. A single authenticated action dispatcher validates each binding against the capability allowlist and owner before changing data.

**v1 and revision path.** Keep v1 specs readable through an adapter; do not rewrite records just to display them. Persist a v2 spec only through an additive migration that preserves existing app, field, record, and URL identifiers, allocating IDs solely for genuinely new fields. Preview an AppSpec change against the current revision; **Accept** commits that design revision, while **Cancel** writes nothing. Design undo restores a prior spec revision without deleting records created since it. Keep per-app installation metadata associated with the stable app ID and untouched by design revisions. Record-status undo is a separate, explicitly validated operation.

**Meaningful validation cases:**

- Light accepts an authorized upload ref and observation; displays a legacy text-only record without a broken-image placeholder; rejects another owner’s media ref.
- Riff starts/pauses/resets its configured 900-second timer, saves a session only on confirmation, and reloads that saved record. An inaccessible inspiration link is stored as a link, never described as analyzed video.
- People previews adding “Maya / follow up about proposal”; asks for date clarification before converting a relative “Thursday” to an absolute date; confirms once, marks done, and can reverse that status without revising the app design.
- All three reject unknown action IDs, mismatched capabilities, stale revisions, cross-owner IDs, duplicate confirmed writes, and stale cached proposals following context deletion or authorization changes.
- A v1 app retains its URL, data/field IDs, records, undo history, and install metadata across preview/cancel/accept/undo.

**Unavailable integrations:** External social-content extraction, automatic audio/tempo analysis, automatic messaging, and calendar sync are **not included**. The optional tempo helper must remain absent from both AppSpec and UI unless its runtime capability is verified.

