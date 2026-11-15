import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_DEFAULT_DEMO_PASSWORD, seedOnStart } from '../../server/seedOnStart.ts';
import type { SeedSummary } from '../../server/scripts/seed.ts';

const summary: SeedSummary = {
  account: 'created',
  context: { outcome: 'added', facts: 5 },
  apps: [{ name: 'Riff', outcome: 'added', detail: '3 records' }, { name: 'Light', outcome: 'added', detail: '4 photos' }, { name: 'People', outcome: 'added', detail: '4 people' }],
  photosCopied: 4,
  captures: [],
  recommendations: { outcome: 'regenerated', count: 4 },
};
const STRONG = 'a-dedicated-demo-password-for-judges';

afterEach(() => vi.restoreAllMocks());

describe('seedOnStart (opt-in demo seeding for a hosted demo)', () => {
  it('does nothing unless SEED_DEMO_ON_START=true', async () => {
    const run = vi.fn(async () => ({ summary }));
    expect(await seedOnStart({ SEED_DEMO_PASSWORD: STRONG }, run)).toEqual({ status: 'off' });
    expect(await seedOnStart({ SEED_DEMO_ON_START: 'false', SEED_DEMO_PASSWORD: STRONG }, run)).toEqual({ status: 'off' });
    expect(await seedOnStart({ SEED_DEMO_ON_START: '1', SEED_DEMO_PASSWORD: STRONG }, run)).toEqual({ status: 'off' });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses without a dedicated password: unset, the public default, or too short', async () => {
    const run = vi.fn(async () => ({ summary }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const env of [
      { SEED_DEMO_ON_START: 'true' },
      { SEED_DEMO_ON_START: 'true', SEED_DEMO_PASSWORD: '' },
      { SEED_DEMO_ON_START: 'true', SEED_DEMO_PASSWORD: PUBLIC_DEFAULT_DEMO_PASSWORD },
      { SEED_DEMO_ON_START: 'true', SEED_DEMO_PASSWORD: 'short-pass' },
    ]) {
      expect((await seedOnStart(env, run)).status).toBe('refused');
    }
    expect(run).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('runs the additive seed once, quietly, and never logs the password', async () => {
    const run = vi.fn(async () => ({ summary }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await seedOnStart({ SEED_DEMO_ON_START: 'true', SEED_DEMO_PASSWORD: STRONG }, run);
    expect(out).toEqual({ status: 'seeded', summary });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ quiet: true });
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('demo account created');
    expect(logged).not.toContain(STRONG);
  });

  it('a seeding failure is reported and never stops the server from starting', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await seedOnStart({ SEED_DEMO_ON_START: 'true', SEED_DEMO_PASSWORD: STRONG }, async () => { throw new Error('disk full'); });
    expect(out).toEqual({ status: 'failed', reason: 'disk full' });
    expect(error.mock.calls.flat().join(' ')).not.toContain(STRONG);
  });
});
