/**
 * One gate for every design change (the Agent's update preview, "Make this more me", Accept): ids are
 * never reused for another type, bindings stay sound, and saved entries never end up reachable from no
 * view. Pure checks over the current spec, the app's history and its records.
 */
import { checkBindings, type AppSpec } from '../../shared/appSpec.ts';
import { applyRevision, reservedFieldTypes, strandedReason, strandedRecords, type RevisionOp } from '../../shared/revision.ts';
import type { FieldType } from '../../shared/appSpec.ts';
import * as apps from '../repos/apps.ts';

export interface GuardedRevision {
  ok: boolean;
  spec?: AppSpec;
  changes: string[];
  /** The ops did not apply (technical validation errors). */
  errors: string[];
  /** The ops apply, but the result would break bindings or strand saved entries (plain words). */
  blocked: string[];
}

/** Every field id this app has ever defined, with its type. */
export function reservedFor(ownerId: string, appId: string): Map<string, FieldType> {
  return reservedFieldTypes(apps.listVersions(ownerId, appId).map((v) => v.spec));
}

export function guardRevision(ownerId: string, appId: string, current: AppSpec, ops: RevisionOp[]): GuardedRevision {
  const result = applyRevision(current, ops, { reserved: reservedFor(ownerId, appId) });
  if (!result.ok || !result.spec) return { ok: false, changes: result.changes, errors: result.errors, blocked: [] };
  // Only problems this change introduces count; an older app's quirks never block an unrelated change.
  const before = new Set(checkBindings(current));
  const blocked = checkBindings(result.spec).filter((p) => !before.has(p));
  const records = apps.listRecords(ownerId, appId) ?? [];
  const stranded = strandedReason(current, strandedRecords(current, result.spec, records), 'the changed app');
  if (stranded) blocked.push(stranded);
  return { ok: blocked.length === 0, spec: result.spec, changes: result.changes, errors: [], blocked };
}
