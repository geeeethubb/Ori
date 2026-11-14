/** Natural-language revision preview, improvement suggestions, and feedback. */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.ts';
import { premiumGate } from './gate.ts';
import { APP_ID_PATTERN } from '../../shared/ids.ts';
import type { RevisionPreviewDto } from '../../shared/api.ts';
import * as apps from '../repos/apps.ts';
import { saveProposal } from '../repos/proposals.ts';
import { sampleAdapter, withModel } from '../model/index.ts';
import { guardRevision, reservedFor } from '../services/revisionGuards.ts';

export const revisionRoutes = new Hono<AuthEnv>();
revisionRoutes.use('*', requireAuth);

const appIdParam = z.string().regex(APP_ID_PATTERN);
const notFound = { error: 'We could not find that app in your collection.', code: 'not_found' } as const;

revisionRoutes.post('/:appId/revisions/preview', async (c) => {
  const user = c.get('user');
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const current = apps.getSpec(user.id, id.data);
  if (!current) return c.json(notFound, 404);
  const gate = premiumGate(c);
  if (gate) return gate;
  const body = z.object({ request: z.string().trim().min(3).max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Describe the change you want in a sentence.', code: 'invalid' }, 400);
  const records = (apps.listRecords(user.id, id.data) ?? []).slice(0, 5).map((r) => ({ values: r.values, createdAt: r.createdAt }));
  const reservedFieldIds = [...reservedFor(user.id, id.data).keys()];
  const result = await withModel(user.id, 'revise', (a) => a.proposeRevision({ spec: current.spec, request: body.data.request, sampleRecords: records, reservedFieldIds }));
  const dry = guardRevision(user.id, id.data, current.spec, result.data.ops);
  if (!dry.spec) {
    // Should not happen (adapters dry-run), but never show a broken preview.
    return c.json({ error: 'We could not turn that into a safe change. Try describing it differently, e.g. "add a field for …".', code: 'invalid', details: dry.errors }, 422);
  }
  if (dry.blocked.length) return c.json({ error: dry.blocked.join(' '), code: 'apply_incompatible', details: dry.blocked }, 409);
  const stored = saveProposal({ appId: id.data, ownerId: user.id, baseVersion: current.version, request: body.data.request, proposal: result.data, generatedBy: result.generatedBy });
  const dto: RevisionPreviewDto & { fallbackReason?: string; baseVersion: number } = {
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

/** Deterministic, free: suggestions from usage events use the sample rules in every mode. */
revisionRoutes.get('/:appId/suggestion', async (c) => {
  const user = c.get('user');
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const current = apps.getSpec(user.id, id.data);
  if (!current) return c.json(notFound, 404);
  const events = apps.listEvents(user.id, id.data, 500).map((e) => ({ type: e.type, at: e.at }));
  const records = (apps.listRecords(user.id, id.data) ?? []).map((r) => ({ values: r.values, createdAt: r.createdAt }));
  const result = await sampleAdapter.suggestImprovement({ spec: current.spec, events, records });
  return c.json({ suggestion: result.data ? { id: `${id.data}-${current.version}`, ...result.data } : null, generatedBy: 'sample' });
});

/** Explicit feedback: recorded as an event and turned into a suggestion (live model when available). */
revisionRoutes.post('/:appId/feedback', async (c) => {
  const user = c.get('user');
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const current = apps.getSpec(user.id, id.data);
  if (!current) return c.json(notFound, 404);
  const body = z.object({ text: z.string().trim().min(3).max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Tell us a little more.', code: 'invalid' }, 400);
  apps.recordEvent(id.data, 'feedback_given', { text: body.data.text.slice(0, 500) });
  const gate = premiumGate(c);
  if (gate) return c.json({ suggestion: null, generatedBy: 'sample', note: 'Thanks, noted. Suggestions from the model are paused on this plan.' });
  const events = apps.listEvents(user.id, id.data, 500).map((e) => ({ type: e.type, at: e.at }));
  const records = (apps.listRecords(user.id, id.data) ?? []).map((r) => ({ values: r.values, createdAt: r.createdAt }));
  const result = await withModel(user.id, 'suggest', (a) => a.suggestImprovement({ spec: current.spec, events, records, feedback: body.data.text }));
  return c.json({ suggestion: result.data ? { id: `${id.data}-fb-${Date.now()}`, ...result.data } : null, generatedBy: result.generatedBy, fallbackReason: result.fallbackReason });
});
