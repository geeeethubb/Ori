/** Apps, records, versions, revisions (apply/undo), export/import, events. All owner-scoped. */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.ts';
import { APP_ID_PATTERN, SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { AppSpecSchema, type AppSpec } from '../../shared/appSpec.ts';
import { BLANK_GALLERY_ENTRY, blankGalleryEntry, imageMediaIds, validateValues } from '../../shared/records.ts';
import { ownedMediaIds } from '../repos/media.ts';
import { RevisionOpSchema, planUndo, reservedFieldTypes } from '../../shared/revision.ts';
import { EVENT_TYPES } from '../../shared/context.ts';
import type { AppDetailDto, AppExportDto, UndoPreviewDto } from '../../shared/api.ts';
import * as repo from '../repos/apps.ts';
import * as ctx from '../repos/context.ts';
import { getProposal, setProposalStatus } from '../repos/proposals.ts';
import { fixtureSpec, FIXTURES } from '../fixtures/specs.ts';
import { transaction } from '../db/index.ts';
import { guardRevision } from '../services/revisionGuards.ts';
import { staleReason } from './recommendations.ts';

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

const CreateRecordBody = z.object({
  values: z.record(z.string(), z.unknown()),
  /** Client-minted id: a retry or a second tap with the same id returns the first save instead of a copy. */
  id: z.string().regex(SHORT_ID_PATTERN).optional(),
  /** The Agent proposal (use an app you have) this entry came from; marked used in the same step. */
  recommendationId: z.string().regex(SHORT_ID_PATTERN).optional(),
});

appRoutes.post('/:appId/records', async (c) => {
  const ownerId = c.get('user').id;
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const body = CreateRecordBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid record.', code: 'invalid' }, 400);
  // From here on everything is synchronous, so two submits of the same entry cannot interleave.
  const current = repo.getSpec(ownerId, id.data);
  if (!current) return c.json(notFound, 404);
  const v = validateValues(current.spec, body.data.values);
  if (body.data.id) {
    const taken = repo.recordIdOwner(body.data.id);
    if (taken) {
      // This person deleted that entry in this app (the app is theirs: getSpec checked the owner). Say so,
      // so the client can save it again as a new entry; any other app's or person's id stays a generic 400.
      if (taken.appId === id.data && taken.deleted) return c.json({ error: 'That entry was deleted.', code: 'record_deleted' }, 409);
      const mine = taken.appId === id.data ? repo.getRecord(ownerId, id.data, body.data.id) : null;
      if (!mine) return c.json({ error: 'Invalid record.', code: 'invalid' }, 400);
      // A plain retry (lost response, second tap) returns the first save.
      if (sameValues(mine.values, body.data.values) || (v.ok && sameValues(mine.values, v.values))) return c.json({ record: mine, duplicate: true }, 200);
      // The same entry with newer values: a timed session resumed after a save whose response was lost,
      // or a typo fixed before retrying. It updates that entry, unless someone edited it since it was
      // saved; then nothing is overwritten and the latest copy comes back.
      if (!v.ok) return c.json({ error: 'Some fields need attention.', code: 'validation', details: v.errors }, 422);
      const photos = foreignPhotos(ownerId, current.spec, v.values);
      if (photos) return c.json({ error: 'Some fields need attention.', code: 'validation', details: photos }, 422);
      if (repo.recordEditedAt(ownerId, id.data, mine.id)) return c.json(conflictBody(mine), 409);
      try {
        const updated = repo.updateRecord(ownerId, id.data, mine.id, v.values, { expectedUpdatedAt: mine.updatedAt });
        return c.json({ record: updated ?? mine, duplicate: true, updated: true }, 200);
      } catch (err) {
        if (err instanceof repo.RecordConflict) return c.json(conflictBody(err.current), 409);
        throw err;
      }
    }
  }
  if (!v.ok) return c.json({ error: 'Some fields need attention.', code: 'validation', details: v.errors }, 422);
  const photoProblem = foreignPhotos(ownerId, current.spec, v.values);
  if (photoProblem) return c.json({ error: 'Some fields need attention.', code: 'validation', details: photoProblem }, 422);
  const record = transaction(() => {
    const created = repo.createRecord(ownerId, id.data, v.values, { id: body.data.id });
    const rec = body.data.recommendationId ? ctx.getRecommendation(ownerId, body.data.recommendationId) : null;
    if (rec && rec.kind === 'use_app' && rec.targetAppId === id.data && (rec.status === 'fresh' || rec.status === 'stale')) {
      ctx.setRecommendationStatus(ownerId, rec.id, 'applied', id.data);
    }
    return created;
  });
  return c.json({ record }, 201);
});

appRoutes.patch('/:appId/records/:recordId', async (c) => {
  const ownerId = c.get('user').id;
  const id = appIdParam.safeParse(c.req.param('appId'));
  const rid = recordIdParam.safeParse(c.req.param('recordId'));
  if (!id.success || !rid.success) return c.json(notFound, 404);
  const body = z.object({
    values: z.record(z.string(), z.unknown()),
    /** The updatedAt the client last saw; a newer write from another device is never overwritten. */
    baseUpdatedAt: z.string().max(40).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid record.', code: 'invalid' }, 400);
  const current = repo.getSpec(ownerId, id.data);
  if (!current) return c.json(notFound, 404);
  const before = repo.getRecord(ownerId, id.data, rid.data);
  if (!before) return c.json({ error: 'That item no longer exists.', code: 'not_found' }, 404);
  const v = validateValues(current.spec, body.data.values, { partial: true });
  if (!v.ok) return c.json({ error: 'Some fields need attention.', code: 'validation', details: v.errors }, 422);
  const photoProblem = foreignPhotos(ownerId, current.spec, v.values);
  if (photoProblem) return c.json({ error: 'Some fields need attention.', code: 'validation', details: photoProblem }, 422);
  // A photo entry may not be emptied out (entries that were already blank stay editable).
  if (blankGalleryEntry(current.spec, { ...before.values, ...v.values }) && !blankGalleryEntry(current.spec, before.values)) {
    return c.json({ error: 'Some fields need attention.', code: 'validation', details: { _: BLANK_GALLERY_ENTRY } }, 422);
  }
  let record;
  try {
    record = repo.updateRecord(ownerId, id.data, rid.data, v.values, { expectedUpdatedAt: body.data.baseUpdatedAt, edit: true });
  } catch (err) {
    if (err instanceof repo.RecordConflict) return c.json(conflictBody(err.current), 409);
    throw err;
  }
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
/** Same values, key by key (a missing key and null are the same). */
function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  }
  return true;
}

const conflictBody = (record: unknown) => ({
  error: 'This changed on another device, so nothing was overwritten. Here is the latest version.',
  code: 'record_conflict' as const,
  details: { record },
});

function foreignPhotos(ownerId: string, spec: AppSpec, values: Record<string, unknown>): Record<string, string> | null {
  const ids = imageMediaIds(spec, values);
  if (!ids.length) return null;
  const owned = ownedMediaIds(ownerId, ids);
  const errors: Record<string, string> = {};
  for (const f of spec.fields) {
    if (f.type !== 'image') continue;
    const v = values[f.id];
    if (typeof v === 'string' && ids.includes(v) && !owned.has(v)) errors[f.id] = 'That photo is not available in your library';
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
  const ownerId = c.get('user').id;
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const body = z.object({
    ops: z.array(RevisionOpSchema).min(1).max(20),
    summary: z.string().trim().min(1).max(300).optional(),
    baseVersion: z.number().int().optional(),
    proposalId: z.string().max(40).optional(),
    /** The Playground/Agent proposal this change came from, marked applied in the same step. */
    recommendationId: z.string().max(40).optional(),
  }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Those changes are not valid.', code: 'invalid', details: body.error.issues.slice(0, 5) }, 400);
  // Read state only after the body: from here on nothing awaits, so concurrent accepts cannot interleave.
  const current = repo.getSpec(ownerId, id.data);
  if (!current) return c.json(notFound, 404);
  const proposal = body.data.proposalId ? getProposal(ownerId, body.data.proposalId) : null;
  const ownProposal = proposal && proposal.appId === id.data ? proposal : null;
  // A retried Accept (lost response, second tap) returns what the first one did instead of an error.
  if (ownProposal?.status === 'accepted') return c.json({ ...detail(ownerId, id.data), changes: [], alreadyApplied: true });
  // A change that comes from an Agent or Playground suggestion is checked again at Accept: a suggestion that
  // was dismissed, kept, already made, or whose memory or share was removed since is never applied.
  const fromRec = body.data.recommendationId && SHORT_ID_PATTERN.test(body.data.recommendationId) ? ctx.getRecommendation(ownerId, body.data.recommendationId) : null;
  if (fromRec && fromRec.kind === 'update_app' && fromRec.targetAppId === id.data) {
    if (fromRec.status === 'applied') return c.json({ error: 'This change was already made.', code: 'stale_proposal' }, 409);
    if (fromRec.status === 'kept') return c.json({ error: 'You kept this as a save, so nothing was changed.', code: 'stale_proposal' }, 409);
    const stale = staleReason(ownerId, fromRec);
    if (stale) return c.json({ error: stale, code: 'stale_proposal' }, 409);
  }
  const expected = body.data.baseVersion ?? ownProposal?.baseVersion;
  if (expected !== undefined && expected !== current.version) {
    return c.json({ error: 'The app changed since this preview was made. Reload and try again.', code: 'stale_preview' }, 409);
  }
  const guarded = guardRevision(ownerId, id.data, current.spec, body.data.ops);
  if (!guarded.spec) return c.json({ error: 'Those changes could not be applied.', code: 'apply_failed', details: guarded.errors }, 422);
  if (guarded.blocked.length) return c.json({ error: guarded.blocked.join(' '), code: 'apply_incompatible', details: guarded.blocked }, 409);
  const spec = guarded.spec;
  const summary = body.data.summary ?? guarded.changes.join(' ');
  transaction(() => {
    const { version } = repo.appendVersion(ownerId, id.data, spec, summary, 'revision');
    repo.recordEvent(id.data, 'revision_accepted', { version, proposalId: ownProposal?.id ?? null });
    if (ownProposal) setProposalStatus(ownerId, id.data, ownProposal.id, 'accepted');
    const rec = body.data.recommendationId && SHORT_ID_PATTERN.test(body.data.recommendationId) ? ctx.getRecommendation(ownerId, body.data.recommendationId) : null;
    if (rec && rec.kind === 'update_app' && rec.targetAppId === id.data) ctx.setRecommendationStatus(ownerId, rec.id, 'applied', id.data);
  });
  return c.json({ ...detail(ownerId, id.data), changes: guarded.changes });
});

/**
 * The data-safe undo for an app's current version: the previous version's design comes back, but fields
 * and choices that saved entries use stay (hidden where the older design had no place for them), and an
 * undo that would strand entries is refused with the reason. If the current version is itself an undo,
 * undoing again restores what was undone (a redo), and is labelled that way.
 */
function undoPlanFor(ownerId: string, appId: string) {
  const app = repo.getApp(ownerId, appId);
  if (!app) return null;
  if (app.currentVersion <= 1) return { app, nothing: true as const };
  const versions = repo.listVersions(ownerId, appId);
  const current = versions.find((v) => v.version === app.currentVersion);
  const previous = versions.find((v) => v.version === app.currentVersion - 1);
  if (!previous || !current) return null;
  const plan = planUndo(current.spec, previous.spec, repo.listRecords(ownerId, appId) ?? []);
  // Undo and redo alternate: after an odd run of undo versions the next one brings the change back.
  let run = 0;
  for (let n = app.currentVersion; n >= 1; n--) {
    if (versions.find((v) => v.version === n)?.origin !== 'undo') break;
    run++;
  }
  const label: UndoPreviewDto['label'] = run % 2 === 1 ? 'Redo' : 'Undo';
  return { app, nothing: false as const, previous, plan, label };
}

appRoutes.post('/:appId/revisions/undo/preview', (c) => {
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const p = undoPlanFor(c.get('user').id, id.data);
  if (!p) return c.json(notFound, 404);
  if (p.nothing) return c.json({ error: 'This is the first version; nothing to undo.', code: 'nothing_to_undo' }, 409);
  const dto: UndoPreviewDto = { ok: p.plan.ok, restores: p.previous.version, label: p.label, kept: p.plan.kept, blocked: p.plan.blocked };
  return c.json(dto);
});

appRoutes.post('/:appId/revisions/undo', async (c) => {
  const ownerId = c.get('user').id;
  const id = appIdParam.safeParse(c.req.param('appId'));
  if (!id.success) return c.json(notFound, 404);
  const body = z.object({ expectedVersion: z.number().int().optional() }).safeParse((await c.req.json().catch(() => null)) ?? {});
  // A malformed version must never switch the retry guard off.
  if (!body.success) return c.json({ error: 'Invalid request.', code: 'invalid' }, 400);
  const p = undoPlanFor(ownerId, id.data);
  if (!p) return c.json(notFound, 404);
  if (p.nothing) return c.json({ error: 'This is the first version; nothing to undo.', code: 'nothing_to_undo' }, 409);
  // A retried undo (lost response) must not turn into a redo.
  const expected = body.data.expectedVersion;
  if (expected !== undefined && expected !== p.app.currentVersion) {
    return c.json({ error: 'The app changed since you looked at it. Reload and try again.', code: 'stale_preview' }, 409);
  }
  if (!p.plan.ok || !p.plan.spec) return c.json({ error: p.plan.blocked.join(' '), code: 'undo_incompatible', details: p.plan.blocked }, 409);
  const spec = p.plan.spec;
  transaction(() => {
    const { version } = repo.appendVersion(ownerId, id.data, spec, `${p.label}: back to version ${p.previous.version}`, 'undo');
    repo.recordEvent(id.data, 'revision_undone', { version, restored: p.previous.version, kept: p.plan.kept.length });
  });
  return c.json({ ...detail(ownerId, id.data), kept: p.plan.kept });
});

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
  const latestSpec = versions[versions.length - 1]!.spec;
  for (const r of body.data.records) {
    const v = validateValues(latestSpec, r.values, { partial: true });
    if (v.errors._) return c.json({ error: `One entry in this file cannot be imported as it is (${v.errors._}). Nothing was imported.`, code: 'invalid_import' }, 400);
  }
  // Photo fields by each id's most recent definition across versions: a photo field dropped from the
  // latest design still counts (an undo could show it again), but an id that later became text does not.
  const imageFields = [...reservedFieldTypes(versions.map((v) => v.spec))].filter(([, type]) => type === 'image').map(([fieldId]) => fieldId);
  const appId = transaction(() => {
    const app = repo.createApp({ ownerId, spec: first.spec, changeSummary: `Imported: ${first.changeSummary}`, origin: 'import' });
    for (const v of versions.slice(1)) repo.appendVersion(ownerId, app.id, v.spec, v.changeSummary, 'import');
    const latest = versions[versions.length - 1]!.spec;
    for (const r of body.data.records) {
      const v = validateValues(latest, r.values, { partial: true });
      // Imported files can come from anyone: photos that are not in this library and links that are not
      // web addresses are dropped (the record survives and stays editable), never stored as given.
      const photoIds = imageFields.map((f) => v.values[f]).filter((x): x is string => typeof x === 'string' && SHORT_ID_PATTERN.test(x));
      const owned = ownedMediaIds(ownerId, photoIds);
      for (const f of imageFields) {
        const x = v.values[f];
        if (typeof x === 'string' && SHORT_ID_PATTERN.test(x) && !owned.has(x)) v.values[f] = null;
      }
      for (const [k, msg] of Object.entries(v.errors)) if (/^Links should start/.test(msg)) v.values[k] = null;
      const createdAt = Number.isNaN(Date.parse(r.createdAt)) ? undefined : new Date(r.createdAt).toISOString();
      repo.createRecord(ownerId, app.id, v.values, { createdAt });
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
  const EventMeta = z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).refine((m) => Object.keys(m).length <= 10, 'too many keys');
  const body = z.object({ type: z.enum(EVENT_TYPES), meta: EventMeta.optional() }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Invalid event.', code: 'invalid' }, 400);
  // Only client-originated event types are accepted here; server-owned ones are derived.
  if (!['app_opened', 'install_guide_viewed', 'shortcut_requested', 'feedback_given', 'revision_declined', 'first_action_completed', 'useful_action'].includes(body.data.type)) {
    return c.json({ error: 'That event is recorded automatically.', code: 'invalid' }, 400);
  }
  if (body.data.type === 'app_opened') repo.touchOpened(c.get('user').id, id.data);
  // "First action" is a milestone: recorded once per app, however many devices report it.
  if (body.data.type === 'first_action_completed' && repo.countEvents(id.data, 'first_action_completed') > 0) return c.json({ ok: true, duplicate: true });
  repo.recordEvent(id.data, body.data.type, body.data.meta);
  return c.json({ ok: true });
});
