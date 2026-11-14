/**
 * Data access for apps, spec versions, records and events.
 * Every read/write takes the owner ID so ownership is enforced at the data boundary.
 */
import { getDb, nowIso, transaction } from '../db/index.ts';
import { newId } from '../../shared/ids.ts';
import { AppSpecSchema, capabilitiesOf, designFor, type AppSpec } from '../../shared/appSpec.ts';
import type { AppRecord, RecordValues } from '../../shared/records.ts';
import type { AppEvent, EventType } from '../../shared/context.ts';
import type { AppSummaryDto, AppVersionDto } from '../../shared/api.ts';

type R = Record<string, unknown>;

export interface AppRow {
  id: string;
  ownerId: string;
  name: string;
  tagline: string | null;
  iconSymbol: string;
  iconColor: string;
  purpose: string;
  pattern: string;
  currentVersion: number;
  pinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  sourceRecommendationId: string | null;
  sourceCaptureId: string | null;
  isSample: boolean;
  /** Current spec (joined); present on rows read through listApps/getApp. */
  spec?: AppSpec;
}

const SELECT_APP = `SELECT a.*, v.spec_json,
  (SELECT COUNT(*) FROM app_records r WHERE r.app_id = a.id AND r.deleted_at IS NULL) AS record_count
  FROM apps a LEFT JOIN app_versions v ON v.app_id = a.id AND v.version = a.current_version`;

function rowToApp(r: R): AppRow {
  let spec: AppSpec | undefined;
  if (r.spec_json) {
    const parsed = AppSpecSchema.safeParse(JSON.parse(String(r.spec_json)));
    if (parsed.success) spec = parsed.data;
  }
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    name: String(r.name),
    tagline: (r.tagline as string | null) ?? null,
    iconSymbol: String(r.icon_symbol),
    iconColor: String(r.icon_color),
    purpose: String(r.purpose),
    pattern: String(r.pattern),
    currentVersion: Number(r.current_version),
    pinned: Boolean(r.pinned),
    archivedAt: (r.archived_at as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lastOpenedAt: (r.last_opened_at as string | null) ?? null,
    sourceRecommendationId: (r.source_recommendation_id as string | null) ?? null,
    sourceCaptureId: (r.source_capture_id as string | null) ?? null,
    isSample: Boolean(r.is_sample),
    spec,
  };
}

export function toSummary(app: AppRow, recordCount = 0): AppSummaryDto {
  const icon = { symbol: app.iconSymbol as AppSummaryDto['icon']['symbol'], color: app.iconColor as AppSummaryDto['icon']['color'] };
  const pattern = app.pattern as AppSummaryDto['pattern'];
  const purpose = app.purpose as AppSummaryDto['purpose'];
  return {
    id: app.id,
    name: app.name,
    tagline: app.tagline ?? undefined,
    icon,
    purpose,
    pattern,
    design: app.spec ? designFor(app.spec) : designFor({ design: undefined, pattern, icon, purpose }),
    capabilities: app.spec ? capabilitiesOf(app.spec) : [],
    currentVersion: app.currentVersion,
    pinned: app.pinned,
    archivedAt: app.archivedAt,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    lastOpenedAt: app.lastOpenedAt,
    recordCount,
    launchPath: `/apps/${app.id}/`,
    isSample: app.isSample,
  };
}

// ---------- apps ----------

export function listApps(ownerId: string): (AppRow & { recordCount: number })[] {
  const rows = getDb()
    .prepare(`${SELECT_APP} WHERE a.owner_id = ? ORDER BY a.pinned DESC, COALESCE(a.last_opened_at, a.updated_at) DESC`)
    .all(ownerId) as R[];
  return rows.map((r) => ({ ...rowToApp(r), recordCount: Number(r.record_count) }));
}

export function getApp(ownerId: string, appId: string): (AppRow & { recordCount: number }) | null {
  const r = getDb().prepare(`${SELECT_APP} WHERE a.id = ? AND a.owner_id = ?`).get(appId, ownerId) as R | undefined;
  return r ? { ...rowToApp(r), recordCount: Number(r.record_count) } : null;
}

/** Public install metadata only (name, icon, look), looked up by unguessable ID. No records. */
export function getAppPublicMeta(appId: string): { id: string; name: string; iconSymbol: string; iconColor: string; purpose: string; tagline: string | null; theme: string | null } | null {
  const r = getDb()
    .prepare('SELECT a.id, a.name, a.icon_symbol, a.icon_color, a.purpose, a.tagline, a.pattern, v.spec_json FROM apps a LEFT JOIN app_versions v ON v.app_id = a.id AND v.version = a.current_version WHERE a.id = ?')
    .get(appId) as R | undefined;
  if (!r) return null;
  let theme: string | null = null;
  if (r.spec_json) {
    const parsed = AppSpecSchema.safeParse(JSON.parse(String(r.spec_json)));
    if (parsed.success) theme = designFor(parsed.data).theme;
  }
  return { id: String(r.id), name: String(r.name), iconSymbol: String(r.icon_symbol), iconColor: String(r.icon_color), purpose: String(r.purpose), tagline: (r.tagline as string | null) ?? null, theme };
}

export function getSpec(ownerId: string, appId: string, version?: number): { version: number; spec: AppSpec } | null {
  const app = getApp(ownerId, appId);
  if (!app) return null;
  const v = version ?? app.currentVersion;
  if (v === app.currentVersion && app.spec) return { version: v, spec: app.spec };
  const r = getDb().prepare('SELECT spec_json FROM app_versions WHERE app_id = ? AND version = ?').get(appId, v) as R | undefined;
  if (!r) return null;
  const parsed = AppSpecSchema.safeParse(JSON.parse(String(r.spec_json)));
  if (!parsed.success) throw new Error(`Stored spec for ${appId} v${v} is invalid: ${parsed.error.message}`);
  return { version: v, spec: parsed.data };
}

export function listVersions(ownerId: string, appId: string): AppVersionDto[] {
  if (!getApp(ownerId, appId)) return [];
  const rows = getDb().prepare('SELECT * FROM app_versions WHERE app_id = ? ORDER BY version ASC').all(appId) as R[];
  return rows.map((r) => ({
    version: Number(r.version),
    spec: AppSpecSchema.parse(JSON.parse(String(r.spec_json))),
    changeSummary: String(r.change_summary),
    origin: String(r.origin) as AppVersionDto['origin'],
    createdAt: String(r.created_at),
  }));
}

export interface CreateAppInput {
  ownerId: string;
  spec: AppSpec;
  changeSummary?: string;
  origin?: AppVersionDto['origin'];
  sourceRecommendationId?: string | null;
  sourceCaptureId?: string | null;
  isSample?: boolean;
  id?: string;
}

export function createApp(input: CreateAppInput): AppRow {
  const spec = AppSpecSchema.parse(input.spec);
  const id = input.id ?? newId();
  const now = nowIso();
  transaction(() => {
    getDb()
      .prepare(
        `INSERT INTO apps (id, owner_id, name, tagline, icon_symbol, icon_color, purpose, pattern, current_version, pinned, archived_at,
          created_at, updated_at, last_opened_at, source_recommendation_id, is_sample, source_capture_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, ?, NULL, ?, ?, ?)`,
      )
      .run(id, input.ownerId, spec.name, spec.tagline ?? null, spec.icon.symbol, spec.icon.color, spec.purpose, spec.pattern, now, now,
        input.sourceRecommendationId ?? null, input.isSample ? 1 : 0, input.sourceCaptureId ?? null);
    getDb()
      .prepare('INSERT INTO app_versions (app_id, version, spec_json, change_summary, origin, created_at) VALUES (?, 1, ?, ?, ?, ?)')
      .run(id, JSON.stringify(spec), input.changeSummary ?? 'Built from your request', input.origin ?? 'build', now);
    recordEvent(id, 'app_built', { origin: input.origin ?? 'build' });
  });
  return getApp(input.ownerId, id) as AppRow;
}

/** Append a new spec version and make it current. Records are never touched. */
export function appendVersion(ownerId: string, appId: string, spec: AppSpec, changeSummary: string, origin: AppVersionDto['origin']): { version: number } {
  const parsed = AppSpecSchema.parse(spec);
  return transaction(() => {
    const app = getApp(ownerId, appId);
    if (!app) throw new NotFound();
    const version = app.currentVersion + 1;
    const now = nowIso();
    getDb()
      .prepare('INSERT INTO app_versions (app_id, version, spec_json, change_summary, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(appId, version, JSON.stringify(parsed), changeSummary.slice(0, 300), origin, now);
    getDb()
      .prepare('UPDATE apps SET current_version = ?, name = ?, tagline = ?, icon_symbol = ?, icon_color = ?, purpose = ?, pattern = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
      .run(version, parsed.name, parsed.tagline ?? null, parsed.icon.symbol, parsed.icon.color, parsed.purpose, parsed.pattern, now, appId, ownerId);
    return { version };
  });
}

export function updateAppFlags(ownerId: string, appId: string, patch: { pinned?: boolean; archived?: boolean }): AppRow | null {
  const app = getApp(ownerId, appId);
  if (!app) return null;
  const pinned = patch.pinned ?? app.pinned;
  const archivedAt = patch.archived === undefined ? app.archivedAt : patch.archived ? nowIso() : null;
  getDb().prepare('UPDATE apps SET pinned = ?, archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?').run(pinned ? 1 : 0, archivedAt, nowIso(), appId, ownerId);
  return getApp(ownerId, appId);
}

export function touchOpened(ownerId: string, appId: string): void {
  getDb().prepare('UPDATE apps SET last_opened_at = ? WHERE id = ? AND owner_id = ?').run(nowIso(), appId, ownerId);
}

export function deleteApp(ownerId: string, appId: string): boolean {
  const res = getDb().prepare('DELETE FROM apps WHERE id = ? AND owner_id = ?').run(appId, ownerId);
  return Number(res.changes) > 0;
}

// ---------- records ----------

function rowToRecord(r: R): AppRecord {
  return {
    id: String(r.id),
    appId: String(r.app_id),
    values: JSON.parse(String(r.values_json)) as RecordValues,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listRecords(ownerId: string, appId: string): AppRecord[] | null {
  if (!getApp(ownerId, appId)) return null;
  const rows = getDb().prepare('SELECT * FROM app_records WHERE app_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC').all(appId) as R[];
  return rows.map(rowToRecord);
}

export function getRecord(ownerId: string, appId: string, recordId: string): AppRecord | null {
  if (!getApp(ownerId, appId)) return null;
  const r = getDb().prepare('SELECT * FROM app_records WHERE id = ? AND app_id = ? AND deleted_at IS NULL').get(recordId, appId) as R | undefined;
  return r ? rowToRecord(r) : null;
}

export function createRecord(ownerId: string, appId: string, values: RecordValues, opts: { id?: string; createdAt?: string } = {}): AppRecord {
  return transaction(() => {
    if (!getApp(ownerId, appId)) throw new NotFound();
    const id = opts.id ?? newId();
    const now = nowIso();
    const createdAt = opts.createdAt ?? now;
    const isFirst = (getDb().prepare('SELECT COUNT(*) AS n FROM app_records WHERE app_id = ?').get(appId) as { n: number }).n === 0;
    getDb()
      .prepare('INSERT INTO app_records (id, app_id, values_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)')
      .run(id, appId, JSON.stringify(values), createdAt, now);
    getDb().prepare('UPDATE apps SET updated_at = ? WHERE id = ?').run(now, appId);
    recordEvent(appId, isFirst ? 'first_item_saved' : 'item_saved', { recordId: id });
    return getRecord(ownerId, appId, id) as AppRecord;
  });
}

export function updateRecord(ownerId: string, appId: string, recordId: string, values: RecordValues): AppRecord | null {
  return transaction(() => {
    const existing = getRecord(ownerId, appId, recordId);
    if (!existing) return null;
    const merged = { ...existing.values, ...values };
    const now = nowIso();
    getDb().prepare('UPDATE app_records SET values_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(merged), now, recordId);
    getDb().prepare('UPDATE apps SET updated_at = ? WHERE id = ?').run(now, appId);
    return getRecord(ownerId, appId, recordId);
  });
}

export function deleteRecord(ownerId: string, appId: string, recordId: string): boolean {
  if (!getApp(ownerId, appId)) return false;
  const res = getDb().prepare('UPDATE app_records SET deleted_at = ? WHERE id = ? AND app_id = ? AND deleted_at IS NULL').run(nowIso(), recordId, appId);
  return Number(res.changes) > 0;
}

// ---------- events ----------

export function recordEvent(appId: string, type: EventType, meta?: Record<string, unknown>): void {
  getDb().prepare('INSERT INTO app_events (app_id, type, at, meta_json) VALUES (?, ?, ?, ?)').run(appId, type, nowIso(), meta ? JSON.stringify(meta) : null);
}

export function listEvents(ownerId: string, appId: string, limit = 200): AppEvent[] {
  if (!getApp(ownerId, appId)) return [];
  const rows = getDb().prepare('SELECT * FROM app_events WHERE app_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(appId, limit) as R[];
  return rows.map((r) => ({
    id: Number(r.id),
    appId: String(r.app_id),
    type: String(r.type) as EventType,
    at: String(r.at),
    meta: r.meta_json ? (JSON.parse(String(r.meta_json)) as Record<string, unknown>) : null,
  }));
}

export function countEvents(appId: string, type: EventType): number {
  const r = getDb().prepare('SELECT COUNT(*) AS n FROM app_events WHERE app_id = ? AND type = ?').get(appId, type) as { n: number };
  return Number(r.n);
}

export class NotFound extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFound';
  }
}
