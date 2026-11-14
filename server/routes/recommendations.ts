/**
 * Proposals: the Playground's fact-grounded recommendations and the Agent's capture-grounded
 * proposals share these routes. Preview ("what you would see"), Make mine, dismiss, keep, and
 * update-an-existing-app all live here.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { premiumActive, requireAuth, type AuthEnv } from '../auth.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { AppSpecSchema, capabilitiesOf } from '../../shared/appSpec.ts';
import { BuildChoicesSchema } from '../../shared/context.ts';
import { applyRevision } from '../../shared/revision.ts';
import type { ProposalDetailDto, ProposalPreviewDto, RecommendationsDto, RevisionPreviewDto } from '../../shared/api.ts';
import * as ctx from '../repos/context.ts';
import * as apps from '../repos/apps.ts';
import * as captures from '../repos/captures.ts';
import { saveProposal } from '../repos/proposals.ts';
import { withModel } from '../model/index.ts';
import type { ExistingAppSummary } from '../model/types.ts';
import { previewRecords } from '../services/previewContent.ts';
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

function existingApps(ownerId: string): ExistingAppSummary[] {
  return apps.listApps(ownerId).filter((a) => !a.archivedAt).map((a) => ({
    id: a.id, name: a.name, purpose: a.purpose, pattern: a.pattern, tagline: a.tagline ?? undefined, capabilities: a.spec ? capabilitiesOf(a.spec) : [],
  }));
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
  const appIds = new Set(apps.listApps(user.id).map((a) => a.id));
  const seen = new Set<string>();
  const drafts = result.data
    .map((r) => ({ ...r, evidenceFactIds: r.evidenceFactIds.filter((id) => allowedFacts.has(id)), sourceCaptureIds: r.sourceCaptureIds.filter((id) => allowedCaptures.has(id)) }))
    .filter((r) => r.evidenceFactIds.length > 0 || r.sourceCaptureIds.length > 0)
    .filter((r) => r.kind !== 'update_app' || (r.targetAppId && appIds.has(r.targetAppId)))
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
  const dto: ProposalDetailDto = { recommendation: rec, evidence, captures: caps, targetApp: target ? apps.toSummary(target, target.recordCount) : null };
  return c.json(dto);
});

recommendationRoutes.post('/:id/dismiss', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  if (!ctx.setRecommendationStatus(c.get('user').id, id.data, 'dismissed')) return c.json(notFound, 404);
  return c.json({ ok: true });
});

/** "Just keep it": the capture stays a source; no interest, no app. */
recommendationRoutes.post('/:id/keep', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  if (!ctx.setRecommendationStatus(c.get('user').id, id.data, 'kept')) return c.json(notFound, 404);
  return c.json({ ok: true });
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
  if (rec.kind === 'explore' || rec.kind === 'keep') return c.json({ error: 'This suggestion is not an app. Follow its steps, or ask the agent to make something from it.', code: 'invalid' }, 400);
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

/** Make mine: the previewed spec becomes a real app at its own stable URL. */
recommendationRoutes.post('/:id/build', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  if (!premiumActive(user)) return c.json({ error: PAUSED_MESSAGE, code: 'premium_paused' }, 403);
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec) return c.json(notFound, 404);
  const body = BuildBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'That app definition is not valid. Preview it again and retry.', code: 'invalid_spec', details: body.error.issues.slice(0, 5) }, 400);
  const app = apps.createApp({
    ownerId: user.id,
    spec: body.data.spec,
    changeSummary: body.data.instructions?.trim() ? `Made from “${rec.title}” with your choices: ${body.data.instructions.trim().slice(0, 160)}` : `Made from “${rec.title}”`,
    origin: 'build',
    sourceRecommendationId: rec.id,
    sourceCaptureId: rec.captureId ?? rec.sourceCaptureIds?.[0] ?? null,
  });
  ctx.setRecommendationStatus(user.id, rec.id, 'built', app.id);
  const spec = apps.getSpec(user.id, app.id);
  return c.json({ app: apps.toSummary(app, 0), spec: spec?.spec, version: spec?.version ?? 1, canUndo: false }, 201);
});

/** update_app: turn the proposal's change request into a readable preview on the target app. */
recommendationRoutes.post('/:id/update-preview', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const gate = premiumGate(c);
  if (gate) return gate;
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec || rec.kind !== 'update_app' || !rec.targetAppId) return c.json(notFound, 404);
  const current = apps.getSpec(user.id, rec.targetAppId);
  if (!current) return c.json({ error: 'That app is no longer in your collection.', code: 'not_found' }, 404);
  const body = z.object({ extra: z.string().max(1000).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const request = [rec.updateRequest ?? rec.description, body.success ? body.data.extra : ''].filter(Boolean).join('. ').slice(0, 2000);
  const records = (apps.listRecords(user.id, rec.targetAppId) ?? []).slice(0, 5).map((r) => ({ values: r.values, createdAt: r.createdAt }));
  const result = await withModel(user.id, 'revise', (a) => a.proposeRevision({ spec: current.spec, request, sampleRecords: records }));
  const dry = applyRevision(current.spec, result.data.ops);
  if (!dry.ok || !dry.spec) return c.json({ error: 'We could not turn that into a safe change for this app.', code: 'invalid', details: dry.errors }, 422);
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

/** After the person accepts an update preview on the target app, the proposal is marked applied. */
recommendationRoutes.post('/:id/applied', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const rec = ctx.getRecommendation(c.get('user').id, id.data);
  if (!rec) return c.json(notFound, 404);
  ctx.setRecommendationStatus(c.get('user').id, rec.id, 'applied', rec.targetAppId ?? undefined);
  return c.json({ ok: true });
});
