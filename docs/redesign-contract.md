# Redesign contract (what every part of the code agrees on)

Written 2026-11-14 for the parallel build. The requirements live in `redesign/*.md`; this file is the
implementation contract: tokens, routes, API, app contract, component boundaries and test ids.
When something here and the code disagree, fix the code or update this file in the same change.

## 0. Non-negotiables

- Product name is undecided: read `BRAND` from `shared/brand.ts` ("Your Playground"). Never hard-code a name.
- Preserve users, app ids, URLs (`/apps/{id}/`), field ids, records, revision history, undo, export/import, install metadata, auth.
- Never print, log or commit secrets; never touch `.env`. Never reset or reseed `data/app.db`.
- Label example/sample content and Sample-mode output everywhere it appears. Never claim a link was read when it was not (`capture.readStatus`).
- No generated code runs in the app. The runtime renders validated `AppSpec` only.
- Phone first (390px, also 320px without horizontal overflow), composed desktop (768, 1440). Tap targets ≥ 44px. Reduced-motion respected. WCAG AA for text.
- Electric Playground governs the parent shell; Studio Pop lives inside apps (each app has its own theme/typography/density/primary action).

## 1. Design tokens (client/src/styles.css)

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#F7F8FC` | page background |
| `--surface` / `--surface-2` / `--surface-3` | `#FFFFFF` / `#EEF0F7` / `#E3E6F0` | panels / quiet fills / pressed |
| `--ink` / `--ink-2` / `--ink-3` | `#162039` / `#59617A` / `#646C88` | text / supporting / hints (ink-3 darkened in the review pass for small muted text) |
| `--line` / `--line-2` | `#DCE0EC` / `#C9CEDD` | separators / input borders |
| `--blue` / `--blue-ink` / `--blue-soft` | `#3147F2` / `#2436C9` / `#E8EBFF` | primary actions, selected nav |
| `--lime` / `--lime-ink` / `--lime-soft` | `#DFFF76` / `#4B5A00` / `#F4FFD0` | sparing highlight (dark text on lime) |
| `--lilac` / `--lilac-ink` / `--lilac-soft` | `#DBCBFF` / `#4B2E8A` / `#F1EAFF` | exploration content |
| `--orange` / `--mint` | `#FF6A3D` / `#BCEED6` | app artwork only (dark text) |
| fonts | `--font-display` Manrope Variable, `--font-body` DM Sans Variable | self-hosted via `@fontsource-variable/*` (OFL). Buttons, chips and the bottom navigation use Manrope deliberately (an expressive label face); body text and form inputs use DM Sans |
| radii | `--radius-s` 12, `--radius` 18, `--radius-l` 24 | parent surfaces; apps may differ |
| spacing | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 | |

Legacy aliases (`--bg`, `--accent`, `--work`, `--explore`, `--ink-2`…) still resolve so untouched components keep working. Icons: inline SVG (`Icons` in `components/ui.tsx`, Lucide paths) or `lucide-react`.

App themes (runtime, scoped on `.rt-root[data-theme]`): `bright` (canvas), `paper` (`#FAF8F4`, ink `#181A1F`), `charcoal` (`#181A1F`, text `#FAF8F4`), `ink` (`#162039`, surface `#27324D`, text `#F7F8FC`, accent lime), `mint` (`#F3FBF7` / `#BCEED6`, blue actions), `lilac`, `sunset`. The runtime owns the exact variables (`--app-bg`, `--app-surface`, `--app-ink`, `--app-ink-2`, `--app-line`, `--app-accent`, `--app-accent-ink`, `--app-font-display`, `--app-radius`, `--app-gap`).

## 2. Routes (client/src/App.tsx)

| Route | Page | Notes |
| --- | --- | --- |
| `/` | Landing (`WelcomePage`) | signed-in users go to `/playground` |
| `/agent` | Agent | composer + thread; new users land here after signup |
| `/playground` | Playground | editorial grid of proposals |
| `/apps` | My apps | launcher |
| `/make/:recId` | Make mine | proposal detail → choices → real preview → Make mine; explore / update / keep handled here too |
| `/settings` | Settings | account, plan, AI use, data, links to memory/import |
| `/settings/memory` | What you've shared | facts (confirmed/inferred/conflicts), sources, captures; edit/forget |
| `/settings/import` | Bring more context | paste/upload/short profile, export prompt behind a copy control, labelled samples |
| `/pricing`, `/login`, `/signup` | | unchanged behaviour |
| `/apps/:appId/*` | Runtime | outside the shell; `/apps/:appId/settings` holds "Make this more me", history, install, data |
| old: `/for-you`, `/collection`, `/context`, `/import`, `/account`, `/recommendations/:id` | redirects | keep |

Navigation: `NAV` in `shared/brand.ts` (Agent / Playground / My apps). Settings via the avatar menu (`data-testid="avatar-menu"`, items `menu-settings`, `menu-memory`, `menu-signout`). Bottom tabs on phones (`tab-agent|playground|apps`), top nav on desktop (`nav-agent|playground|apps`).

## 3. API (server/routes)

All `/api/*` routes require the session (cookie or `Authorization: Bearer` + `X-Client: native`). Errors: `{ error, code, details? }`. Model calls are gated (`premium_paused` 403, `rate_limited` 429).

### Agent
- `GET /api/agent/thread` → `AgentThreadDto { items: [{ capture, media, reply }] }` newest first (≤ 30).
- `POST /api/agent/captures` `{ text?, url?, mediaId?, sourceLabel?, id?, example? }` (at least one of text/url/mediaId) → 201 `CaptureResultDto { capture, media, reply | null, error?, linkNote? }`. `id` is client-minted: repeating a share with the same id returns the first one (200, `duplicate: true`) without a second model call, also when two sends overlap; an id owned by someone else is a generic 400; the id of a share this person forgot is refused (409) and never saved or learned from again. `example: true` stores an unchanged example as an example. The reply carries `unsupported: [{ request, reason, alternative? }]` for things that do not exist here (syncs, calendars, messages, audio). The capture is saved even if the agent fails. `capture.readStatus`: `read` (note text / image read by the live model) · `metadata_only` (allowlisted oEmbed title: YouTube, Vimeo, SoundCloud, Spotify) · `not_read` (link saved, page never fetched) · `unavailable`.
- `POST /api/agent/captures/:id/respond` → `CaptureResultDto` (retry / ask again).
- `GET /api/agent/captures/:id` → thread item. `DELETE /api/agent/captures/:id` → forget (its proposals go; apps keep their data). Forget and "Just keep it" remove only what the agent inferred from that share alone: a fact the person confirmed or edited, or one another saved share also states, stays (it then quotes a sentence of a share that still backs it, or nothing). A share that restates a known fact is recorded as another source of it; matching is Unicode-aware.

### Media (photos)
- `POST /api/media` multipart field `file` (jpeg/png/webp/gif ≤ 6 MB, type sniffed) → 201 `{ media: { id, mime, size, width, height } }`.
- `GET /api/media/:id` → bytes, owner only (404 otherwise). In the browser `<img src="/api/media/:id">` works with the cookie; in the Android shell fetch with the bearer header and use an object URL (`AuthImage`).
- `GET /api/media/:id/meta`, `DELETE /api/media/:id`.
- `GET /examples/light-1.jpg` … `light-4.jpg`: public CC0 example photographs (previews, seed). Record values use media ids; preview records use `example:light-1` etc. (never stored). Client code must build these URLs with `apiBase()` (the Android shell's page origin is the local bundle).

### Proposals (`/api/recommendations`, shared by Playground and Agent)
- `GET /` → `RecommendationsDto { recommendations, generatedBy, stale }` (statuses fresh/built/applied; capture-born ones carry `captureId`).
- `POST /generate` `{ count? }` → regenerates the Playground set from facts + recent captures (capture-born proposals untouched).
- `GET /:id` → `ProposalDetailDto { recommendation, evidence (facts), captures, targetApp, stale }` (`stale`: why it can no longer be made, or null).
- `targetAppId` is left out when that app no longer exists, and a proposal counts as built only while its app exists (deleting the app makes it buildable again; Refresh also replaces such older cards).
- Kinds: `new_app`, `explore`, `keep`, `update_app` (a design change to `targetAppId`, previewed) and `use_app` (open `targetAppId`; optional `recordDraft` by role: `source` {url, title, note} · `follow_up` {person, action, dueText, note} · `photo` {mediaId}). A `use_app` card links to `/apps/{targetAppId}/?from={id}`; the app maps the draft onto its own fields with `draftEntry(spec, draft)` (`shared/drafts.ts`) and opens its form; the entry is saved through `POST /api/apps/:appId/records` with `id: use_<proposalId>` and `recommendationId`, which marks the proposal `applied`. New-app proposals may carry `suggestedMinutes` (the Make page starts there).
- `POST /:id/draft` `{ instructions?, choices?: { timeBudgetMinutes?, goal?, look? } }` → `ProposalPreviewDto { spec, description, unsupported, generatedBy, fallbackReason?, previewRecords }`. Render the preview with the REAL runtime renderer and the preview records, labelled "Example content".
- `POST /:id/build` `{ spec, description?, instructions? }` → 201 `BuildResponseDto` (`AppDetailDto` + `carried`: the shared link or photo saved into the new app) ("Make mine"). Idempotent per proposal: a repeat returns the app already made (200, `alreadyBuilt: true`). Only `new_app` proposals build; a stale proposal (cited memory removed, share forgotten, dismissed) is `409 stale_proposal` here and in `/draft` and `/update-preview`.
- `POST /:id/dismiss`, `POST /:id/keep` (status `kept`: a save stays a save; keep also removes what was learned from that share alone and returns `forgotten`). Both only from `fresh`/`stale`, idempotent.
- `POST /:id/update-preview` `{ extra? }` (kind `update_app`) → `RevisionPreviewDto & { appId }`; accept with the existing `POST /api/apps/:appId/revisions/apply` (`ops, summary, baseVersion, proposalId, recommendationId`); the apply marks the proposal accepted and the recommendation applied in one step, and `POST /:id/applied` remains as a best-effort confirmation for older clients.

### Apps (unchanged, plus)
- Records with `image` fields must reference the owner's media (422 otherwise). An entry whose only home is a gallery needs a photo or an observation (`_` error otherwise).
- `POST /:appId/records` `{ values, id?, recommendationId? }`: a client-minted `id` makes saving exactly once (a repeat returns the first, 200 `duplicate: true`; a repeat with newer values updates the entry if nobody edited it by hand since (a PATCH sets `edited_at`; a retried save does not), 200 `duplicate: true, updated: true`, otherwise `409 record_conflict`; the id of an entry this person deleted in this app is `409 record_deleted`, and the client then saves once more under a new id; another owner's or app's id is a generic 400). The client keeps a new entry's id with its draft only once a create with it was sent, so reopening after a lost response retries the same entry while two tabs never share an id; an edit's draft holds only the keys the person changed. `PATCH /:appId/records/:id` `{ values, baseUpdatedAt? }`: send only changed keys; with `baseUpdatedAt`, an edit made on an older copy is `409 record_conflict` with `details.record` (the latest copy) instead of overwriting.
- `POST /:appId/revisions/apply`: guarded by `guardRevision` (no id reuse across versions, sound bindings, no entries stranded: `409 apply_incompatible` with the reason); a repeat with an accepted `proposalId` returns `alreadyApplied: true`.
- `POST /:appId/revisions/undo/preview` → `UndoPreviewDto { ok, restores, label: Undo|Redo, kept[], blocked[] }`; `POST /:appId/revisions/undo` `{ expectedVersion? }` → detail + `kept` (data-safe: newer fields someone filled in come back hidden, untouched defaults do not count, used choices stay; `409 undo_incompatible` with the reason when entries would be stranded; `409 stale_preview` on a version mismatch; 400 for a malformed body). Undo and Redo alternate.
- Client-posted events now include `first_action_completed` (a timed session / added a photo / completed an action) and `useful_action` (bounded meta: kind, timed, elapsedSec, via).
- `AppSummaryDto` now carries `design` (resolved) and `capabilities`.
- `GET /api/context` → `{ sources, facts, captures }`.

## 4. App contract (shared/appSpec.ts) — additive, schema version stays 1

- New field type `image` (value = media id).
- Practice timer (client): one stored timer per app view, shared by every tab of that app (a stale tab adopts what another stored); preview timers are never stored; a saved session is dated by the day it ended, else the day of its latest Start or Resume; the plan is stored only for a timed session; "typed in" is shown only for an explicit empty timed value; save, conflict and reset act only on the session they belong to; "Show all sessions" lists every session of the view.
- New views: `gallery` (imageFieldId, captionFieldId?, noteFieldId?, dateFieldId?, columns 2|3|4), `practice` (minutesFieldId = minutes played, focusFieldId?, tempoFieldId?, feelFieldId?, notesFieldId?, dateFieldId?, targetMinutesFieldId? = the plan, timedSecondsFieldId? = seconds the clock measured, presets[], defaultTempo, tempoHelper), `links` (urlFieldId, titleFieldId?, noteFieldId?, kindFieldId?, tagsFieldId?), `queue` (personFieldId, actionFieldId, dueFieldId?, doneFieldId? | stageFieldId?+doneStageValues, contextFieldId?, channelFieldId?, dueTextFieldId? = the person's words for when, draftFieldId?, groupBy due|person).
- Roles: `viewRoles(view)` lists every role a view binds by field id; `checkBindings(spec)` / `bindingProblems(spec)` (acceptance-time only: generation, Make mine, every change; never at load) refuse hidden structural fields, a hidden filter field, one field in two roles (sorting by a shown field is fine) and a count metric over a missing field. Each problem has a key built from ids, so a change is refused only for problems it introduces, and a rename never turns an existing quirk into a new one. `boundFieldIds(spec)` cannot be hidden by any revision, checked on the final design.
- Every view may have `filter { fieldId, value }` (records belonging to the view; its form sets it), `formFieldIds` (fields its form shows; use `formFieldsFor(spec, view)`) and `addLabel` (primary action label).
- `design { theme, accent?, typography, density, artwork }`; use `designFor(spec)` which supplies compatibility defaults for pre-redesign apps (journal → bright/editorial, board → compact, etc.).
- `recordMatchesView(view, values)`, `capabilitiesOf(spec)`, `viewTypeLabel(type)`, `fieldTypeLabel('image') = 'photo'`.
- Patterns: journal, board, tracker, gallery, practice, queue. Revision op `set_design` added ("Make this more me" can change the look).
- Reference fixtures: `server/fixtures/specs.ts` → `riff-practice` (Riff), `light-gallery` (Light), `people-queue` (People); the three session-1 fixtures remain. `POST /api/apps/from-fixture { fixture }` builds any of them (sample-labelled).

## 5. Component ownership

- **Runtime (`client/src/runtime/*`)**: `AppRuntimePage` → `AppHome` renders by `spec.views`; new renderers `GalleryView` (contact sheet, `AuthImage`, lightbox, "Add photo" upload flow), `PracticeView` (timer with presets, start/pause/reset, metronome via WebAudio started only by a tap, "Save session" creating a record with the view's field ids), `LinksView` (saved sources with host/title/open, add form), `QueueView` (grouped next actions, initials, complete via done checkbox or stage, draft copy). Theming via `designFor(spec)` → `data-theme`, `data-typography`, `data-density` on `.rt-root`. Export `AppPreview` (`{ spec, records, label }`) for the Make-mine page (same renderers, read-only, example banner). Keep: offline cache, in-place sign-in, settings sections (rename "Make a change" → "Make this more me"; keep accept/decline/undo), install guide, export/import, data-testids below.
- **Storefront (`client/src/pages/*`)**: Landing, Agent (polish of the foundation `AgentPage`), Playground, Make mine (`/make/:recId`: detail, choices, real preview via `AppPreview`, states planning→generating→validating→ready/failed with retry, explore steps, update flow, keep), My apps launcher, Settings (account), What you've shared (memory), Bring more context (import). Shared primitives in `components/ui.tsx`.
- **Server sample adapter (`server/model/sample/*`)**: `respond.ts` (honest reply + proposals), concepts for Riff/Light/People (`concepts-playground.ts`), `generate.ts` (choices), `recommend.ts` (variety + captures), seed (`server/scripts/seed.ts`: demo account with the three reference apps, example captures labelled example, example photos copied into media).
- **Tests (`tests/*`)**: API tests for captures/read status/media ownership/preview/make/keep/update; schema tests for new views/filter/design; browser journey (guitar slice), direct-url, board-rule, mobile screens at 320/390/768/1440.

## 6. Test ids (keep stable)

Shell: `brand-home`, `nav-*`, `tab-*`, `avatar-menu`, `menu-settings`, `menu-memory`, `menu-import`, `menu-signout`.
Agent: `agent-composer`, `agent-text`, `agent-add-link`, `agent-url`, `agent-add-image`, `agent-file-input`, `agent-send`, `agent-thinking`, `agent-empty`, `agent-example-guitar`, `agent-example-photo`, `agent-thread`, `agent-item`, `agent-read-status[data-status]`, `agent-reply`, `agent-no-reply`, `agent-forget`, `proposal-card[data-kind][data-rec-id]`, `proposal-action`.
Make mine: `make-title`, `make-choice-minutes-<n>`, `make-preview-button` (Preview is an explicit step: it spends a model call in Live mode), `make-preview` (the rendered preview), `make-preview-example-banner`, `make-mine` (primary CTA; drafts first when no preview exists), `make-state` (planning|generating|validating|ready|failed), `make-retry`, `make-explore-steps`, `make-update-preview`, `make-update-accept`, `make-update-nothing` + `make-update-settings` (when nothing would change), `make-keep`.
Playground: `pg-grid`, `pg-card[data-kind]`, `pg-featured`, `pg-why`, `pg-action`, `pg-dismiss`, `pg-refresh`, `pg-empty`, `pg-add-interest-input`, `pg-add-interest-submit`, `pg-sample-badge`.
My apps: `apps-grid`, `app-tile[data-app-id]`, `app-tile-open`, `app-tile-menu`, `apps-empty`, `apps-recent`.
Memory: `mem-fact`, `mem-fact-remove`, `mem-fact-edit`, `mem-source`, `mem-source-remove`, `mem-capture`, `mem-capture-forget`, `mem-add-interest`.
Import (existing): `store-sample-founder`, `store-sample-student`, `store-import-textarea`, `store-import-submit`, `store-upload-submit`, `store-manual-submit`.
Runtime (existing + new): `rt-app`, `rt-new-entry` (generic add), `rt-input-<fieldId>`, `rt-save-record`, `rt-entry`, `rt-settings-link`, `rt-view-tab-<viewId>`, `rt-revise-input`, `rt-revise-preview`, `rt-revise-changes`, `rt-revise-accept`, `rt-revise-decline`, `rt-undo`, `rt-card`, `rt-move-<recordId>`, `rt-attention-filter`, `rt-board-column-<value>`, `rt-signin-submit`, `rt-android-shortcut`; new: `rt-practice`, `rt-practice-preset-<minutes>`, `rt-practice-start`, `rt-practice-pause`, `rt-practice-reset`, `rt-practice-time`, `rt-tempo`, `rt-tempo-value`, `rt-tempo-toggle`, `rt-practice-save`, `rt-practice-recent` with `rt-session` items (journal entries keep `rt-entry`), `rt-gallery`, `rt-gallery-tile`, `rt-add-photo`, `rt-photo-input`, `rt-lightbox`, `rt-links`, `rt-link-item`, `rt-add-link`, `rt-queue`, `rt-queue-group-<overdue|today|soon|later|done>`, `rt-queue-item`, `rt-queue-done-<recordId>`, `rt-preview-banner`.

## 7. Honesty rules in copy

- Sample mode is always visible (`ModeBadge`) and replies say "Sample mode" when they came from the catalog.
- "Saved link, not read" / "Title read, content not read" labels come from `READ_STATUS_LABELS`.
- Previews say "Example content" and never claim the app exists until `build` returns.
- Install: the person does Add to Home Screen themselves; we never say it happened.
- Explorations list steps; they never link to pages we did not get from the person.
