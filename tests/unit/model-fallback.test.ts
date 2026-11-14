import { describe, expect, it } from 'vitest';
import { extractJsonObject } from '../../server/model/anthropic.ts';
import { runWithFallback } from '../../server/model/index.ts';
import { ModelOutputError, type ModelAdapter } from '../../server/model/types.ts';

const stub = (mode: 'anthropic' | 'sample', impl: () => Promise<unknown>): ModelAdapter =>
  ({
    mode,
    extractFacts: async () => ({ data: (await impl()) as never, generatedBy: mode }),
    recommend: async () => ({ data: (await impl()) as never, generatedBy: mode }),
    generateSpec: async () => ({ data: (await impl()) as never, generatedBy: mode }),
    proposeRevision: async () => ({ data: (await impl()) as never, generatedBy: mode }),
    suggestImprovement: async () => ({ data: (await impl()) as never, generatedBy: mode }),
  }) as ModelAdapter;

describe('extractJsonObject', () => {
  it('reads a bare object, a fenced object, and an object surrounded by prose', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":{"b":"}"}}\n```')).toEqual({ a: { b: '}' } });
    expect(extractJsonObject('Here you go:\n{"ok":true,"s":"with \\" quote"}\nThanks')).toEqual({ ok: true, s: 'with " quote' });
  });
  it('returns undefined for truncated or missing JSON', () => {
    expect(extractJsonObject('no json here')).toBeUndefined();
    expect(extractJsonObject('{"a": [1, 2')).toBeUndefined();
  });
});

describe('runWithFallback', () => {
  it('uses the live adapter when it succeeds and records usage', async () => {
    const calls: [string, boolean][] = [];
    const res = await runWithFallback(stub('anthropic', async () => 'live'), stub('sample', async () => 'sample'), (a) => a.recommend({} as never), (p, ok) => calls.push([p, ok]));
    expect(res.data).toBe('live');
    expect(res.generatedBy).toBe('anthropic');
    expect(res.fallbackReason).toBeUndefined();
    expect(calls).toEqual([['anthropic', true]]);
  });
  it('falls back to sample on malformed model output and labels the result honestly', async () => {
    const calls: [string, boolean][] = [];
    const res = await runWithFallback(
      stub('anthropic', async () => { throw new ModelOutputError('The generated app definition did not pass validation.'); }),
      stub('sample', async () => 'sample'),
      (a) => a.generateSpec({} as never),
      (p, ok) => calls.push([p, ok]),
    );
    expect(res.data).toBe('sample');
    expect(res.generatedBy).toBe('sample');
    expect(res.fallbackReason).toMatch(/did not pass validation/);
    // The failed live attempt is logged as not ok (never counts toward the allowance); the fallback is not billed as live.
    expect(calls).toEqual([['anthropic', false]]);
  });
  it('falls back on network/timeout style errors with a friendly reason', async () => {
    const err = Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' });
    const res = await runWithFallback(stub('anthropic', async () => { throw err; }), stub('sample', async () => 'sample'), (a) => a.extractFacts({} as never));
    expect(res.generatedBy).toBe('sample');
    expect(res.fallbackReason).toMatch(/took too long/);
  });
  it('runs sample directly when no live adapter is configured', async () => {
    const res = await runWithFallback(null, stub('sample', async () => 'sample'), (a) => a.recommend({} as never));
    expect(res.generatedBy).toBe('sample');
    expect(res.fallbackReason).toBeUndefined();
  });
});
