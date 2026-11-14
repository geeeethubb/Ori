# API contract (server ⇄ client)

All JSON. Errors: `{ "error": "<human sentence>", "code": "<slug>", "details"?: any }`.
Codes: `unauthenticated` (401), `not_found` (404), `invalid` (400), `validation` (422, `details` = `{ [fieldId]: message }`),
`stale_preview` (409), `nothing_to_undo` (409), `no_context` (409), `premium_paused` (403), `model_unavailable` (503),
`rate_limited` (429), `too_large` (413), `server_error` (500).

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
| POST | `/api/apps/from-fixture` | `{fixture: 'photo-walk-journal'|'follow-up-board'|'practice-tracker', name?}` | `AppDetailDto` 201 (sample-labelled) |
| GET | `/api/apps/:appId` | – | `AppDetailDto {app, spec, version, canUndo}` |
| PATCH | `/api/apps/:appId` | `{pinned?, archived?}` | `AppDetailDto` |
| DELETE | `/api/apps/:appId` | – | `{ok}` |
| GET | `/api/apps/:appId/records` | – | `{records: AppRecord[]}` newest first |
| POST | `/api/apps/:appId/records` | `{values}` | `{record}` 201 / 422 validation |
| PATCH | `/api/apps/:appId/records/:recordId` | `{values}` (partial merge) | `{record}` |
| DELETE | `/api/apps/:appId/records/:recordId` | – | `{ok}` |
| GET | `/api/apps/:appId/versions` | – | `{versions: AppVersionDto[]}` ascending |
| POST | `/api/apps/:appId/revisions/preview` | `{request}` (natural language) | `RevisionPreviewDto {proposalId, summary, changes[], ops, unsupported[], previewSpec, generatedBy}` |
| POST | `/api/apps/:appId/revisions/apply` | `{ops, summary?, baseVersion?, proposalId?}` | `AppDetailDto & {changes: string[]}` (409 `stale_preview` if baseVersion ≠ current) |
| POST | `/api/apps/:appId/revisions/undo` | – | `AppDetailDto` (409 `nothing_to_undo`) |
| GET | `/api/apps/:appId/suggestion` | – | `{suggestion: ImprovementSuggestionDto \| null, generatedBy}` |
| POST | `/api/apps/:appId/feedback` | `{text}` | `{suggestion: ImprovementSuggestionDto \| null, generatedBy}` (also records `feedback_given`) |
| GET | `/api/apps/:appId/export` | – | `AppExportDto` (Content-Disposition attachment) |
| POST | `/api/apps/import` | `AppExportDto` | `AppDetailDto` 201 (new app id) |
| GET | `/api/apps/:appId/events` | – | `{events: AppEvent[]}` |
| POST | `/api/apps/:appId/events` | `{type: 'app_opened'|'install_guide_viewed'|'shortcut_requested'|'feedback_given'|'revision_declined', meta?}` | `{ok}` |

Server-derived events (never posted by the client): `app_built`, `first_item_saved`, `item_saved`, `task_completed`, `revision_accepted`, `revision_undone`.

## Install metadata (public by unguessable ID; no records)
`GET /apps/:appId/` → HTML with app-specific `<title>`, manifest link, apple-touch-icon, theme color, `window.__AAS_BOOT__`.
`GET /apps/:appId/manifest.webmanifest`, `/apps/:appId/icon.svg`, `/apps/:appId/icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`.
Storefront: `/manifest.webmanifest`, `/icons/store-192.png`, `/icons/store.svg`.

## Context (Your Context)
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/context` | – | `ContextOverviewDto {sources, facts}` (facts include status `removed`? **no** – removed facts are excluded) |
| POST | `/api/context/sources` | `{kind: 'paste'|'upload'|'manual', label?, text}` (≤ 60k chars) | `{source, facts: ProfileFact[] (new), note?, generatedBy}` 201 |
| POST | `/api/context/sample` | `{profile: 'founder-photographer' | 'student-musician'}` | same shape, source.kind = `sample` |
| DELETE | `/api/context/sources/:id` | – | `{ok, removedFactIds}` (facts only backed by this source are removed; recommendations become stale) |
| POST | `/api/context/facts` | `{category, value}` | `{fact}` (confirmed, manual) |
| PATCH | `/api/context/facts/:id` | `{value?, category?, status?: 'confirmed'|'removed'}` | `{fact}` |
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
| POST | `/api/recommendations/:id/build` | `{spec, description?, instructions?}` | `AppDetailDto` 201 (recommendation → `built`, `builtAppId`) |

Grounding rule: every recommendation cites ≥1 approved `ProfileFact.id` in `evidenceFactIds`; the server drops citations that are not approved facts and drops recommendations left with none.
