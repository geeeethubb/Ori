import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setToken, usesBearer } from './api.ts';
import type { UserDto } from '@shared/api.ts';

interface AuthState {
  user: UserDto | null;
  /** True until the first /me check completes. */
  loading: boolean;
  /** Network failure during the initial check (offline). */
  offline: boolean;
  refresh: () => Promise<UserDto | null>;
  login: (email: string, password: string) => Promise<UserDto>;
  signup: (email: string, password: string, displayName?: string) => Promise<UserDto>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface SessionResponse {
  user: UserDto;
  token?: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: UserDto }>('/api/auth/me');
      setUser(res.user);
      setOffline(false);
      return res.user;
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) setOffline(true);
      else setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const finish = (res: SessionResponse) => {
    if (usesBearer() && res.token) setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      offline,
      refresh,
      login: async (email, password) => finish(await api<SessionResponse>('/api/auth/login', { method: 'POST', body: { email, password } })),
      signup: async (email, password, displayName) =>
        finish(await api<SessionResponse>('/api/auth/signup', { method: 'POST', body: { email, password, displayName } })),
      logout: async () => {
        try {
          await api('/api/auth/logout', { method: 'POST' });
        } finally {
          setToken(null);
          setUser(null);
        }
      },
    }),
    [user, loading, offline, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
