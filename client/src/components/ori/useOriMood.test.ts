/**
 * Companion mood is bound to the current UI operation: success only after a confirmed result,
 * stale responses ignored, timers released on cancel/reset/unmount, focus never hides real work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NO_ORI_TOKEN,
  ORI_MOOD_TIMING,
  createOriMoodController,
  initialOriMoodState,
  moodOf,
  oriMoodReducer,
  type OriMoodController,
} from './useOriMood.ts';

let ori: OriMoodController;
const mood = () => moodOf(ori.getState());

beforeEach(() => {
  vi.useFakeTimers();
  ori = createOriMoodController();
});
afterEach(() => {
  ori.dispose();
  vi.useRealTimers();
});

describe('the current request drives the mood', () => {
  it('a create is "building" until the server confirms, then "success" briefly, then idle', () => {
    const t = ori.begin('create');
    expect(mood()).toBe('building');
    ori.succeed(t);
    expect(mood()).toBe('success');
    vi.advanceTimersByTime(ORI_MOOD_TIMING.successMs - 1);
    expect(mood()).toBe('success');
    vi.advanceTimersByTime(1);
    expect(mood()).toBe('idle');
    expect(ori.getState().op).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a capture or revision request is "thinking"; an apply is "building"', () => {
    ori.begin('capture');
    expect(mood()).toBe('thinking');
    ori.begin('revision');
    expect(mood()).toBe('thinking');
    ori.begin('apply');
    expect(mood()).toBe('building');
  });

  it('an error is static and stays until a retry, which starts a fresh operation', () => {
    const first = ori.begin('capture');
    ori.fail(first);
    expect(mood()).toBe('error');
    vi.advanceTimersByTime(60_000);
    expect(mood()).toBe('error');
    expect(vi.getTimerCount()).toBe(0);
    const retry = ori.begin('capture');
    expect(retry).not.toBe(first);
    expect(mood()).toBe('thinking');
    ori.succeed(retry);
    expect(mood()).toBe('success');
  });

  it('a missing choice asks for clarification and holds there', () => {
    const t = ori.begin('revision');
    ori.clarify(t);
    expect(mood()).toBe('clarify');
    vi.advanceTimersByTime(60_000);
    expect(mood()).toBe('clarify');
  });

  it('cancel returns to idle, clears the timer, and a late answer changes nothing', () => {
    const t = ori.begin('create');
    expect(vi.getTimerCount()).toBe(1);
    ori.cancel(t);
    expect(mood()).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
    ori.succeed(t);
    ori.fail(t);
    expect(mood()).toBe('idle');
    expect(ori.isCurrent(t)).toBe(false);
  });
});

describe('stale responses never hijack a newer task', () => {
  it('a late success, failure or proposal for an older request is ignored', () => {
    const older = ori.begin('capture');
    const newer = ori.begin('create');
    ori.succeed(older);
    expect(mood()).toBe('building');
    ori.fail(older);
    ori.clarify(older);
    ori.discover(older);
    ori.cancel(older);
    expect(mood()).toBe('building');
    expect(ori.isCurrent(older)).toBe(false);
    expect(ori.isCurrent(newer)).toBe(true);
    ori.succeed(newer);
    expect(mood()).toBe('success');
  });

  it("an older request's timer cannot settle or expire the newer one", () => {
    const older = ori.begin('create');
    vi.advanceTimersByTime(ORI_MOOD_TIMING.pendingSettleMs - 100);
    ori.begin('create');
    vi.advanceTimersByTime(200);
    expect(ori.getState().settled).toBe(false);
    expect(ori.isCurrent(older)).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('the reducer returns the very same state for a stale token', () => {
    const s1 = oriMoodReducer(initialOriMoodState, { type: 'begin', kind: 'capture' });
    const s2 = oriMoodReducer(s1, { type: 'begin', kind: 'create' });
    for (const type of ['succeed', 'fail', 'clarify', 'discover', 'cancel', 'settle', 'expire'] as const) {
      expect(oriMoodReducer(s2, { type, token: s1.op!.id })).toBe(s2);
    }
  });
});

describe('success needs a confirmed result', () => {
  it('never on begin, and never because time passed', () => {
    ori.begin('create');
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(5_000);
      expect(mood()).toBe('building');
    }
  });

  it('long pending settles the motion but keeps the pending mood', () => {
    ori.begin('create');
    vi.advanceTimersByTime(ORI_MOOD_TIMING.pendingSettleMs - 1);
    expect(ori.getState().settled).toBe(false);
    vi.advanceTimersByTime(1);
    expect(ori.getState().settled).toBe(true);
    expect(mood()).toBe('building');
    expect(ori.getState().phase).toBe('pending');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a resolution only applies while the operation is pending', () => {
    const t = ori.begin('create');
    ori.fail(t);
    ori.succeed(t);
    expect(mood()).toBe('error');
  });
});

describe('discovery', () => {
  it('arrives once, then settles while staying a discovery', () => {
    const t = ori.begin('capture');
    ori.discover(t);
    expect(mood()).toBe('discovery');
    expect(ori.getState().settled).toBe(false);
    vi.advanceTimersByTime(ORI_MOOD_TIMING.discoverySettleMs);
    expect(mood()).toBe('discovery');
    expect(ori.getState().settled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('focus is ambient', () => {
  it('gives "attentive" only when nothing is pending, failed or waiting on a choice', () => {
    ori.focus();
    expect(mood()).toBe('attentive');
    const t = ori.begin('create');
    expect(mood()).toBe('building');
    ori.blur();
    ori.focus();
    expect(mood()).toBe('building');
    ori.succeed(t);
    expect(mood()).toBe('success');
    vi.advanceTimersByTime(ORI_MOOD_TIMING.successMs);
    expect(mood()).toBe('attentive');
    ori.blur();
    expect(mood()).toBe('idle');
  });

  it('never overrides an error or a clarification', () => {
    const failed = ori.begin('apply');
    ori.fail(failed);
    ori.focus();
    expect(mood()).toBe('error');
    const asking = ori.begin('revision');
    ori.clarify(asking);
    ori.blur();
    ori.focus();
    expect(mood()).toBe('clarify');
  });

  it('a late blur during a build does not hide it', () => {
    ori.focus();
    ori.begin('create');
    ori.blur();
    expect(mood()).toBe('building');
  });
});

describe('teardown releases everything', () => {
  it('reset (route change) forgets the operation and clears the timer', () => {
    const t = ori.begin('create');
    ori.focus();
    ori.reset();
    expect(mood()).toBe('idle');
    expect(ori.getState().focused).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    ori.succeed(t);
    expect(mood()).toBe('idle');
    const next = ori.begin('capture');
    expect(next).toBeGreaterThan(t);
  });

  it('dispose (unmount) clears timers and ignores later calls until reactivated', () => {
    const t = ori.begin('create');
    ori.succeed(t);
    expect(vi.getTimerCount()).toBe(1);
    ori.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(mood()).toBe('idle');
    expect(ori.begin('create')).toBe(NO_ORI_TOKEN);
    expect(vi.getTimerCount()).toBe(0);
    expect(mood()).toBe('idle');
    ori.activate();
    expect(ori.begin('create')).not.toBe(NO_ORI_TOKEN);
    expect(mood()).toBe('building');
  });

  it('subscribers hear each real change once and can unsubscribe', () => {
    const heard = vi.fn();
    const off = ori.subscribe(heard);
    const t = ori.begin('capture');
    ori.succeed(t + 1);
    ori.focus();
    ori.focus();
    expect(heard).toHaveBeenCalledTimes(2);
    off();
    ori.succeed(t);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
