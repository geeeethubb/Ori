import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearSessionCookie, createSession, createUser, findUserByEmail, rateLimited, requireAuth, revokeSession,
  setSessionCookie, tokenFromRequest, toUserDto, verifyPassword, type AuthEnv,
} from '../auth.ts';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  displayName: z.string().trim().max(60).optional(),
});

export const authRoutes = new Hono<AuthEnv>();

function clientKey(c: { req: { header: (n: string) => string | undefined } }, email: string): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';
  return `${ip}:${email}`;
}

/** Native shells (Capacitor) ask for the token in the body instead of a cookie. */
function wantsBearer(c: { req: { header: (n: string) => string | undefined } }): boolean {
  return c.req.header('x-client') === 'native';
}

authRoutes.post('/signup', async (c) => {
  const body = credentials.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? 'Check your email and password.', code: 'invalid' }, 400);
  if (rateLimited(`signup:${clientKey(c, body.data.email)}`, 10)) return c.json({ error: 'Too many attempts. Try again in a few minutes.', code: 'rate_limited' }, 429);
  if (findUserByEmail(body.data.email)) return c.json({ error: 'An account with this email already exists. Sign in instead.', code: 'exists' }, 409);
  const user = createUser(body.data);
  const session = createSession(user.id, c.req.header('user-agent'));
  if (!wantsBearer(c)) setSessionCookie(c, session.token);
  return c.json({ user: toUserDto(user), ...(wantsBearer(c) ? { token: session.token, expiresAt: session.expiresAt } : {}) }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = credentials.pick({ email: true, password: true }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Enter your email and password.', code: 'invalid' }, 400);
  if (rateLimited(`login:${clientKey(c, body.data.email)}`)) return c.json({ error: 'Too many attempts. Try again in a few minutes.', code: 'rate_limited' }, 429);
  const user = findUserByEmail(body.data.email);
  if (!user || !verifyPassword(body.data.password, user.passwordHash)) {
    return c.json({ error: 'That email and password do not match.', code: 'bad_credentials' }, 401);
  }
  const session = createSession(user.id, c.req.header('user-agent'));
  if (!wantsBearer(c)) setSessionCookie(c, session.token);
  return c.json({ user: toUserDto(user), ...(wantsBearer(c) ? { token: session.token, expiresAt: session.expiresAt } : {}) });
});

authRoutes.post('/logout', async (c) => {
  const token = tokenFromRequest(c);
  if (token) revokeSession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => c.json({ user: toUserDto(c.get('user')) }));
