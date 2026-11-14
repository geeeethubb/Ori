/** For You: grounded recommendations, drafts, and building a real app from one. */
import { Hono } from 'hono';
import { z } from 'zod';
import { premiumActive, requireAuth, aiGenerationsThisMonth, type AuthEnv } from '../auth.ts';
import { config } from '../config.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { AppSpecSchema } from '../../shared/appSpec.ts';
import type { RecommendationsDto } from '../../shared/api.ts';
import * as ctx from '../repos/context.ts';
import * as apps from '../repos/apps.ts';
import { withModel } from '../model/index.ts';

export const recommendationRoutes = new Hono<AuthEnv>();
recommendationRoutes.use('*', requireAuth);

const idParam = z.string().regex(SHORT_ID_PATTERN);

function overview(ownerId: string): RecommendationsDto {
  const recs = ctx.listRecommendations(ownerId);
  const currentHash = ctx.factsHash(ctx.approvedFacts(ownerId));
  const fresh = recs.filter((r) => r.status === 'fresh');
  const stale = fresh.length > 0 && fresh.some((r) => r.inputHash !== currentHash);
  const generatedBy = fresh[0]?.generatedBy ?? recs[0]?.generatedBy ?? null;
  return { recommendations: recs, generatedBy, stale };
}

function premiumGate(c: { get: (k: 'user') => { id: string; plan: string; trialEndsAt: string }; json: (o: unknown, s: 403 | 429) => Response }): Response | null {
  const user = c.get('user');
  if (!premiumActive(user as Parameters<typeof premiumActive>[0])) {
    return c.json({ error: 'Your trial has ended. You can still open and export your apps; subscribe to keep creating and changing them.', code: 'premium_paused' }, 403);
  }
  if (aiGenerationsThisMonth(user.id) >= config.aiGenerationAllowance) {
    return c.json({ error: `You have used this month's AI allowance (${config.aiGenerationAllowance} generations). It resets next month.`, code: 'rate_limited' }, 429);
  }
  return null;
}

recommendationRoutes.get('/', (c) => c.json(overview(c.get('user').id)));

recommendationRoutes.post('/generate', async (c) => {
  const user = c.get('user');
  const gate = premiumGate(c);
  if (gate) return gate;
  const body = z.object({ count: z.number().int().min(3).max(6).optional() }).safeParse(await c.req.json().catch(() => ({})));
  const count = body.success ? body.data.count ?? 4 : 4;
  const facts = ctx.approvedFacts(user.id);
  if (facts.length === 0) return c.json({ error: 'Bring some context first so recommendations can be grounded in it.', code: 'no_context' }, 409);
  const chosen = ctx.listSources(user.id).filter((s) => s.kind === 'chosen_interest');
  const chosenInterests = facts.filter((f) => f.sourceIds.some((id) => chosen.some((s) => s.id === id))).map((f) => f.value);
  const existingApps = apps.listApps(user.id).filter((a) => !a.archivedAt).map((a) => ({ name: a.name, purpose: a.purpose, pattern: a.pattern }));
  const result = await withModel(user.id, 'recommend', (a) => a.recommend({ facts, existingApps, chosenInterests, count }));
  // Grounding guard: citations must be approved facts; dedupe titles.
  const allowed = new Set(facts.map((f) => f.id));
  const seen = new Set<string>();
  const drafts = result.data
    .map((r) => ({ ...r, evidenceFactIds: r.evidenceFactIds.filter((id) => allowed.has(id)) }))
    .filter((r) => r.evidenceFactIds.length > 0)
    .filter((r) => (seen.has(r.title.toLowerCase()) ? false : (seen.add(r.title.toLowerCase()), true)))
    .slice(0, count);
  if (!drafts.length) return c.json({ error: 'We could not produce grounded recommendations from this context. Add a few more specifics and try again.', code: 'model_unavailable' }, 503);
  ctx.replaceFreshRecommendations(user.id, drafts, result.generatedBy, ctx.factsHash(facts));
  return c.json({ ...overview(user.id), fallbackReason: result.fallbackReason });
});

recommendationRoutes.get('/:id', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  const rec = ctx.getRecommendation(c.get('user').id, id.data);
  if (!rec) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  const evidence = ctx.listFacts(c.get('user').id).filter((f) => rec.evidenceFactIds.includes(f.id));
  return c.json({ recommendation: rec, evidence });
});

recommendationRoutes.post('/:id/dismiss', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  if (!ctx.setRecommendationStatus(c.get('user').id, id.data, 'dismissed')) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  return c.json({ ok: true });
});

const DraftBody = z.object({ instructions: z.string().max(4000).default('') });

recommendationRoutes.post('/:id/draft', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  const gate = premiumGate(c);
  if (gate) return gate;
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  const body = DraftBody.safeParse(await c.req.json().catch(() => ({})));
  const instructions = body.success ? body.data.instructions : '';
  const facts = ctx.approvedFacts(user.id);
  const result = await withModel(user.id, 'generate', (a) => a.generateSpec({ recommendation: rec, instructions, facts }));
  return c.json({ spec: result.data.spec, description: result.data.description, unsupported: result.data.unsupported, generatedBy: result.generatedBy, fallbackReason: result.fallbackReason });
});

const BuildBody = z.object({ spec: AppSpecSchema, description: z.string().max(600).optional(), instructions: z.string().max(4000).optional() });

recommendationRoutes.post('/:id/build', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  if (!premiumActive(user)) return c.json({ error: 'Your trial has ended. You can still open and export your apps; subscribe to keep creating and changing them.', code: 'premium_paused' }, 403);
  const rec = ctx.getRecommendation(user.id, id.data);
  if (!rec) return c.json({ error: 'Recommendation not found.', code: 'not_found' }, 404);
  const body = BuildBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'That app definition is not valid. Preview it again and retry.', code: 'invalid_spec', details: body.error.issues.slice(0, 5) }, 400);
  const app = apps.createApp({
    ownerId: user.id,
    spec: body.data.spec,
    changeSummary: body.data.instructions?.trim() ? `Built from "${rec.title}" with your instructions: ${body.data.instructions.trim().slice(0, 160)}` : `Built from "${rec.title}"`,
    origin: 'build',
    sourceRecommendationId: rec.id,
  });
  ctx.setRecommendationStatus(user.id, rec.id, 'built', app.id);
  const spec = apps.getSpec(user.id, app.id);
  return c.json({ app: apps.toSummary(app, 0), spec: spec?.spec, version: spec?.version ?? 1, canUndo: false }, 201);
});
