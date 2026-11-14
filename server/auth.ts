/**
 * Prototype authentication: email + password (scrypt) and opaque session tokens.
 * Tokens travel as an httpOnly cookie on the web and as a Bearer header from the Android shell.
 * Swap for a managed identity provider before a public launch; the data model does not change.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config.ts';
import { getDb, nowIso } from './db/index.ts';
import { newId } from '../shared/ids.ts';
import type { UserDto } from '../shared/api.ts';
import { resolveModelMode } from './config.ts';

export const SESSION_COOKIE = 'aas_session';
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  trialStartedAt: string;
  trialEndsAt: string;
  plan: UserDto['plan'];
  isSample: boolean;
}

export type AuthEnv = { Variables: { user: User } };

// ---------- passwords ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, nStr, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !nStr || !saltB64 || !keyB64) return false;
  const key = Buffer.from(keyB64, 'base64');
  const candidate = scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), key.length, { N: Number(nStr), r: 8, p: 1 });
  return candidate.length === key.length && timingSafeEqual(candidate, key);
}

// ---------- users ----------

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: String(r.id),
    email: String(r.email),
    displayName: String(r.display_name),
    createdAt: String(r.created_at),
    trialStartedAt: String(r.trial_started_at),
    trialEndsAt: String(r.trial_ends_at),
    plan: String(r.plan) as User['plan'],
    isSample: Boolean(r.is_sample),
  };
}

export function findUserByEmail(email: string): (User & { passwordHash: string }) | null {
  const r = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
  return r ? { ...rowToUser(r), passwordHash: String(r.password_hash) } : null;
}

export function findUserById(id: string): User | null {
  const r = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? rowToUser(r) : null;
}

export function createUser(input: { email: string; password: string; displayName?: string; isSample?: boolean }): User {
  const id = newId();
  const now = new Date();
  const trialEnds = new Date(now.getTime() + config.trialDays * 86_400_000);
  const email = input.email.trim().toLowerCase();
  const displayName = (input.displayName?.trim() || email.split('@')[0] || 'You').slice(0, 60);
  getDb()
    .prepare(
      `INSERT INTO users (id, email, display_name, password_hash, created_at, trial_started_at, trial_ends_at, plan, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'trial', ?)`,
    )
    .run(id, email, displayName, hashPassword(input.password), now.toISOString(), now.toISOString(), trialEnds.toISOString(), input.isSample ? 1 : 0);
  return findUserById(id) as User;
}

export function premiumActive(user: User, now: Date = new Date()): boolean {
  if (user.plan === 'intro' || user.plan === 'personal') return true;
  if (user.plan === 'paused') return false;
  return new Date(user.trialEndsAt).getTime() > now.getTime();
}

export function aiGenerationsThisMonth(userId: string): number {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const r = getDb().prepare('SELECT COUNT(*) AS n FROM ai_usage WHERE owner_id = ? AND ok = 1 AND at >= ?').get(userId, start.toISOString()) as { n: number };
  return Number(r.n);
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
    plan: user.plan,
    premiumActive: premiumActive(user),
    aiGenerationsThisMonth: aiGenerationsThisMonth(user.id),
    aiGenerationAllowance: config.aiGenerationAllowance,
    modelMode: resolveModelMode(),
  };
}

// ---------- sessions ----------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string, userAgent?: string | null): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), userId, nowIso(), expiresAt, userAgent?.slice(0, 200) ?? null);
  return { token, expiresAt };
}

export function revokeSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function userForToken(token: string | undefined): User | null {
  if (!token || token.length < 20 || token.length > 128) return null;
  const r = getDb()
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .get(hashToken(token), nowIso()) as Record<string, unknown> | undefined;
  return r ? rowToUser(r) : null;
}

export function tokenFromRequest(c: Context): string | undefined {
  const auth = c.req.header('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return getCookie(c, SESSION_COOKIE);
}

function cookieSecure(c: Context): boolean {
  if (config.cookieSecure === 'true') return true;
  if (config.cookieSecure === 'false') return false;
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  return proto === 'https';
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieSecure(c),
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Attach the user when a valid session exists; does not fail otherwise. */
export const optionalAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = userForToken(tokenFromRequest(c));
  if (user) c.set('user', user);
  await next();
};

/** 401 when no valid session. */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = userForToken(tokenFromRequest(c));
  if (!user) return c.json({ error: 'Please sign in to continue.', code: 'unauthenticated' }, 401);
  c.set('user', user);
  await next();
};

// ---------- tiny in-memory rate limiter for credential endpoints ----------

const attempts = new Map<string, { count: number; resetAt: number }>();
export function rateLimited(key: string, limit = 12, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}
