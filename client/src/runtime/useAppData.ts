/**
 * Loads one personal app (definition + records), keeps an offline copy, and applies record
 * changes optimistically. The server is the source of truth; localStorage is only a cache.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppDetailDto } from '@shared/api.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { api, ApiError, describeError } from '../api.ts';
import { readCache, writeCache } from './runtimeUtils.ts';

export type AppDataState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; detail: AppDetailDto; records: AppRecord[] }
  | { kind: 'offline'; detail: AppDetailDto; records: AppRecord[]; savedAt: string }
  | { kind: 'not_found' }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };

export interface CreateOptions {
  /** Client-minted id: a retry or a second tap with the same id is the same entry. */
  id?: string;
  /** The Agent suggestion this entry came from (marked used by the server in the same step). */
  recommendationId?: string;
}

export interface RecordActions {
  /** `duplicate`: this id was saved before; `updated`: this save brought newer values to that entry. */
  createRecord: (values: RecordValues, opts?: CreateOptions) => Promise<{ record: AppRecord; duplicate: boolean; updated: boolean }>;
  updateRecord: (recordId: string, values: RecordValues) => Promise<AppRecord>;
  deleteRecord: (recordId: string) => Promise<void>;
}

export interface AppData extends RecordActions {
  state: AppDataState;
  /** True while a reload is in flight on top of data already shown. */
  reloading: boolean;
  reload: () => Promise<void>;
  /** Replace the app definition (after a revision, undo, pin or archive). */
  setDetail: (detail: AppDetailDto) => void;
}

/** Puts a saved copy in the list: in place of the entry with its id, or at the top when it is new here. */
export function upsertRecord(records: AppRecord[], record: AppRecord): AppRecord[] {
  return records.some((r) => r.id === record.id) ? records.map((r) => (r.id === record.id ? record : r)) : [record, ...records];
}

/**
 * Undoes a failed edit on the shown copy: only the keys it changed go back, to the copy the server last
 * confirmed. What other edits changed stays as shown.
 */
export function revertKeys(shown: AppRecord, confirmed: AppRecord, keys: string[]): AppRecord {
  const values = { ...shown.values };
  for (const k of keys) {
    if (k in confirmed.values) values[k] = confirmed.values[k];
    else delete values[k];
  }
  return { ...shown, values };
}

/** The latest copy a 409 record_conflict carries (it was changed since this page saw it). */
export function conflictCopy(err: unknown): AppRecord | undefined {
  if (!(err instanceof ApiError) || err.code !== 'record_conflict') return undefined;
  return (err.details as { record?: AppRecord } | null)?.record ?? undefined;
}

export function useAppData(appId: string, enabled: boolean, userId?: string): AppData {
  const [state, setState] = useState<AppDataState>({ kind: 'idle' });
  const [reloading, setReloading] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);
  /** The server's updatedAt for each record this page last saw; every edit is checked against it. */
  const stamps = useRef(new Map<string, string>());
  /** The last copy of each record the server confirmed; a failed edit puts its keys back to it. */
  const confirmed = useRef(new Map<string, AppRecord>());
  /** Edits to one record run one after another, so a quick "done" then "undo" never races itself. */
  const queues = useRef(new Map<string, Promise<unknown>>());

  const load = useCallback(async () => {
    if (!appId) return;
    const mine = ++seq.current;
    const current = stateRef.current;
    const hasData = current.kind === 'ready' || current.kind === 'offline';
    if (hasData) setReloading(true);
    else setState({ kind: 'loading' });
    try {
      const [detail, page] = await Promise.all([
        api<AppDetailDto>(`/api/apps/${appId}`),
        api<{ records: AppRecord[] }>(`/api/apps/${appId}/records`),
      ]);
      if (mine !== seq.current) return;
      stamps.current = new Map(page.records.map((r) => [r.id, r.updatedAt]));
      confirmed.current = new Map(page.records.map((r) => [r.id, r]));
      setState({ kind: 'ready', detail, records: page.records });
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError) {
        if (err.isNetwork) {
          const cached = readCache(appId);
          if (cached && (!userId || !cached.userId || cached.userId === userId)) {
            setState({ kind: 'offline', detail: cached.detail, records: cached.records, savedAt: cached.savedAt });
          } else {
            setState({ kind: 'error', message: err.message });
          }
          return;
        }
        if (err.status === 404) {
          setState({ kind: 'not_found' });
          return;
        }
        if (err.isAuth) {
          setState({ kind: 'unauthenticated' });
          return;
        }
      }
      setState({ kind: 'error', message: describeError(err) });
    } finally {
      if (mine === seq.current) setReloading(false);
    }
  }, [appId, userId]);

  useEffect(() => {
    if (!enabled) {
      seq.current++;
      setState({ kind: 'idle' });
      return;
    }
    void load();
  }, [enabled, load]);

  // Every ready state (initial load and each change) refreshes the offline copy.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    writeCache(appId, { detail: state.detail, records: state.records, savedAt: new Date().toISOString(), userId });
  }, [state, appId, userId]);

  const setDetail = useCallback((detail: AppDetailDto) => {
    setState((s) => (s.kind === 'ready' ? { ...s, detail } : s));
  }, []);

  const replaceRecord = useCallback((recordId: string, next: AppRecord | ((r: AppRecord) => AppRecord)) => {
    setState((s) => (s.kind === 'ready' ? { ...s, records: s.records.map((r) => (r.id === recordId ? (typeof next === 'function' ? next(r) : next) : r)) } : s));
  }, []);

  /** Notes a copy the server confirmed: later edits are checked against it and fall back to it. */
  const remember = useCallback((record: AppRecord) => {
    stamps.current.set(record.id, record.updatedAt);
    confirmed.current.set(record.id, record);
  }, []);

  const createRecord = useCallback<RecordActions['createRecord']>(
    async (values, opts = {}) => {
      const show = (record: AppRecord) => {
        remember(record);
        setState((s) => (s.kind === 'ready' ? { ...s, records: upsertRecord(s.records, record) } : s));
      };
      let res: { record: AppRecord; duplicate?: boolean; updated?: boolean };
      try {
        res = await api<{ record: AppRecord; duplicate?: boolean; updated?: boolean }>(`/api/apps/${appId}/records`, {
          method: 'POST',
          body: { values, ...(opts.id ? { id: opts.id } : {}), ...(opts.recommendationId ? { recommendationId: opts.recommendationId } : {}) },
        });
      } catch (err) {
        // Saved before and edited since: the latest copy is shown, nothing was overwritten.
        const latest = conflictCopy(err);
        if (latest) show(latest);
        throw err;
      }
      show(res.record);
      return { record: res.record, duplicate: Boolean(res.duplicate), updated: Boolean(res.updated) };
    },
    [appId, remember],
  );

  const updateRecord = useCallback<RecordActions['updateRecord']>(
    (recordId, values) => {
      const snapshot = stateRef.current;
      const previous = snapshot.kind === 'ready' ? snapshot.records.find((r) => r.id === recordId) : undefined;
      // Optimistic: show the change immediately (keeping the server's timestamp), reconcile, roll back on failure.
      replaceRecord(recordId, (r) => ({ ...r, values: { ...r.values, ...values } }));
      const run = async (): Promise<AppRecord> => {
        const baseUpdatedAt = stamps.current.get(recordId) ?? previous?.updatedAt;
        try {
          const res = await api<{ record: AppRecord }>(`/api/apps/${appId}/records/${recordId}`, {
            method: 'PATCH',
            body: { values, ...(baseUpdatedAt ? { baseUpdatedAt } : {}) },
          });
          remember(res.record);
          replaceRecord(recordId, res.record);
          return res.record;
        } catch (err) {
          // Changed on another device: show the newer copy instead of overwriting it.
          const current = conflictCopy(err);
          if (current) {
            remember(current);
            replaceRecord(recordId, current);
          } else {
            // Put back only what this edit changed, as the server last confirmed it: an earlier edit that
            // also failed must not come back, and edits still waiting stay shown.
            const base = confirmed.current.get(recordId) ?? previous;
            if (base) replaceRecord(recordId, (r) => revertKeys(r, base, Object.keys(values)));
          }
          throw err;
        }
      };
      const prior = queues.current.get(recordId) ?? Promise.resolve();
      const next = prior.catch(() => undefined).then(run);
      queues.current.set(recordId, next);
      return next;
    },
    [appId, replaceRecord, remember],
  );

  const deleteRecord = useCallback<RecordActions['deleteRecord']>(
    async (recordId) => {
      const snapshot = stateRef.current;
      if (snapshot.kind !== 'ready') return;
      const index = snapshot.records.findIndex((r) => r.id === recordId);
      const previous = snapshot.records[index];
      setState((s) => (s.kind === 'ready' ? { ...s, records: s.records.filter((r) => r.id !== recordId) } : s));
      try {
        await api<{ ok: boolean }>(`/api/apps/${appId}/records/${recordId}`, { method: 'DELETE' });
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return; // already gone elsewhere
        if (previous) {
          setState((s) => {
            if (s.kind !== 'ready') return s;
            const records = [...s.records];
            records.splice(Math.min(index, records.length), 0, previous);
            return { ...s, records };
          });
        }
        throw err;
      }
    },
    [appId],
  );

  return { state, reloading, reload: load, setDetail, createRecord, updateRecord, deleteRecord };
}
