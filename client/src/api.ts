/**
 * Fetch wrapper. On the web the session travels as an httpOnly cookie (same origin).
 * Inside the Android shell (Capacitor) the API is cross-origin, so we use a bearer token
 * kept in the WebView's storage and send `X-Client: native` so the server returns it.
 */

const TOKEN_KEY = 'aas_token';
const API_BASE_KEY = 'aas_api_base';

declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    __AAS_BOOT__?: { appId: string | null; name: string; icon: { symbol: string; color: string }; purpose: string | null; theme?: string | null };
  }
}

export function isNative(): boolean {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function nativePlatform(): 'android' | 'ios' | 'web' {
  try {
    const p = window.Capacitor?.getPlatform?.();
    return p === 'android' || p === 'ios' ? p : 'web';
  } catch {
    return 'web';
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Base URL for API calls: "" (same origin) on the web; configurable in the native shell. */
export function apiBase(): string {
  const override = safeStorage()?.getItem(API_BASE_KEY);
  const fromBuild = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return (override || fromBuild || '').replace(/\/$/, '');
}

export function setApiBase(url: string): void {
  const s = safeStorage();
  if (!s) return;
  if (url.trim()) s.setItem(API_BASE_KEY, url.trim().replace(/\/$/, ''));
  else s.removeItem(API_BASE_KEY);
}

/** Bearer mode whenever the API is on another origin (native shell, or a configured base URL). */
export function usesBearer(): boolean {
  return isNative() || apiBase() !== '';
}

export function getToken(): string | null {
  return safeStorage()?.getItem(TOKEN_KEY) ?? null;
}
export function setToken(token: string | null): void {
  const s = safeStorage();
  if (!s) return;
  if (token) s.setItem(TOKEN_KEY, token);
  else s.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isNetwork(): boolean {
    return this.status === 0;
  }
  get isAuth(): boolean {
    return this.status === 401;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Milliseconds before the request is abandoned (default 30s; AI calls pass more). */
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (usesBearer()) {
    headers['X-Client'] = 'native';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  opts.signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = (err as Error).name === 'AbortError';
    throw new ApiError(0, aborted ? 'The request took too long. Check your connection and try again.' : 'You appear to be offline. Your work is kept on this device until you reconnect.', aborted ? 'timeout' : 'network');
  }
  clearTimeout(timer);
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code ?? 'error', body.details);
  }
  return data as T;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
