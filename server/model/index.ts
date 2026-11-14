/**
 * Adapter factory. In live mode every call is attempted on Anthropic first; if it fails
 * (network, timeout, refusal, invalid output after bounded retries) the deterministic sample
 * adapter answers instead and the result is labelled generatedBy: 'sample' with a reason, so
 * the UI never presents a fallback as live AI. Usage is logged per owner for the fair-use meter;
 * failed live attempts never count against the allowance.
 */
import { config, resolveModelMode } from '../config.ts';
import { getDb, nowIso } from '../db/index.ts';
import type { AdapterResult, ModelAdapter, ModelMode } from './types.ts';
import { ModelOutputError } from './types.ts';
import { sampleAdapter } from './sample/index.ts';
import { AnthropicAdapter } from './anthropic.ts';

let live: AnthropicAdapter | null = null;

export function liveAdapter(): ModelAdapter | null {
  if (resolveModelMode() !== 'anthropic') return null;
  if (!live) live = new AnthropicAdapter(config.anthropicApiKey);
  return live;
}

export type UsageKind = 'extract' | 'recommend' | 'generate' | 'revise' | 'suggest';

export function logUsage(ownerId: string, kind: UsageKind, provider: ModelMode, ok: boolean): void {
  try {
    getDb().prepare('INSERT INTO ai_usage (owner_id, kind, provider, ok, at) VALUES (?, ?, ?, ?, ?)').run(ownerId, kind, provider, ok ? 1 : 0, nowIso());
  } catch (err) {
    console.warn('[model] usage log failed', (err as Error).message);
  }
}

export function describeModelFailure(err: unknown): string {
  if (err instanceof ModelOutputError) return err.message;
  const e = err as { status?: number; name?: string; message?: string };
  if (e?.status === 401) return 'The AI key was rejected.';
  if (e?.status === 429) return 'The AI service is rate limiting us right now.';
  if (e?.name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(e?.message ?? '')) return 'The AI service took too long.';
  if (typeof e?.status === 'number' && e.status >= 500) return 'The AI service had a problem.';
  return 'The AI service was unavailable.';
}

/**
 * Run one model task through the live adapter with a sample fallback.
 * `ownerId` is used for usage accounting only.
 */
export async function withModel<T>(ownerId: string, kind: UsageKind, fn: (adapter: ModelAdapter) => Promise<AdapterResult<T>>): Promise<AdapterResult<T>> {
  const primary = liveAdapter();
  if (primary) {
    try {
      const res = await fn(primary);
      logUsage(ownerId, kind, 'anthropic', true);
      return res;
    } catch (err) {
      logUsage(ownerId, kind, 'anthropic', false);
      console.warn(`[model] live ${kind} failed, using sample fallback:`, (err as Error).message);
      const fallback = await fn(sampleAdapter);
      return { ...fallback, generatedBy: 'sample', fallbackReason: describeModelFailure(err) };
    }
  }
  const res = await fn(sampleAdapter);
  logUsage(ownerId, kind, 'sample', true);
  return res;
}

export { sampleAdapter };
