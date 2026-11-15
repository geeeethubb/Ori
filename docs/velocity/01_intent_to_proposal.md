# Velocity run 1: 01_intent_to_proposal

Date: 2026-11-14 (America/Chicago).
Source (Kearney Velocity; may require workspace access): https://kearney-perlab.growthsignals.com/research/id-1794674829478-0.d43a12a7b3c1c

Status: Actually submitted and completed in the user's Velocity workspace. Output copied using Velocity's Copy control. Generated design proposal; not app implementation or test results.

Precedence: 04 final corrections > 03 addendum > 02 B > 01 A. Earlier conflicting examples are preserved only for provenance.

## Exact submitted prompt

Kearney hackathon — Personal AI Playground (working title, not final branding). Treat this as a concrete product-design and implementation contribution, not generic brainstorming.

Guiding star: a personal AI turns interests and everyday needs into a playground of apps made for the user — a collection that grows with you. Three surfaces: Agent, Playground, My apps. Parent visual direction: Electric Playground; app expression: Studio Pop. Photography must be image-first, music session/control-first, follow-up person/action-first. An inspiration may simply remain saved and must not automatically become a permanent interest.

BUILD PLAN PROMPT A — intent to useful proposal:
We are building a personal AI playground with three surfaces: Agent, Playground, and My apps. A user shares an inspiration or an everyday need. Design a compact decision workflow that chooses among: keep as a source, suggest an exploration, update an existing app, or propose a new app. Inputs: the user's explicit note, read-status of the source, existing app capabilities, and editable context. Output a small validated proposal contract with an outcome, first action, short reason, and source IDs. Never infer inaccessible video contents. Demonstrate the workflow on one guitar inspiration, one photography inspiration, and one follow-up task. Return the workflow, sample inputs/outputs, failure cases, and the implementation contribution that can be exported into our repository.

Constraints from the build plan:
- Previous builder REPORTED Vite/React/TypeScript, Hono/Node, SQLite, validated AppSpec generation, auth/owner checks, app revisions/undo, and a Capacitor Android shell. These are unverified historical claims; you have not inspected the repo.
- Preserve auth, owner boundaries, existing app IDs/URLs/field IDs, records, revisions/undo, and install metadata. Additive/backward-compatible changes.
- Supported capabilities to map against: source-link collection, image upload/gallery, session timer, next-action queue, record form, small summary, revision controls. Tempo helper optional, external social-content extraction unavailable unless proven.
- No invented source reading, integrations, user research, deployment, test passes or installation.
- Prefer opening/updating an existing suitable app to creating duplicate apps. Actual mutation/build requires a user-selected proposal. Return source evidence separately from inferences.
- A shared link with no readable content can still be saved alongside the explicit user note.
- No execution of arbitrary generated code or secrets in browser code.

Return a decision table, a compact TypeScript discriminated union or JSON Schema, three complete fictional test fixtures with expected outputs (guitar inaccessible video, photography uploaded image + explicit note, follow-up using existing queue), and edge/negative cases including ambiguous note, unsupported capability, retry, duplicate submission, deleted context, unauthorized app ID. Name the minimum repository artifacts this output could become. Label proposal/design vs implemented facts.

## Actual Velocity output

## Proposed decision workflow — not an implemented feature

The Agent should return a **proposal, not a mutation**. Saving a source preserves what the user shared; it does not add a permanent interest. Creating or changing an app requires the user to select the proposal.

1. **Validate boundaries.** Authenticate the user; verify ownership of every referenced source and app; load the current editable context and app revision. Reject unauthorized IDs without revealing whether another user’s app exists.
2. **Separate evidence from interpretation.** Retain the explicit note, source ID, and verified read status. An inaccessible video contributes its URL and the user’s note—not a description of its contents. An uploaded image contributes the upload and note unless image interpretation is actually available and authorized.
3. **Match the need to supported capabilities.** Check suitable existing apps before proposing a new one. Treat a tentative inspiration differently from an explicit, repeatable need.
4. **Return one small proposal.** Include its outcome, first action, short reason, and source IDs. Recheck ownership and context revision before any later user-selected mutation.

| Condition, evaluated in order | Outcome | First action |
|---|---|---|
| Note is ambiguous, says “save this,” or provides too little basis for an app; source can be retained | `keep_source` | Show saved source and note |
| User wants to try an idea, but has not requested a durable workflow | `suggest_exploration` | Open a temporary, relevant exploration |
| Explicit task fits an authorized existing app’s capabilities | `update_existing_app` | Open that app with a proposed change for review |
| Explicit repeatable need fits supported capabilities, with no suitable existing app | `propose_new_app` | Preview a proposed app for selection |
| Required capability is unsupported | No build proposal | Keep source if appropriate; identify the gap without claiming it works |

The Playground exploration is temporary; **My apps** changes only after selection. For photography, lead with the image; for music, lead with the practice session and controls; for follow-up, lead with the person and next action.

### Small proposal contract

This TypeScript is a **design artifact**, not a claim about repository types. `reason` describes the inference; `evidence` contains only available inputs.

    type Capability =
      | "source_links" | "image_gallery" | "session_timer"
      | "next_action_queue" | "record_form" | "small_summary"
      | "revision_controls";

    type Evidence = {
      explicitNote: string;
      sources: Array<{
        id: string;
        kind: "link" | "upload";
        readStatus: "unreadable" | "metadata_only" | "readable";
      }>;
    };

    type Base = {
      reason: string;
      sourceIds: string[];
      evidence: Evidence;
      contextVersion: string;
    };

    type Proposal =
      | (Base & {
          outcome: "keep_source";
          firstAction: { type: "view_saved_source" };
        })
      | (Base & {
          outcome: "suggest_exploration";
          firstAction: {
            type: "open_exploration";
            mode: "image_first" | "session_first" | "action_first";
          };
        })
      | (Base & {
          outcome: "update_existing_app";
          targetAppId: string;
          targetAppRevision: string;
          firstAction: {
            type: "preview_app_update";
            capability: Capability;
            suggestedAction: string;
          };
        })
      | (Base & {
          outcome: "propose_new_app";
          firstAction: {
            type: "preview_new_app";
            capabilities: Capability[];
            mode: "image_first" | "session_first" | "action_first";
          };
        });

Validate the union at the API boundary: exact outcome/action pairing, nonempty bounded reason and note, deduplicated owned `sourceIds` matching `evidence.sources`, supported capabilities, and an authorized current app ID/revision for updates. A selected new-app proposal still goes through the existing validated AppSpec path; this contract is **not** an AppSpec or permission to generate executable code.

### Fictional fixtures and expected proposals

These are specification examples, **not test results**. Each input represents data already available to the authenticated user; none asserts that linked media was read.

**1. Guitar — inaccessible video, explicit practice need**

- **Input:** user `u1`; note “This guitar video inspired me. I want a 10-minute daily practice session with a timer; I’ll choose what to practise”; source `{id:"src-g1", kind:"link", readStatus:"unreadable"}`; existing authorized apps `[]`; editable context `{version:"c1", interests:[]}`.
- **Expected output:** `{outcome:"propose_new_app", firstAction:{type:"preview_new_app", capabilities:["source_links","session_timer"], mode:"session_first"}, reason:"The explicit recurring practice need fits a session timer; no suitable existing app is available. The video contents are unknown.", sourceIds:["src-g1"], evidence:{explicitNote:"This guitar video inspired me. I want a 10-minute daily practice session with a timer; I’ll choose what to practise", sources:[{id:"src-g1",kind:"link",readStatus:"unreadable"}]}, contextVersion:"c1"}`.
- **Boundary:** Preview a session/control-first app with the link as a source. Do not claim to know the song, lesson, chords, or tempo; do not add “guitar” to permanent interests.

**2. Photography — uploaded image and tentative exploration**

- **Input:** user `u1`; note “I uploaded a photo I like. Help me explore ideas for a photo series, but I’m not ready to make an app”; source `{id:"src-p1", kind:"upload", readStatus:"metadata_only"}`; existing authorized apps `[]`; editable context `{version:"c2", interests:[]}`.
- **Expected output:** `{outcome:"suggest_exploration", firstAction:{type:"open_exploration",mode:"image_first"}, reason:"The note asks for exploration rather than a durable app; the uploaded image can anchor an image-first space without assuming what it depicts.", sourceIds:["src-p1"], evidence:{explicitNote:"I uploaded a photo I like. Help me explore ideas for a photo series, but I’m not ready to make an app",sources:[{id:"src-p1",kind:"upload",readStatus:"metadata_only"}]},contextVersion:"c2"}`.
- **Boundary:** Show the actual uploaded image if accessible to this user. No inferred subject matter, permanent interest, or automatic app creation.

**3. Follow-up — suitable existing queue**

- **Input:** user `u1`; note “Follow up with Maya about the proposal on Thursday”; source `{id:"src-f1", kind:"link", readStatus:"metadata_only"}` (a saved task reference, not assumed to contain readable details); existing authorized app `{id:"app-queue-7", revision:"r12", capabilities:["next_action_queue","revision_controls"]}`; editable context `{version:"c3", interests:[]}`.
- **Expected output:** `{outcome:"update_existing_app",targetAppId:"app-queue-7",targetAppRevision:"r12",firstAction:{type:"preview_app_update",capability:"next_action_queue",suggestedAction:"Follow up with Maya about the proposal on Thursday"},reason:"The explicit person-and-action task fits the existing next-action queue; a second app is unnecessary.",sourceIds:["src-f1"],evidence:{explicitNote:"Follow up with Maya about the proposal on Thursday",sources:[{id:"src-f1",kind:"link",readStatus:"metadata_only"}]},contextVersion:"c3"}`.
- **Boundary:** Present Maya and the action first. “Thursday” remains the user’s wording until date context is resolved; previewing does not write a queue record.

### Edge and negative cases

| Case | Required behavior |
|---|---|
| Ambiguous note: “Interesting—maybe later” | `keep_source`; do not manufacture a use case or permanent interest. |
| Unsupported capability: “Extract this social video’s full contents” | Do not claim extraction. Save its link and explicit note if requested; explain that extraction is unavailable unless the repository proves otherwise. A tempo helper is optional, not assumed present. |
| Retry after a network failure | Reuse the same request key and input/context snapshot to return the same proposal; do not create an app or record during proposal generation. |
| Duplicate submission of a selected proposal | Apply an idempotency key at the mutation endpoint so one selection cannot create two apps or queue items. |
| Deleted or changed editable context | Reject a stale selection and recompute from current context; never silently restore deleted interests. |
| Unauthorized app ID | Reject before matching or previewing app data; provide a generic unavailable/unauthorized response and no cross-owner inference. |
| App revised between proposal and selection | Detect revision mismatch; refresh the preview rather than overwriting newer records. |

### Minimum repository contribution — proposed artifacts

- `proposal.schema.ts`: validated discriminated union and capability allowlist.
- `decideProposal.ts`: ordered, side-effect-free decision function and evidence/inference separation.
- `proposal.routes.ts`: authenticated proposal and **separate selection** endpoints with owner checks, context/revision checks, and mutation idempotency.
- `decideProposal.test.ts`: these three fixtures plus the negative cases.

Those are **suggested artifact roles and names**, not inspected paths. Integration should be additive: preserve existing auth and owner boundaries, app IDs/URLs/field IDs, records, revisions/undo, and install metadata. No arbitrary generated code should execute, and secrets must remain out of browser code. I have not inspected the repository, run tests, built an app, or verified the previous builder’s reported stack and capabilities.

