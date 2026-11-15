/**
 * Proposals: the Playground's fact-grounded recommendations and the Agent's capture-grounded
 * proposals share these routes. Preview ("what you would see"), Make mine, dismiss, keep, and
 * update-an-existing-app all live here.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { premiumActive, requireAuth, type AuthEnv } from '../auth.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { AppSpecSchema, capabilitiesOf, checkBindings, formFieldsFor, type AppSpec, type ViewSpec } from '../../shared/appSpec.ts';
import { BuildChoicesSchema, type Recommendation } from '../../shared/context.ts';
import { defaultValues, validateValues } from '../../shared/records.ts';
import type { BuildResponseDto, ProposalDetailDto, ProposalPreviewDto, RecommendationsDto, RevisionPreviewDto } from '../../shared/api.ts';
import * as ctx from '../repos/context.ts';
import * as apps from '../repos/apps.ts';
import * as captures from '../repos/captures.ts';
import { ownedMediaIds } from '../repos/media.ts';
import { saveProposal } from '../repos/proposals.ts';
import { transaction } from '../db/index.ts';
import { withModel } from '../model/index.ts';
import type { ExistingAppSummary } from '../model/types.ts';
import { previewRecords } from '../services/previewContent.ts';
import { groundExplorations } from '../services/grounding.ts';
import { guardRevision, reservedFor } from '../services/revisionGuards.ts';
import { PAUSED_MESSAGE, premiumGate } from './gate.ts';

export const recommendationRoutes = new Hono<AuthEnv>();
recommendationRoutes.use('*', requireAuth);

const idParam = z.string().regex(SHORT_ID_PATTERN);
const notFound = { error: 'That proposal is no longer here.', code: 'not_found' } as const;

function overview(ownerId: string): RecommendationsDto {
  const recs = ctx.listRecommendations(ownerId, ['fresh', 'built', 'applied']);
  const currentHash = ctx.factsHash(ctx.approvedFacts(ownerId));
  const freshFactBorn = recs.filter((r) => r.status === 'fresh' && !r.captureId);
  const stale = freshFactBorn.length > 0 && freshFactBorn.some((r) => r.inputHash !== currentHash);
  const generatedBy = freshFactBorn[0]?.generatedBy ?? recs[0]?.generatedBy ?? null;
  return { recommendations: recs, generatedBy, stale };
}

type PracticeViewT = Extract<ViewSpec, { type: 'practice' }>;
type LinksViewT = Extract<ViewSpec, { type: 'links' }>;
type GalleryViewT = Extract<ViewSpec, { type: 'gallery' }>;

export function existingApps(ownerId: string): ExistingAppSummary[] {
  return apps.listApps(ownerId).filter((a) => !a.archivedAt).map((a) => ({
    id: a.id, name: a.name, purpose: a.purpose, pattern: a.pattern, tagline: a.tagline ?? undefined, capabilities: a.spec ? capabilitiesOf(a.spec) : [],
    defaultMinutes: a.spec?.views.find((v): v is PracticeViewT => v.type === 'practice')?.presets[0],
    minutePresets: a.spec?.views.find((v): v is PracticeViewT => v.type === 'practice')?.presets,
    icon: { symbol: a.iconSymbol, color: a.iconColor } as ExistingAppSummary['icon'],
  }));
}

/**
 * Why a proposal can no longer be made or changed, or null. Checked when it is opened and again at every
 * write: a card set aside, or one whose cited memory or shared items are gone, is never applied from a cache.
 */
export function staleReason(ownerId: string, rec: Recommendation): string | null {
  if (rec.status === 'stale' || rec.status === 'dismissed') return 'What this was based on changed since it was suggested. Refresh your app ideas or ask your AI again.';
  if (rec.evidenceFactIds.length) {
    const live = new Set(ctx.approvedFacts(ownerId).map((f) => f.id));
    if (rec.evidenceFactIds.some((id) => !live.has(id))) return 'Something from your memory that this was based on was removed. Refresh your app ideas or ask your AI again.';
  }
  const cites = [...rec.sourceCaptureIds, ...(rec.captureId ? [rec.captureId] : [])];
  if (cites.some((cid) => !captures.getCapture(ownerId, cid))) return 'Something you shared that this was based on was forgotten. Ask your AI again.';
  return null;
}

const staleBody = (reason: string) => ({ error: reason, code: 'stale_proposal' as const });

/** Defaults a view's own form starts with, plus its filter value (the kind of entry). */
function formDefaults(spec: AppSpec, view: ViewSpec): Record<string, unknown> {
  const all = defaultValues(spec);
  const ids = new Set(formFieldsFor(spec, view).map((f) => f.id));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) if (ids.has(k)) out[k] = v;
  if (view.filter) out[view.filter.fieldId] = view.filter.value;
  return out;
}

/** One key per link, whatever share it came in with (a trailing slash does not make another link). */
function linkKey(url: string): string {
  try {
    return new URL(url).href.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/**
 * Make mine carries what the proposal promised into the new app, once and in the same transaction: a
 * shared link becomes a saved source, a shared photo the first gallery entry. Each goes through the same
 * validation and ownership checks as any entry, and is marked as carried (never counted as an action).
 * Two shares of the same link or photo are carried once.
 */
function carryOver(ownerId: string, appId: string, spec: AppSpec, rec: Recommendation): string[] {
  const done: string[] = [];
  const cites = [...new Set([...(rec.captureId ? [rec.captureId] : []), ...rec.sourceCaptureIds])];
  const links = spec.views.find((v): v is LinksViewT => v.type === 'links');
  const gallery = spec.views.find((v): v is GalleryViewT => v.type === 'gallery');
  const carried = new Set<string>();
  for (const cid of cites.slice(0, 3)) {
    const cap = captures.getCapture(ownerId, cid);
    if (!cap) continue;
    if (cap.url && links) {
      const key = `link:${linkKey(cap.url)}`;
      if (carried.has(key)) continue;
      const values = formDefaults(spec, links);
      values[links.urlFieldId] = cap.url;
      if (links.titleFieldId) values[links.titleFieldId] = (cap.linkMeta?.title || cap.sourceLabel).slice(0, 120);
      if (links.noteFieldId && cap.text.trim()) values[links.noteFieldId] = cap.text.trim().slice(0, 300);
      const v = validateValues(spec, values);
      if (!v.ok) continue;
      apps.createRecord(ownerId, appId, v.values, { origin: 'carried' });
      carried.add(key);
      done.push(`Your link is saved in “${links.title ?? 'Saved sources'}”${cap.readStatus === 'read' ? '' : '; the page itself was not read'}.`);
    } else if (cap.mediaId && gallery && ownedMediaIds(ownerId, [cap.mediaId]).has(cap.mediaId)) {
      const key = `photo:${cap.mediaId}`;
      if (carried.has(key)) continue;
      const values = formDefaults(spec, gallery);
      values[gallery.imageFieldId] = cap.mediaId;
      const v = validateValues(spec, values);
      if (!v.ok) continue;
      apps.createRecord(ownerId, appId, v.values, { origin: 'carried' });
      carried.add(key);
      done.push(`Your photo is the first entry in “${gallery.title ?? 'the gallery'}”; add what you noticed when you open it.`);
    }
  }
  return done;
}

recommendationRoutes.get('/', (c) => c.json(overview(c.get('user').id)));

recommendationRoutes.post('/generate', async (c) => {
  const user = c.get('user');
  const gate = premiumGate(c);
  if (gate) return gate;
  const body = z.object({ count: z.number().int().min(3).max(6).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const count = body.success ? body.data.count ?? 4 : 4;
  const facts = ctx.approvedFacts(user.id);
  const recent = captures.listCaptures(user.id, 5).map((cap) => ({ id: cap.id, kind: cap.kind, text: cap.text, url: cap.url, linkMeta: cap.linkMeta, readStatus: cap.readStatus }));
  if (facts.length === 0 && recent.length === 0) return c.json({ error: 'Share one interest or inspiration first so the Playground has something to work from.', code: 'no_context' }, 409);
  const chosen = ctx.listSources(user.id).filter((s) => s.kind === 'chosen_interest');
  const chosenInterests = facts.filter((f) => f.sourceIds.some((id) => chosen.some((s) => s.id === id))).map((f) => f.value);
  const result = await withModel(user.id, 'recommend', (a) => a.recommend({ facts, existingApps: existingApps(user.id), chosenInterests, recentCaptures: recent, count }));
  // Grounding guard: citations must be approved facts or the person's own captures; dedupe titles.
  const allowedFacts = new Set(facts.map((f) => f.id));
  const allowedCaptures = new Set(recent.map((r) => r.id));
  const owned = apps.listApps(user.id);
  const appIds = new Set(owned.map((a) => a.id));
  const openAppIds = new Set(owned.filter((a) => !a.archivedAt).map((a) => a.id));
  const seen = new Set<string>();
  const drafts = result.data
    // Playground cards never carry an entry draft: adding an entry starts from something shared with the Agent.
    .map((r) => ({ ...r, recordDraft: undefined, evidenceFactIds: r.evidenceFactIds.filter((id) => allowedFacts.has(id)), sourceCaptureIds: r.sourceCaptureIds.filter((id) => allowedCaptures.has(id)) }))
    .filter((r) => r.evidenceFactIds.length > 0 || r.sourceCaptureIds.length > 0)
    .filter((r) => r.kind !== 'update_app' || (r.targetAppId && appIds.has(r.targetAppId)))
    .filter((r) => r.kind !== 'use_app' || (r.targetAppId && openAppIds.has(r.targetAppId)))
    .map((r) => groundExplorations(r, recent.map((c) => c.url)))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => (seen.has(r.title.toLowerCase()) ? false : (seen.add(r.title.toLowerCase()), true)))
    .slice(0, count);
  if (!drafts.length) return c.json({ error: 'We could not produce grounded suggestions from this context. Share a few more specifics and try again.', code: 'model_unavailable' }, 503);
  ctx.replaceFreshRecommendations(user.id, drafts, result.generatedBy, ctx.factsHash(facts));
  return c.json({ ...overview(user.id), fallbackReason: result.fallbackReason });
});

recommendationRoutes.get('/:id', (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec) return c.json(notFound, 404);
  const evidence = ctx.listFacts(user.id).filter((f) => rec.evidenceFactIds.includes(f.id));
  const cites = new Set([...(rec.sourceCaptureIds ?? []), ...(rec.captureId ? [rec.captureId] : [])]);
  const caps = [...cites].map((cid) => captures.getCapture(user.id, cid)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const target = rec.targetAppId ? apps.getApp(user.id, rec.targetAppId) : null;
  const open = rec.status === 'fresh' || rec.status === 'stale' || rec.status === 'dismissed';
  const dto: ProposalDetailDto = {
    recommendation: rec, evidence, captures: caps, targetApp: target ? apps.toSummary(target, target.recordCount) : null,
    stale: open ? staleReason(user.id, rec) : null,
  };
  return c.json(dto);
});

recommendationRoutes.post('/:id/dismiss', (c) => {
  const ownerId = c.get('user').id;
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const rec = ctx.getRecommendation(ownerId, id.data);
  if (!rec) return c.json(notFound, 404);
  if (rec.status === 'dismissed') return c.json({ ok: true });
  // A card that was already made, added or kept is history; "not for me" cannot rewrite it.
  if (rec.status !== 'fresh' && rec.status !== 'stale') return c.json({ error: 'This one was already used.', code: 'invalid' }, 409);
  ctx.setRecommendationStatus(ownerId, rec.id, 'dismissed');
  return c.json({ ok: true });
});

/**
 * "Just keep it": the shared item stays saved as a source; no app, and no memory. Anything the agent
 * noted from this item alone is removed again, so a save never turns into a permanent interest (what
 * the person confirmed or edited in Memory, or another share also says, stays).
 */
recommendationRoutes.post('/:id/keep', (c) => {
  const ownerId = c.get('user').id;
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const rec = ctx.getRecommendation(ownerId, id.data);
  if (!rec) return c.json(notFound, 404);
  if (rec.status === 'kept') return c.json({ ok: true, forgotten: 0 });
  if (rec.status !== 'fresh' && rec.status !== 'stale') return c.json({ error: 'This one was already used.', code: 'invalid' }, 409);
  const forgotten = transaction(() => {
    ctx.setRecommendationStatus(ownerId, rec.id, 'kept');
    return rec.captureId ? ctx.forgetLearnedFrom(ownerId, rec.captureId) : [];
  });
  return c.json({ ok: true, forgotten: forgotten.length });
});

const DraftBody = z.object({ instructions: z.string().max(4000).default(''), choices: BuildChoicesSchema.optional() });

/** Design the app and return the real spec plus example content so the renderer can preview it. */
recommendationRoutes.post('/:id/draft', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const gate = premiumGate(c);
  if (gate) return gate;
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec) return c.json(notFound, 404);
  if (rec.kind !== 'new_app') return c.json({ error: 'This suggestion is not an app to make. Follow its steps, open the app it points to, or ask your AI to make something from it.', code: 'invalid' }, 400);
  const stale = rec.status === 'built' ? null : staleReason(user.id, rec);
  if (stale) return c.json(staleBody(stale), 409);
  const body = DraftBody.safeParse(await c.req.json().catch(() => ({})));
  const instructions = body.success ? body.data.instructions : '';
  const choices = body.success ? body.data.choices : undefined;
  const facts = ctx.approvedFacts(user.id);
  const cites = new Set([...(rec.sourceCaptureIds ?? []), ...(rec.captureId ? [rec.captureId] : [])]);
  const caps = [...cites].map((cid) => captures.getCapture(user.id, cid)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((cap) => ({ id: cap.id, kind: cap.kind, text: cap.text, url: cap.url, linkMeta: cap.linkMeta, readStatus: cap.readStatus }));
  const result = await withModel(user.id, 'generate', (a) => a.generateSpec({ recommendation: rec, instructions, facts, captures: caps, choices }));
  const dto: ProposalPreviewDto = {
    spec: result.data.spec,
    description: result.data.description,
    unsupported: result.data.unsupported,
    generatedBy: result.generatedBy,
    fallbackReason: result.fallbackReason,
    previewRecords: previewRecords(result.data.spec),
  };
  return c.json(dto);
});

const BuildBody = z.object({ spec: AppSpecSchema, description: z.string().max(600).optional(), instructions: z.string().max(4000).optional() });

/**
 * Make mine: the previewed spec becomes a real app at its own stable URL. Idempotent per proposal: a
 * retry after a lost response, a second tap or a second tab returns the app that was already made.
 */
recommendationRoutes.post('/:id/build', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  if (!premiumActive(user)) return c.json({ error: PAUSED_MESSAGE, code: 'premium_paused' }, 403);
  const body = BuildBody.safeParse(await c.req.json().catch(() => null));
  // State is read only after the body: from here on nothing awaits, so two taps cannot both build.
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec) return c.json(notFound, 404);
  // A malformed request is always a 400, even for a proposal that was already made (never a false success).
  if (!body.success) return c.json({ error: 'That app definition is not valid. Preview it again and retry.', code: 'invalid_spec', details: body.error.issues.slice(0, 5) }, 400);
  if (rec.status === 'built' && rec.builtAppId) {
    const made = apps.getApp(user.id, rec.builtAppId);
    const made_spec = made ? apps.getSpec(user.id, made.id) : null;
    if (made && made_spec) {
      const dto: BuildResponseDto = { app: apps.toSummary(made, made.recordCount), spec: made_spec.spec, version: made_spec.version, canUndo: made_spec.version > 1, alreadyBuilt: true };
      return c.json(dto, 200);
    }
  }
  if (rec.kind !== 'new_app') return c.json({ error: 'This suggestion is not a new app.', code: 'invalid' }, 400);
  const stale = staleReason(user.id, rec);
  if (stale) return c.json(staleBody(stale), 409);
  const problems = checkBindings(body.data.spec);
  if (problems.length) return c.json({ error: `This design has a problem: ${problems[0]} Preview it again.`, code: 'invalid_spec', details: problems }, 400);
  const spec = body.data.spec;
  const made = transaction(() => {
    const app = apps.createApp({
      ownerId: user.id,
      spec,
      changeSummary: body.data.instructions?.trim() ? `Made from “${rec.title}” with your choices: ${body.data.instructions.trim().slice(0, 160)}` : `Made from “${rec.title}”`,
      origin: 'build',
      sourceRecommendationId: rec.id,
      sourceCaptureId: rec.captureId ?? rec.sourceCaptureIds?.[0] ?? null,
    });
    const carried = carryOver(user.id, app.id, spec, rec);
    ctx.setRecommendationStatus(user.id, rec.id, 'built', app.id);
    return { appId: app.id, carried };
  });
  const app = apps.getApp(user.id, made.appId);
  const stored = apps.getSpec(user.id, made.appId);
  if (!app || !stored) return c.json(notFound, 404);
  const dto: BuildResponseDto = { app: apps.toSummary(app, app.recordCount), spec: stored.spec, version: stored.version, canUndo: false, carried: made.carried };
  return c.json(dto, 201);
});

/** update_app: turn the proposal's change request into a readable preview on the target app. */
recommendationRoutes.post('/:id/update-preview', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const gate = premiumGate(c);
  if (gate) return gate;
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec || rec.kind !== 'update_app') return c.json(notFound, 404);
  const stale = staleReason(user.id, rec);
  if (stale) return c.json(staleBody(stale), 409);
  // A proposal never points at an app that was deleted (the repo leaves the target out): that app is gone.
  const current = rec.targetAppId ? apps.getSpec(user.id, rec.targetAppId) : null;
  if (!current || !rec.targetAppId) return c.json({ error: 'That app is no longer in your collection.', code: 'not_found' }, 404);
  const body = z.object({ extra: z.string().max(1000).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const request = [rec.updateRequest ?? rec.description, body.success ? body.data.extra : ''].filter(Boolean).join('. ').slice(0, 2000);
  const records = (apps.listRecords(user.id, rec.targetAppId) ?? []).slice(0, 5).map((r) => ({ values: r.values, createdAt: r.createdAt }));
  const reservedFieldIds = [...reservedFor(user.id, rec.targetAppId).keys()];
  const result = await withModel(user.id, 'revise', (a) => a.proposeRevision({ spec: current.spec, request, sampleRecords: records, reservedFieldIds }));
  const dry = guardRevision(user.id, rec.targetAppId, current.spec, result.data.ops);
  if (!dry.spec) return c.json({ error: 'We could not turn that into a safe change for this app.', code: 'invalid', details: dry.errors }, 422);
  if (dry.blocked.length) return c.json({ error: dry.blocked.join(' '), code: 'apply_incompatible', details: dry.blocked }, 409);
  const stored = saveProposal({ appId: rec.targetAppId, ownerId: user.id, baseVersion: current.version, request, proposal: result.data, generatedBy: result.generatedBy });
  const dto: RevisionPreviewDto & { appId: string } = {
    appId: rec.targetAppId,
    proposalId: stored.id,
    summary: result.data.summary,
    changes: dry.changes,
    ops: result.data.ops,
    unsupported: result.data.unsupported,
    previewSpec: dry.spec,
    generatedBy: result.generatedBy,
    fallbackReason: result.fallbackReason,
    baseVersion: current.version,
  };
  return c.json(dto);
});

/** After the person accepts an update (or saves the suggested entry) in the target app, the proposal is marked applied. */
recommendationRoutes.post('/:id/applied', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const rec = ctx.getRecommendation(c.get('user').id, id.data);
  if (!rec) return c.json(notFound, 404);
  if (rec.kind !== 'update_app' && rec.kind !== 'use_app') return c.json({ error: 'Only changes to an app you have can be marked applied.', code: 'invalid' }, 400);
  if (rec.status !== 'applied') ctx.setRecommendationStatus(c.get('user').id, rec.id, 'applied', rec.targetAppId ?? undefined);
  return c.json({ ok: true });
});
