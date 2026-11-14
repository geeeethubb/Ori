/**
 * The Agent: share a thought, a link or a screenshot; get a concise, honest reply with proposals.
 * The capture is always saved first, so a model failure never loses what the person shared.
 * Links are never fetched by this server; only allowlisted oEmbed titles are looked up.
 */
import fs from 'node:fs';
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import type { AgentThreadDto, AgentThreadItemDto, CaptureResultDto } from '../../shared/api.ts';
import type { Capture, RecommendationDraft } from '../../shared/context.ts';
import { capabilitiesOf } from '../../shared/appSpec.ts';
import { config } from '../config.ts';
import { groundExplorations } from '../services/grounding.ts';
import * as captures from '../repos/captures.ts';
import * as ctx from '../repos/context.ts';
import * as apps from '../repos/apps.ts';
import * as media from '../repos/media.ts';
import { describeLinkSource, lookupLink, parseHttpUrl } from '../services/linkMeta.ts';
import { withModel } from '../model/index.ts';
import type { ExistingAppSummary } from '../model/types.ts';
import { premiumGate } from './gate.ts';

export const agentRoutes = new Hono<AuthEnv>();
agentRoutes.use('*', requireAuth);

const idParam = z.string().regex(SHORT_ID_PATTERN);
const notFound = { error: 'We could not find that in what you shared.', code: 'not_found' } as const;

function threadItem(ownerId: string, capture: Capture): AgentThreadItemDto {
  return {
    capture,
    media: capture.mediaId ? media.getMedia(ownerId, capture.mediaId) : null,
    reply: captures.getReply(ownerId, capture.id),
  };
}

function existingApps(ownerId: string): ExistingAppSummary[] {
  return apps.listApps(ownerId).filter((a) => !a.archivedAt).map((a) => ({
    id: a.id, name: a.name, purpose: a.purpose, pattern: a.pattern, tagline: a.tagline ?? undefined, capabilities: a.spec ? capabilitiesOf(a.spec) : [],
  }));
}

/** Ask the model about one capture, store the reply and its proposals. Throws only on unexpected errors. */
async function respond(ownerId: string, capture: Capture): Promise<CaptureResultDto> {
  const facts = ctx.approvedFacts(ownerId);
  const recent = captures.listCaptures(ownerId, 6).filter((c) => c.id !== capture.id).map((c) => ({ id: c.id, kind: c.kind, text: c.text, url: c.url, createdAt: c.createdAt }));
  let image: { mime: string; base64: string } | null = null;
  if (capture.mediaId) {
    const found = media.readMediaFile(ownerId, capture.mediaId);
    if (found && found.media.size <= config.maxImageBytes && /^image\/(jpeg|png|webp|gif)$/.test(found.media.mime)) {
      image = { mime: found.media.mime, base64: fs.readFileSync(found.path).toString('base64') };
    }
  }
  const result = await withModel(ownerId, 'respond', (a) =>
    a.respondToCapture({
      capture: { id: capture.id, kind: capture.kind, text: capture.text, url: capture.url, linkMeta: capture.linkMeta, readStatus: capture.readStatus, sourceLabel: capture.sourceLabel, image },
      facts,
      existingApps: existingApps(ownerId),
      recentCaptures: recent,
    }),
  );
  const draft = result.data;
  if (image && draft.imageRead && capture.readStatus !== 'read') {
    captures.updateCaptureReadStatus(ownerId, capture.id, 'read');
    capture = { ...capture, readStatus: 'read' };
  }
  // Grounding guard: cite only approved facts; always cite the capture itself.
  const allowed = new Set(facts.map((f) => f.id));
  const appIds = new Set(apps.listApps(ownerId).map((a) => a.id));
  const proposals: RecommendationDraft[] = draft.proposals
    .map((p) => ({
      ...p,
      evidenceFactIds: p.evidenceFactIds.filter((id) => allowed.has(id)),
      sourceCaptureIds: p.sourceCaptureIds.includes(capture.id) ? p.sourceCaptureIds : [capture.id, ...p.sourceCaptureIds].slice(0, 4),
    }))
    // An update proposal must point at one of the person's own apps.
    .filter((p) => p.kind !== 'update_app' || (p.targetAppId && appIds.has(p.targetAppId)))
    // Explorations may only link to pages the person shared.
    .map((p) => groundExplorations(p, [capture.url, ...recent.map((r) => r.url)]))
    .filter((p): p is RecommendationDraft => p !== null)
    .slice(0, 4);
  // Context learned from the note is stored as editable, clearly sourced memory.
  if (draft.learned.length) {
    const source = ctx.createSource(ownerId, { label: capture.sourceLabel, kind: 'capture', text: capture.text || capture.url || '' });
    const existing = new Set(ctx.listFacts(ownerId).map((f) => ctx.normalizeFact(f.value)));
    for (const f of draft.learned.slice(0, 6)) {
      if (existing.has(ctx.normalizeFact(f.value))) continue;
      ctx.insertFact(ownerId, { category: f.category, value: f.value, status: f.status, confidence: f.confidence, sourceIds: [source.id], evidence: f.evidence ?? null });
    }
  }
  const stored = ctx.insertCaptureProposals(ownerId, capture.id, proposals, result.generatedBy);
  captures.saveReply(ownerId, { captureId: capture.id, message: draft.message, question: draft.question ?? null, generatedBy: result.generatedBy, fallbackReason: result.fallbackReason ?? null });
  const reply = captures.getReply(ownerId, capture.id, stored);
  return { capture, media: capture.mediaId ? media.getMedia(ownerId, capture.mediaId) : null, reply };
}

agentRoutes.get('/thread', (c) => {
  const ownerId = c.get('user').id;
  const dto: AgentThreadDto = { items: captures.listCaptures(ownerId, 30).map((cap) => threadItem(ownerId, cap)) };
  return c.json(dto);
});

const CaptureBody = z.object({
  text: z.string().max(4000).optional().default(''),
  url: z.string().trim().max(2000).optional(),
  mediaId: z.string().regex(SHORT_ID_PATTERN).optional(),
  sourceLabel: z.string().trim().max(80).optional(),
});

agentRoutes.post('/captures', async (c) => {
  const user = c.get('user');
  const body = CaptureBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Share a thought, a link or a screenshot.', code: 'invalid' }, 400);
  const text = body.data.text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  const rawUrl = body.data.url?.trim();
  if (!text && !rawUrl && !body.data.mediaId) return c.json({ error: 'Share a thought, a link or a screenshot.', code: 'invalid' }, 400);
  if (captures.listCaptures(user.id, 1000).length >= 500) return c.json({ error: 'You have shared a lot. Forget a few older items in Settings first.', code: 'invalid' }, 409);

  let url: URL | null = null;
  if (rawUrl) {
    url = parseHttpUrl(rawUrl);
    if (!url) return c.json({ error: 'That link does not look like a web address (it should start with http:// or https://).', code: 'invalid' }, 400);
  }
  let mediaItem = null;
  if (body.data.mediaId) {
    mediaItem = media.getMedia(user.id, body.data.mediaId);
    if (!mediaItem) return c.json({ error: 'That photo is not in your library.', code: 'invalid' }, 400);
  }

  let readStatus: Capture['readStatus'] = text ? 'read' : 'not_read';
  let linkMeta = null;
  let note: string | undefined;
  if (url) {
    const lookup = await lookupLink(url);
    linkMeta = lookup.meta;
    readStatus = lookup.readStatus;
    note = lookup.note;
  }
  if (mediaItem) readStatus = 'not_read'; // until a model actually reads it
  const kind: Capture['kind'] = mediaItem ? 'image' : url ? 'link' : 'note';
  const sourceLabel = body.data.sourceLabel || (mediaItem ? 'Screenshot' : url ? describeLinkSource(url) : 'Typed note');
  const capture = captures.createCapture(user.id, { kind, text, url: url?.toString() ?? null, linkMeta, mediaId: mediaItem?.id ?? null, readStatus, sourceLabel });

  const gate = premiumGate(c);
  if (gate) {
    const g = (await gate.json()) as { error: string };
    return c.json({ capture, media: mediaItem, reply: null, error: g.error, linkNote: note } satisfies CaptureResultDto & { linkNote?: string }, 201);
  }
  try {
    const result = await respond(user.id, capture);
    return c.json({ ...result, linkNote: note }, 201);
  } catch (err) {
    console.error('[agent] respond failed', err);
    return c.json({ capture, media: mediaItem, reply: null, error: 'The agent could not answer right now. What you shared is saved; try again in a moment.', linkNote: note }, 201);
  }
});

agentRoutes.get('/captures/:id', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const capture = captures.getCapture(c.get('user').id, id.data);
  if (!capture) return c.json(notFound, 404);
  return c.json(threadItem(c.get('user').id, capture));
});

/** Retry the agent for a capture whose reply failed, or ask again. */
agentRoutes.post('/captures/:id/respond', async (c) => {
  const user = c.get('user');
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  const capture = captures.getCapture(user.id, id.data);
  if (!capture) return c.json(notFound, 404);
  const gate = premiumGate(c);
  if (gate) return gate;
  try {
    return c.json(await respond(user.id, capture));
  } catch (err) {
    console.error('[agent] respond failed', err);
    return c.json({ error: 'The agent could not answer right now. Try again in a moment.', code: 'model_unavailable' }, 503);
  }
});

/** Forget what was shared (its proposals go too). Apps built from it keep their own data. */
agentRoutes.delete('/captures/:id', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json(notFound, 404);
  if (!captures.deleteCapture(c.get('user').id, id.data)) return c.json(notFound, 404);
  return c.json({ ok: true });
});
