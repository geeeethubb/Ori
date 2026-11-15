/**
 * The homepage waitlist. Public (no account needed): it only stores an email address for the founder to
 * contact later; the app never sends email. A repeated address gets the same answer, so the form never
 * reveals who is already on the list. A hidden field that people never fill catches simple bots.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimited } from '../auth.ts';
import { getDb } from '../db/index.ts';

export const waitlistRoutes = new Hono();

const WaitlistBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  source: z.string().trim().max(40).regex(/^[a-z0-9-]*$/).optional(),
  company: z.string().max(200).optional(),
});

waitlistRoutes.post('/', async (c) => {
  const body = WaitlistBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: 'Enter a valid email address.', code: 'invalid' }, 400);
  // Generous per-network limit: many people at one event share a network.
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'local';
  if (rateLimited(`waitlist:${ip}`, 30)) return c.json({ error: 'Too many attempts. Try again in a few minutes.', code: 'rate_limited' }, 429);
  if (body.data.company) return c.json({ ok: true });
  getDb()
    .prepare('INSERT INTO waitlist (email, source, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING')
    .run(body.data.email, body.data.source || 'landing', new Date().toISOString());
  return c.json({ ok: true });
});
