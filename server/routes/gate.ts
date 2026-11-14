/** Shared premium/allowance gate for routes that call the model. */
import type { Context } from 'hono';
import { aiGenerationsThisMonth, premiumActive, type AuthEnv } from '../auth.ts';
import { config } from '../config.ts';

export const PAUSED_MESSAGE = 'Your trial has ended. You can still open and export your apps; subscribe to keep creating and changing them.';

/** Returns a 403/429 response when the user may not spend an AI generation right now, else null. */
export function premiumGate(c: Context<AuthEnv>): Response | null {
  const user = c.get('user');
  if (!premiumActive(user)) return c.json({ error: PAUSED_MESSAGE, code: 'premium_paused' }, 403);
  if (aiGenerationsThisMonth(user.id) >= config.aiGenerationAllowance) {
    return c.json({ error: `You have used this month's AI allowance (${config.aiGenerationAllowance} generations). It resets next month.`, code: 'rate_limited' }, 429);
  }
  return null;
}
