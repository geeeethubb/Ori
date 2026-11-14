/** Environment configuration. Loads `.env` (if present) without printing any values. */
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(file = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

const env = process.env;

export type ModelProviderSetting = 'auto' | 'anthropic' | 'sample';

export const config = {
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? '0.0.0.0',
  databasePath: env.DATABASE_PATH ?? './data/app.db',
  publicOrigin: (env.PUBLIC_ORIGIN ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, ''),
  cookieSecure: env.COOKIE_SECURE ?? 'auto',
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  modelProvider: ((env.MODEL_PROVIDER ?? 'auto') as ModelProviderSetting),
  anthropicApiKey: env.ANTHROPIC_API_KEY && !/dummy|replace-me/i.test(env.ANTHROPIC_API_KEY) ? env.ANTHROPIC_API_KEY : undefined,
  anthropicModel: env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
  modelTimeoutMs: Number(env.MODEL_TIMEOUT_MS ?? 45_000),
  seedDemoPassword: env.SEED_DEMO_PASSWORD ?? 'demo-pass-2026',
  clientDist: path.resolve(process.cwd(), 'dist/client'),
  isTest: env.NODE_ENV === 'test' || Boolean(env.VITEST),
  /** Monthly AI generation fair-use allowance disclosed to users. */
  aiGenerationAllowance: Number(env.AI_GENERATION_ALLOWANCE ?? 300),
  trialDays: 14,
};

/** Resolved model mode: never leaks the key, only whether one exists. */
export function resolveModelMode(): 'anthropic' | 'sample' {
  if (config.modelProvider === 'sample') return 'sample';
  if (config.modelProvider === 'anthropic') return config.anthropicApiKey ? 'anthropic' : 'sample';
  return config.anthropicApiKey ? 'anthropic' : 'sample';
}
