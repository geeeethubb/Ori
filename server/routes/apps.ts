/** Apps, records, versions, revisions (apply/undo), export/import, events. All owner-scoped. */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.ts';
import { APP_ID_PATTERN, SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { AppSpecSchema, type AppSpec } from '../../shared/appSpec.ts';
import { imageMediaIds, validateValues } from '../../shared/records.ts';
import { ownedMediaIds } from '../repos/media.ts';
import { RevisionOpSchema, applyRevision } from '../../shared/revision.ts';
import { EVENT_TYPES } from '../../shared/context.ts';
import type { AppDetailDto, AppExportDto } from '../../shared/api.ts';
import * as repo from '../repos/apps.ts';
import { fixtureSpec, FIXTURES } from '../fixtures/specs.ts';
import { transaction } from '../db/index.ts';

export const appRoutes = new Hono<AuthEnv>();
appRoutes.use('*', requireAuth);

const appIdParam = z.string().regex(APP_ID_PATTERN);
const recordIdParam = z.string().regex(SHORT_ID_PATTERN);

function detail(ownerId: string, appId: string): AppDetailDto | null {
  const app = repo.getApp(ownerId, appId);
  if (!app) return null;
  const current = repo.getSpec(ownerId, appId);
  if (!current) return null;
  return { app: repo.toSummary(app, app.recordCount), spec: current.spec, version: current.version, canUndo: current.version > 1 };
}

const notFound = { error: 'We could not find that app in your collection.', code: 'not_found' } as const;

// ---------- collection ----------

appRoutes.get('/', (c) => {
  const apps = repo.listApps(c.get('user').id).map((a) => repo.toSummary(a, a.recordCount));
  return c.json({ apps });
});

/** Create an app from a clearly labeled fixture (sample mode / development / tests). */
appRoutes.post('/from-fixture', async (c) => {
  const body = z.object({ fixture: z.enum(Object.keys(FIXTURES) as [string, ...string[]]), name: z.string().trim().min(1).max(60).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Unknown fixture.', code: 'invalid' }, 400);
  const spec = fixtureSpec(body.data.fixture) as AppSpec;
  if (body.data.name) spec.name = body.data.name;
  const app = repo.createApp({ ownerId: c.get('user').id, spec, changeSummary: 'Created from a sample template', origin: 'build', isSample: true });
  return c.json(detail(c.get('user').id, app.id), 201);
});

/** Create an app from a full spec (used by the build flow and by import). */
appRoutes.post('/', async (c) => {
  const body = z.object({ spec: AppSpecSchema, changeSummary: z.string().max(300).optional(), sourceRecommendationId: z.string().max(40).optional() })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'That app definition is not valid.', code: 'invalid_spec', details: body.error.issues.slice(0, 5) }, 400);
  const app = repo.createApp({ ownerId: c.get('user').id, spec: body.data.spec, changeSummary: body.data.changeSummary, sourceRecommendationId: body.data.sourceRecommendationId });
  return c.json(detail(c.get('user').id, app.id), 201);
});

appRoutes.get('/:appId', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const d = detail(c.get('user').id, id.data);
  if (!d) return c.json(notFound, 404);
  return c.json(d);
});

appRoutes.patch('/:appId', async (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const body = z.object({ pinned: z.boolean().optional(), archived: z.boolean().optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid request.', code: 'invalid' }, 400);
  const app = repo.updateAppFlags(c.get('user').id, id.data, body.data);
  if (!app) return c.json(notFound, 404);
  return c.json(detail(c.get('user').id, id.data));
});

appRoutes.delete('/:appId', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  if (!repo.deleteApp(c.get('user').id, id.data)) return c.json(notFound, 404);
  return c.json({ ok: true });
});

// ---------- records ----------

appRoutes.get('/:appId/records', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const records = repo.listRecords(c.get('user').id, id.data);
  if (!records) return c.json(notFound, 404);
  return c.json({ records });
});

appRoutes.post('/:appId/records', async (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const current = repo.getSpec(c.get('user').id, id.data);
  if (!current) return c.json(notFound, 404);
  const body = z.object({ values: z.record(z.string(), z.unknown()) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid record.', code: 'invalid' }, 400);
  const v = validateValues(current.spec, body.data.values);
  if (!v.ok) return c.json({ error: 'Some fields need attention.', code: 'validation', details: v.errors }, 422);
  const photoProblem = foreignPhotos(c.get('user').id, current.spec, v.values);
  if (photoProblem) return c.json({ error: 'Some fields need attention.', code: 'validation', details: photoProblem }, 422);
  const record = repo.createRecord(c.get('user').id, id.data, v.values);
  return c.json({ record }, 201);
});

appRoutes.patch('/:appId/records/:recordId', async (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  const rid = recordIdParam.safeParse(c.req.param('recordId'));
  if (!id.success || !rid.success) return c.json(notFound, 404);
  const current = repo.getSpec(c.get('user').id, id.data);
  if (!current) return c.json(notFound, 404);
  const body = z.object({ values: z.record(z.string(), z.unknown()) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid record.', code: 'invalid' }, 400);
  const v = validateValues(current.spec, body.data.values, { partial: true });
  if (!v.ok) return c.json({ error: 'Some fields need attention.', code: 'validation', details: v.errors }, 422);
  const photoProblem = foreignPhotos(c.get('user').id, current.spec, v.values);
  if (photoProblem) return c.json({ error: 'Some fields need attention.', code: 'validation', details: photoProblem }, 422);
  const before = repo.getRecord(c.get('user').id, id.data, rid.data);
  const record = repo.updateRecord(c.get('user').id, id.data, rid.data, v.values);
  if (!record) return c.json({ error: 'That item no longer exists.', code: 'not_found' }, 404);
  // Task completion event: a done-stage or done-checkbox transition.
  for (const rule of current.spec.rules) {
    if (rule.type !== 'due_soon') continue;
    const wasDone = before ? isDoneValues(before.values, rule) : false;
    const nowDone = isDoneValues(record.values, rule);
    if (!wasDone && nowDone) repo.recordEvent(id.data, 'task_completed', { recordId: record.id });
  }
  return c.json({ record });
});

/** Image values must be photos in the owner's own library; returns per-field errors otherwise. */
function foreignPhotos(ownerId: string, spec: AppSpec, values: Record<string, unknown>): Record<string, string> | null {
  const ids = imageMediaIds(spec, values);
  if (!ids.length) return null;
  const owned = ownedMediaIds(ownerId, ids);
  const errors: Record<string, string> = {};
  for (const f of spec.fields) {
    if (f.type !== 'image') continue;
    const v = values[f.id];
    if (typeof v === 'string' && ids.includes(v) && !owned.has(v)) errors[f.id] = 'That photo is not in your library';
  }
  return Object.keys(errors).length ? errors : null;
}

function isDoneValues(values: Record<string, unknown>, rule: { doneFieldId?: string; stageFieldId?: string; doneStageValues?: string[] }): boolean {
  if (rule.doneFieldId && values[rule.doneFieldId] === true) return true;
  if (rule.stageFieldId && rule.doneStageValues?.length) {
    const s = values[rule.stageFieldId];
    return typeof s === 'string' && rule.doneStageValues.includes(s);
  }
  return false;
}

appRoutes.delete('/:appId/records/:recordId', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  const rid = recordIdParam.safeParse(c.req.param('recordId'));
  if (!id.success || !rid.success) return c.json(notFound, 404);
  if (!repo.deleteRecord(c.get('user').id, id.data, rid.data)) return c.json({ error: 'That item no longer exists.', code: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ---------- versions & revisions ----------

appRoutes.get('/:appId/versions', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  if (!repo.getApp(c.get('user').id, id.data)) return c.json(notFound, 404);
  return c.json({ versions: repo.listVersions(c.get('user').id, id.data) });
});

/** Apply explicit operations (used after the user accepts a preview, or by tests). */
appRoutes.post('/:appId/revisions/apply', async (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const current = repo.getSpec(c.get('user').id, id.data);
  if (!current) return c.json(notFound, 404);
  const body = z.object({
    ops: z.array(RevisionOpSchema).min(1).max(20),
    summary: z.string().trim().min(1).max(300).optional(),
    baseVersion: z.number().int().optional(),
    proposalId: z.string().max(40).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Those changes are not valid.', code: 'invalid', details: body.error.issues.slice(0, 5) }, 400);
  if (body.data.baseVersion !== undefined && body.data.baseVersion !== current.version) {
    return c.json({ error: 'The app changed since this preview was made. Reload and try again.', code: 'stale_preview' }, 409);
  }
  const result = applyRevision(current.spec, body.data.ops);
  if (!result.ok || !result.spec) return c.json({ error: 'Those changes could not be applied.', code: 'apply_failed', details: result.errors }, 422);
  const summary = body.data.summary ?? result.changes.join(' ');
  const { version } = repo.appendVersion(c.get('user').id, id.data, result.spec, summary, 'revision');
  repo.recordEvent(id.data, 'revision_accepted', { version, proposalId: body.data.proposalId ?? null });
  if (body.data.proposalId) markProposal(body.data.proposalId, 'accepted');
  return c.json({ ...detail(c.get('user').id, id.data), changes: result.changes });
});

/** Undo: append a version whose spec equals the previous version (history stays linear). */
appRoutes.post('/:appId/revisions/undo', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const app = repo.getApp(c.get('user').id, id.data);
  if (!app) return c.json(notFound, 404);
  if (app.currentVersion <= 1) return c.json({ error: 'This is the first version; nothing to undo.', code: 'nothing_to_undo' }, 409);
  const versions = repo.listVersions(c.get('user').id, id.data);
  const current = versions.find((v) => v.version === app.currentVersion);
  const previous = versions.find((v) => v.version === app.currentVersion - 1);
  if (!previous || !current) return c.json(notFound, 404);
  // If the current version is itself an undo, undoing again restores what was undone (redo).
  const { version } = repo.appendVersion(c.get('user').id, id.data, previous.spec, `Undo: back to version ${previous.version}`, 'undo');
  repo.recordEvent(id.data, 'revision_undone', { version, restored: previous.version });
  return c.json(detail(c.get('user').id, id.data));
});

function markProposal(proposalId: string, status: string): void {
  // Lazy import avoids a cycle with the revisions module which owns proposals.
  import('../repos/proposals.ts').then((m) => m.setProposalStatus(proposalId, status)).catch(() => undefined);
}

// ---------- export / import ----------

appRoutes.get('/:appId/export', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const ownerId = c.get('user').id;
  const app = repo.getApp(ownerId, id.data);
  if (!app) return c.json(notFound, 404);
  const body: AppExportDto = {
    format: 'ai-app-store/app-export',
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    app: { id: app.id, name: app.name, icon: repo.toSummary(app).icon, purpose: app.purpose as AppExportDto['app']['purpose'], createdAt: app.createdAt },
    versions: repo.listVersions(ownerId, id.data),
    records: repo.listRecords(ownerId, id.data) ?? [],
    events: repo.listEvents(ownerId, id.data, 1000),
  };
  c.header('Content-Disposition', `attachment; filename="${app.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'app'}-${app.id}.json"`);
  return c.json(body);
});

const ImportSchema = z.object({
  format: z.literal('ai-app-store/app-export'),
  exportVersion: z.literal(1),
  app: z.object({ id: z.string().optional(), name: z.string() }).passthrough(),
  versions: z.array(z.object({ version: z.number().int(), spec: AppSpecSchema, changeSummary: z.string().max(300), origin: z.string(), createdAt: z.string() })).min(1),
  records: z.array(z.object({ id: z.string().regex(SHORT_ID_PATTERN), values: z.record(z.string(), z.unknown()), createdAt: z.string(), updatedAt: z.string() })).max(5000),
});

/** Recreate an app (with history and records) from an export file. Always creates a new app ID. */
appRoutes.post('/import', async (c) => {
  const body = ImportSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'That file is not an AI App Store export.', code: 'invalid_import', details: body.error.issues.slice(0, 3) }, 400);
  const ownerId = c.get('user').id;
  const versions = [...body.data.versions].sort((a, b) => a.version - b.version);
  const first = versions[0]!;
  const appId = transaction(() => {
    const app = repo.createApp({ ownerId, spec: first.spec, changeSummary: `Imported: ${first.changeSummary}`, origin: 'import' });
    for (const v of versions.slice(1)) repo.appendVersion(ownerId, app.id, v.spec, v.changeSummary, 'import');
    const latest = versions[versions.length - 1]!.spec;
    for (const r of body.data.records) {
      const v = validateValues(latest, r.values, { partial: true });
      repo.createRecord(ownerId, app.id, v.values, { createdAt: r.createdAt });
    }
    return app.id;
  });
  return c.json(detail(ownerId, appId), 201);
});

// ---------- events ----------

appRoutes.get('/:appId/events', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  if (!repo.getApp(c.get('user').id, id.data)) return c.json(notFound, 404);
  return c.json({ events: repo.listEvents(c.get('user').id, id.data) });
});

appRoutes.post('/:appId/events', async (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  if (!repo.getApp(c.get('user').id, id.data)) return c.json(notFound, 404);
  const body = z.object({ type: z.enum(EVENT_TYPES), meta: z.record(z.string(), z.unknown()).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid event.', code: 'invalid' }, 400);
  // Only client-originated event types are accepted here; server-owned ones are derived.
  if (!['app_opened', 'install_guide_viewed', 'shortcut_requested', 'feedback_given', 'revision_declined', 'first_action_completed'].includes(body.data.type)) {
    return c.json({ error: 'That event is recorded automatically.', code: 'invalid' }, 400);
  }
  if (body.data.type === 'app_opened') repo.touchOpened(c.get('user').id, id.data);
  repo.recordEvent(id.data, body.data.type, body.data.meta);
  return c.json({ ok: true });
});
