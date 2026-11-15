/**
 * Opt-in demo seeding at boot, for a hosted demo where no shell is available to run `npm run seed`.
 *
 * With SEED_DEMO_ON_START=true the server runs the same seed as `npm run seed` (never `--reset`) once at
 * startup, before it serves requests: it creates the clearly labelled demo account demo@aiappstore.local
 * if it is missing and otherwise adds only missing demo pieces. It never touches other accounts and never
 * changes an existing demo password (the password is used only when the account is created).
 *
 * It refuses to run without a dedicated SEED_DEMO_PASSWORD (unset, the public default from the docs, or
 * shorter than 12 characters), so a public deployment never gets a demo account with a known password.
 * The password is never logged.
 */
import type { SeedSummary } from './scripts/seed.ts';

/** The development default documented in the repository; never acceptable on a hosted demo. */
export const PUBLIC_DEFAULT_DEMO_PASSWORD = 'demo-pass-2026';

export type SeedOnStartOutcome =
  | { status: 'off' }
  | { status: 'refused'; reason: string }
  | { status: 'seeded'; summary: SeedSummary }
  | { status: 'failed'; reason: string };

type SeedFn = (opts: { quiet?: boolean }) => Promise<{ summary: SeedSummary }>;

export async function seedOnStart(env: NodeJS.ProcessEnv = process.env, run?: SeedFn): Promise<SeedOnStartOutcome> {
  if ((env.SEED_DEMO_ON_START ?? '').trim().toLowerCase() !== 'true') return { status: 'off' };
  const password = env.SEED_DEMO_PASSWORD ?? '';
  if (!password || password === PUBLIC_DEFAULT_DEMO_PASSWORD || password.length < 12) {
    const reason = 'SEED_DEMO_PASSWORD must be a dedicated value of at least 12 characters, not the public default';
    console.warn(`[seed] SEED_DEMO_ON_START is on, but ${reason}; the demo account was not seeded.`);
    return { status: 'refused', reason };
  }
  try {
    const seed = run ?? (await import('./scripts/seed.ts')).seedDemo;
    const { summary } = await seed({ quiet: true });
    console.log(`[seed] demo account ${summary.account}; ${summary.apps.map((a) => `${a.name} ${a.outcome}`).join(', ')}; ${summary.photosCopied} example photos copied`);
    return { status: 'seeded', summary };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[seed] demo seeding failed (the server still starts): ${reason}`);
    return { status: 'failed', reason };
  }
}
