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

export interface RecordActions {
  createRecord: (values: RecordValues) => Promise<AppRecord>;
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

export function useAppData(appId: string, enabled: boolean, userId?: string): AppData {
  const [state, setState] = useState<AppDataState>({ kind: 'idle' });
  const [reloading, setReloading] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const seq = useRef(0);

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

  const createRecord = useCallback<RecordActions['createRecord']>(
    async (values) => {
      const res = await api<{ record: AppRecord }>(`/api/apps/${appId}/records`, { method: 'POST', body: { values } });
      setState((s) => (s.kind === 'ready' ? { ...s, records: [res.record, ...s.records.filter((r) => r.id !== res.record.id)] } : s));
      return res.record;
    },
    [appId],
  );

  const updateRecord = useCallback<RecordActions['updateRecord']>(
    async (recordId, values) => {
      const snapshot = stateRef.current;
      const previous = snapshot.kind === 'ready' ? snapshot.records.find((r) => r.id === recordId) : undefined;
      // Optimistic: show the change immediately, reconcile with the server's copy, roll back on failure.
      replaceRecord(recordId, (r) => ({ ...r, values: { ...r.values, ...values }, updatedAt: new Date().toISOString() }));
      try {
        const res = await api<{ record: AppRecord }>(`/api/apps/${appId}/records/${recordId}`, { method: 'PATCH', body: { values } });
        replaceRecord(recordId, res.record);
        return res.record;
      } catch (err) {
        if (previous) replaceRecord(recordId, previous);
        throw err;
      }
    },
    [appId, replaceRecord],
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
