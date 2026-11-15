/** Your Context: import sources, review/edit facts, resolve conflicts, choose new interests. */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.ts';
import { FACT_CATEGORIES, MAX_SOURCES_PER_USER, MAX_SOURCE_CHARS } from '../../shared/context.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import * as ctx from '../repos/context.ts';
import * as captures from '../repos/captures.ts';
import { importSource } from '../services/contextImport.ts';
import { SAMPLE_PROFILES } from '../fixtures/sampleContext.ts';

export const contextRoutes = new Hono<AuthEnv>();
contextRoutes.use('*', requireAuth);

const idParam = z.string().regex(SHORT_ID_PATTERN);

/** Strip control characters (except newlines/tabs) and normalize line endings. */
function cleanText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

contextRoutes.get('/', (c) => {
  const ownerId = c.get('user').id;
  return c.json({ sources: ctx.listSources(ownerId), facts: ctx.listFacts(ownerId), captures: captures.listCaptures(ownerId, 100) });
});

const SourceBody = z.object({
  kind: z.enum(['paste', 'upload', 'manual']),
  label: z.string().trim().max(80).optional(),
  text: z.string().min(1),
});

contextRoutes.post('/sources', async (c) => {
  const ownerId = c.get('user').id;
  const body = SourceBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Paste or upload some text first.', code: 'invalid' }, 400);
  const text = cleanText(body.data.text);
  if (text.length < 20) return c.json({ error: 'That is too short to learn anything from. Add a few sentences about your projects and interests.', code: 'invalid' }, 400);
  if (text.length > MAX_SOURCE_CHARS) return c.json({ error: `That text is too long (max ${MAX_SOURCE_CHARS.toLocaleString()} characters). Split it into two imports.`, code: 'too_large' }, 413);
  // The sources made for shares with the agent are left out of this count: a share is not an import.
  if (ctx.countSources(ownerId) >= MAX_SOURCES_PER_USER) return c.json({ error: `You can keep up to ${MAX_SOURCES_PER_USER} sources, not counting what you shared with the agent. Remove one in What you've shared first.`, code: 'invalid' }, 409);
  const label = body.data.label || (body.data.kind === 'manual' ? 'Short profile' : body.data.kind === 'upload' ? 'Uploaded file' : 'Pasted summary');
  const outcome = await importSource(ownerId, { label, kind: body.data.kind, text });
  return c.json(outcome, 201);
});

contextRoutes.post('/sample', async (c) => {
  const ownerId = c.get('user').id;
  const body = z.object({ profile: z.enum(['founder-photographer', 'student-musician']) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Unknown sample profile.', code: 'invalid' }, 400);
  const profile = SAMPLE_PROFILES[body.data.profile];
  if (ctx.listSources(ownerId).some((s) => s.kind === 'sample' && s.label === profile.label)) {
    return c.json({ error: 'That sample is already in your context.', code: 'invalid' }, 409);
  }
  const outcome = await importSource(ownerId, { label: profile.label, kind: 'sample', text: profile.text });
  return c.json(outcome, 201);
});

contextRoutes.delete('/sources/:id', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Source not found.', code: 'not_found' }, 404);
  const res = ctx.deleteSource(c.get('user').id, id.data);
  if (!res.ok) return c.json({ error: 'Source not found.', code: 'not_found' }, 404);
  return c.json(res);
});

contextRoutes.post('/facts', async (c) => {
  const ownerId = c.get('user').id;
  const body = z.object({ category: z.enum(FACT_CATEGORIES), value: z.string().trim().min(3).max(240) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Write a short fact (3 to 240 characters) and pick a category.', code: 'invalid' }, 400);
  let manual = ctx.listSources(ownerId).find((s) => s.kind === 'manual' && s.label === 'Added by you');
  if (!manual) manual = ctx.createSource(ownerId, { label: 'Added by you', kind: 'manual', text: '' });
  const fact = ctx.insertFact(ownerId, { ...body.data, status: 'confirmed', confidence: 1, sourceIds: [manual.id] });
  return c.json({ fact }, 201);
});

contextRoutes.patch('/facts/:id', async (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Fact not found.', code: 'not_found' }, 404);
  const body = z.object({
    value: z.string().trim().min(3).max(240).optional(),
    category: z.enum(FACT_CATEGORIES).optional(),
    status: z.enum(['confirmed', 'removed']).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid change.', code: 'invalid' }, 400);
  // A new value or category is the person correcting the fact, so it is confirmed (unless they remove it).
  const corrected = body.data.value !== undefined || body.data.category !== undefined;
  const patch = { ...body.data, ...(corrected ? { confidence: 1, status: body.data.status ?? ('confirmed' as const) } : {}) };
  const fact = ctx.updateFact(c.get('user').id, id.data, patch);
  if (!fact) return c.json({ error: 'Fact not found.', code: 'not_found' }, 404);
  return c.json({ fact });
});

contextRoutes.post('/facts/:id/keep', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Fact not found.', code: 'not_found' }, 404);
  if (!ctx.getFact(c.get('user').id, id.data)) return c.json({ error: 'Fact not found.', code: 'not_found' }, 404);
  return c.json({ facts: ctx.keepFact(c.get('user').id, id.data) });
});

contextRoutes.post('/interests', async (c) => {
  const ownerId = c.get('user').id;
  const body = z.object({ interest: z.string().trim().min(2).max(120) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Tell us the interest in a few words.', code: 'invalid' }, 400);
  const source = ctx.createSource(ownerId, { label: `Chosen interest: ${body.data.interest}`, kind: 'chosen_interest', text: body.data.interest });
  const fact = ctx.insertFact(ownerId, { category: 'interest', value: `I want to start exploring ${body.data.interest}`, status: 'confirmed', confidence: 1, sourceIds: [source.id] });
  return c.json({ fact, source: { ...source, text: '' } }, 201);
});
