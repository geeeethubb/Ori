import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, describeError } from '../../api.ts';
import { useAuth } from '../../auth.tsx';

interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface Loaded<T> extends LoadState<T> {
  /** Run the loader again (keeps the current data visible while it runs). */
  reload: () => void;
  /** Replace or patch the loaded data after a successful mutation. */
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Small load/error/retry pattern shared by the storefront pages. A 401 mid-session refreshes the
 * auth state so RequireAuth can send the person back to sign in with their destination kept.
 */
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[] = []): Loaded<T> {
  const { refresh } = useAuth();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.isAuth) void refresh();
        setState((s) => ({ ...s, error: describeError(err), loading: false }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, refresh, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback<Loaded<T>['setData']>((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? (updater as (prev: T | null) => T | null)(s.data) : updater }));
  }, []);

  return { ...state, reload, setData };
}
