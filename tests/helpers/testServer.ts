/**
 * In-process client for the Hono server, used by the API tests.
 *
 * No port is opened: every call goes through `app.request()`. Importing `server/index.ts` does not
 * start listening because its entry point only calls `serve()` when `process.argv[1]` resolves to
 * that file (or `AAS_SERVE=1`); under vitest argv[1] is the vitest binary. `assertNotServing()`
 * double-checks this before the import so a change to the entry point fails loudly here instead
 * of leaking a listening socket into the test run.
 *
 * The database is `:memory:` (vitest.config.ts) and is opened once per process, so each test FILE
 * gets its own fresh database while tests inside one file share it. Use `uniqueEmail()` so tests
 * never collide on accounts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hono } from 'hono';
import type { UserDto } from '../../shared/api.ts';

export const DEFAULT_PASSWORD = 'walks-and-brick-walls-2026';

export interface ApiResponse<T = any> {
  status: number;
  /** Parsed JSON body, or null when the body is empty or not JSON. */
  json: T;
  text: string;
  headers: Headers;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Objects are JSON-encoded; strings are sent as-is (for malformed-body tests). */
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

export interface AuthBody {
  user?: UserDto;
  token?: string;
  expiresAt?: string;
  error?: string;
  code?: string;
}

export interface Session {
  email: string;
  password: string;
  token: string;
  user: UserDto;
}

export interface TestClient {
  app: Hono;
  request<T = any>(path: string, opts?: RequestOptions): Promise<ApiResponse<T>>;
  /** Signs up as a native client (`X-Client: native`) and returns the bearer token. */
  signup(email?: string, password?: string, displayName?: string): Promise<Session>;
  /** Logs in; `native` (default) asks for a bearer token instead of a cookie. */
  login(email: string, password: string, native?: boolean): Promise<ApiResponse<AuthBody>>;
}

let counter = 0;
/** Unique per call and per process, so parallel test files never share an account. */
export function uniqueEmail(prefix = 'tester'): string {
  counter += 1;
  return `${prefix}-${process.pid.toString(36)}-${Date.now().toString(36)}-${counter}@example.test`;
}

const SERVER_ENTRY = path.resolve(fileURLToPath(new URL('../../server/index.ts', import.meta.url)));

/** Throws if importing server/index.ts would make it call serve() in this process. */
export function assertNotServing(): void {
  const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : '';
  if (argv1 === SERVER_ENTRY || process.env.AAS_SERVE === '1') {
    throw new Error(`server/index.ts would start listening in this process (argv[1]=${argv1}); tests must only use app.request()`);
  }
}

/** Wrap an already-built Hono app (used when a test needs control over how the server was created). */
export function clientFor(app: Hono): TestClient {
  async function request<T = any>(p: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] ??= 'application/json';
      body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    const res = await app.request(new Request(`http://local${p}`, { method, headers, body }));
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, json: json as T, text, headers: res.headers };
  }

  async function signup(email = uniqueEmail(), password = DEFAULT_PASSWORD, displayName?: string): Promise<Session> {
    const res = await request<AuthBody>('/api/auth/signup', {
      body: { email, password, ...(displayName ? { displayName } : {}) },
      headers: { 'X-Client': 'native' },
    });
    if (res.status !== 201 || !res.json?.token || !res.json.user) throw new Error(`signup failed (${res.status}): ${res.text}`);
    return { email, password, token: res.json.token, user: res.json.user };
  }

  function login(email: string, password: string, native = true): Promise<ApiResponse<AuthBody>> {
    return request<AuthBody>('/api/auth/login', { body: { email, password }, headers: native ? { 'X-Client': 'native' } : {} });
  }

  return { app, request, signup, login };
}

/** Build the real server (API + install routes) and wrap it. Imports lazily so env can be set first. */
export async function makeClient(): Promise<TestClient> {
  assertNotServing();
  const { createServer } = await import('../../server/index.ts');
  return clientFor(createServer());
}
