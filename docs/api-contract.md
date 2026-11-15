# API contract (server ⇄ client)

All JSON. Errors: `{ "error": "<human sentence>", "code": "<slug>", "details"?: any }`.
Codes: `unauthenticated` (401), `not_found` (404), `invalid` (400), `validation` (422, `details` = `{ [fieldId]: message }`),
`stale_preview` (409), `nothing_to_undo` (409), `no_context` (409), `premium_paused` (403), `model_unavailable` (503),
`rate_limited` (429), `too_large` (413), `server_error` (500), `record_conflict` (409, `details.record` = the latest copy),
`stale_proposal` (409), `apply_incompatible` (409), `apply_failed` (422), `undo_incompatible` (409).

The Agent, Playground and proposal routes added by the redesign are specified in `docs/redesign-contract.md`; this page
covers the app, record and memory routes and notes where the Velocity integration changed them.

Auth: web = httpOnly cookie `aas_session` (same origin, `credentials: 'include'`). Native/cross-origin = send `X-Client: native`
on login/signup to receive `{ token }`, then `Authorization: Bearer <token>`. `client/src/api.ts` handles both.

DTO types live in `shared/api.ts`, `shared/context.ts`, `shared/appSpec.ts`, `shared/records.ts`, `shared/revision.ts`.

## Auth
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | `{email, password(≥8), displayName?}` | `{user: UserDto, token?}` 201 |
| POST | `/api/auth/login` | `{email, password}` | `{user, token?}` |
| POST | `/api/auth/logout` | – | `{ok}` |
| GET | `/api/auth/me` | – | `{user: UserDto}` |

`UserDto.modelMode` is `'anthropic' | 'sample'` → show a **Live AI** or **Sample mode** badge. `premiumActive=false` → build/revise/generate return 403 `premium_paused`; viewing and export still work.

## Apps, records, versions (owner-scoped; unknown or foreign IDs → 404)
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/apps` | – | `{apps: AppSummaryDto[]}` |
| POST | `/api/apps` | `{spec: AppSpec, changeSummary?, sourceRecommendationId?}` | `AppDetailDto` 201 |
| POST | `/api/apps/from-fixture` | `{fixture: 'photo-walk-journal'|'follow-up-board'|'practice-tracker'|'riff-practice'|'light-gallery'|'people-queue', name?}` | `AppDetailDto` 201 (sample-labelled) |
| GET | `/api/apps/:appId` | – | `AppDetailDto {app, spec, version, canUndo}` |
| PATCH | `/api/apps/:appId` | `{pinned?, archived?}` | `AppDetailDto` |
| DELETE | `/api/apps/:appId` | – | `{ok}` |
| GET | `/api/apps/:appId/records` | – | `{records: AppRecord[]}` newest first |
| POST | `/api/apps/:appId/records` | `{values, id?, recommendationId?}` | `{record}` 201 / 422 validation. With a client-minted `id`, saving is exactly once: the same id again returns 200 `{record, duplicate: true}`; if it carries newer values and the entry was not edited since, the entry is updated (200 `{record, duplicate: true, updated: true}`); if it was edited since, 409 `record_conflict`. The id of an entry this person deleted in this app → 409 `record_deleted`; another app's or person's id → 400. "Edited since" means changed by hand (PATCH); a retried save that already updated the entry may update it again. `recommendationId` marks a `use_app` proposal for this app `applied`. |
| PATCH | `/api/apps/:appId/records/:recordId` | `{values, baseUpdatedAt?}` (partial merge; send only changed keys) | `{record}`; 409 `record_conflict` when `baseUpdatedAt` is older than the stored copy |
| DELETE | `/api/apps/:appId/records/:recordId` | – | `{ok}` |
| GET | `/api/apps/:appId/versions` | – | `{versions: AppVersionDto[]}` ascending |
| POST | `/api/apps/:appId/revisions/preview` | `{request}` (natural language) | `RevisionPreviewDto {proposalId, summary, changes[], ops, unsupported[], previewSpec, generatedBy}` |
| POST | `/api/apps/:appId/revisions/apply` | `{ops, summary?, baseVersion?, proposalId?, recommendationId?}` | `AppDetailDto & {changes: string[]}`. 409 `stale_preview` if baseVersion ≠ current; 409 `apply_incompatible` when the result would reuse a field id for another type, break a binding or leave entries reachable from no view; a repeat for an accepted `proposalId` returns `alreadyApplied: true`; a `recommendationId` that was dismissed or whose sources were forgotten → 409 `stale_proposal` |
| POST | `/api/apps/:appId/revisions/undo/preview` | – | `UndoPreviewDto {ok, restores, label: 'Undo'|'Redo', kept[], blocked[]}` (Undo and Redo alternate) |
| POST | `/api/apps/:appId/revisions/undo` | `{expectedVersion?}` | `AppDetailDto & {kept}` (data-safe: newer fields someone filled in come back hidden, used choices stay). 409 `nothing_to_undo`, `undo_incompatible` (entries would be stranded or read as another type), `stale_preview` (version mismatch); 400 for a malformed body |
| GET | `/api/apps/:appId/suggestion` | – | `{suggestion: ImprovementSuggestionDto \| null, generatedBy}` |
| POST | `/api/apps/:appId/feedback` | `{text}` | `{suggestion: ImprovementSuggestionDto \| null, generatedBy}` (also records `feedback_given`) |
| GET | `/api/apps/:appId/export` | – | `AppExportDto` (Content-Disposition attachment) |
| POST | `/api/apps/import` | `AppExportDto` | `AppDetailDto` 201 (new app id). Photos not in the importer's library and invalid links are dropped (the entry stays); photo fields are decided by each field id's most recent definition |
| GET | `/api/apps/:appId/events` | – | `{events: AppEvent[]}` |
| POST | `/api/apps/:appId/events` | `{type: 'app_opened'|'install_guide_viewed'|'shortcut_requested'|'feedback_given'|'revision_declined'|'first_action_completed'|'useful_action', meta?}` | `{ok}` (`first_action_completed` once per app) |

Server-derived events (never posted by the client): `app_built`, `first_item_saved`, `item_saved`, `task_completed`, `revision_accepted`, `revision_undone`.

## Install metadata (public by unguessable ID; no records)
`GET /apps/:appId/` → HTML with app-specific `<title>`, manifest link, apple-touch-icon, theme color, `window.__AAS_BOOT__`.
`GET /apps/:appId/manifest.webmanifest`, `/apps/:appId/icon.svg`, `/apps/:appId/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`.
Storefront: `/manifest.webmanifest`, `/icons/store-192.png`, `/icons/store.svg`.

## Context (Your Context)
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/context` | – | `ContextOverviewDto {sources, facts}` (facts include status `removed`? **no** – removed facts are excluded) |
| POST | `/api/context/sources` | `{kind: 'paste'|'upload'|'manual', label?, text}` (≤ 60k chars) | `{source, facts: ProfileFact[] (new), note?, generatedBy}` 201; 409 at 40 sources, not counting those made from shares with the agent |
| POST | `/api/context/sample` | `{profile: 'founder-photographer' | 'student-musician'}` | same shape, source.kind = `sample` |
| DELETE | `/api/context/sources/:id` | – | `{ok, removedFactIds}` (facts only backed by this source are removed; recommendations become stale; a fact that stays quotes a sentence of a share that still backs it, or nothing) |
| POST | `/api/context/facts` | `{category, value}` | `{fact}` (confirmed, manual) |
| PATCH | `/api/context/facts/:id` | `{value?, category?, status?: 'confirmed'|'removed'}` | `{fact}` (a new value or category marks the fact confirmed: forgetting a share never removes it) |
| POST | `/api/context/facts/:id/keep` | – | `{facts}` (keeps this one, removes the rest of its conflict group) |
| POST | `/api/context/interests` | `{interest}` | `{fact, source}` (explicitly chosen new interest; confirmed) |

## Recommendations (For You)
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/recommendations` | – | `RecommendationsDto {recommendations, generatedBy, stale}` (fresh + built; dismissed excluded) |
| POST | `/api/recommendations/generate` | `{count?: 3–6}` | `RecommendationsDto` (409 `no_context` without approved facts; may take 10–40 s live) |
| GET | `/api/recommendations/:id` | – | `{recommendation, evidence: ProfileFact[]}` |
| POST | `/api/recommendations/:id/dismiss` | – | `{ok}` |
| POST | `/api/recommendations/:id/draft` | `{instructions}` | `{spec: AppSpec, description, unsupported[], generatedBy}` (nothing saved yet) |
| POST | `/api/recommendations/:id/build` | `{spec, description?, instructions?}` | `BuildResponseDto` 201 (recommendation → `built`, `builtAppId`; `carried` = the shared link or photo saved into the new app). A repeat returns the app already made (200, `alreadyBuilt: true`); only `new_app` proposals build; 409 `stale_proposal` when what it cited was removed. Deleting the app makes the proposal buildable again |

Grounding rule: every recommendation cites ≥1 approved `ProfileFact.id` in `evidenceFactIds`; the server drops citations that are not approved facts and drops recommendations left with none.
