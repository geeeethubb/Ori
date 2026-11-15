/**
 * Companion mood is bound to the current UI operation: success only after a confirmed result,
 * stale responses ignored, timers released on cancel/reset/unmount, focus never hides real work
 * or a fresh proposal, and React StrictMode's simulated remount loses nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NO_ORI_TOKEN,
  ORI_MOOD_TIMING,
  createOriMoodController,
  createOriMoodLifecycle,
  initialOriMoodState,
  moodOf,
  oriMoodReducer,
  settledOf,
  type OriMoodController,
} from './useOriMood.ts';

let ori: OriMoodController;
const mood = () => moodOf(ori.getState());
/** What the hook hands <OriCompanion>: settled stops the motion of the mood on show. */
const settled = () => settledOf(ori.getState());
/** Let queued microtasks run (the lifecycle's deferred dispose). */
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

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

describe('a proposal and the composer', () => {
  it('shows "Found something" even when the composer kept focus after Enter, and settles there', () => {
    ori.focus();
    const t = ori.begin('capture');
    expect(mood()).toBe('thinking');
    ori.discover(t);
    expect(mood()).toBe('discovery');
    expect(settled()).toBe(false); // the arrival plays
    vi.advanceTimersByTime(ORI_MOOD_TIMING.discoverySettleMs);
    expect(mood()).toBe('discovery'); // focus from before the proposal does not hide it
    expect(settled()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('typing shows Listening at once, with its lean; leaving the composer returns to the still proposal', () => {
    ori.focus();
    const t = ori.begin('capture');
    ori.discover(t);
    ori.typing();
    expect(mood()).toBe('attentive');
    expect(settled()).toBe(false);
    vi.advanceTimersByTime(ORI_MOOD_TIMING.discoverySettleMs);
    expect(mood()).toBe('attentive');
    expect(settled()).toBe(false); // settled belongs to the discovery, so the lean is not suppressed
    ori.blur();
    expect(mood()).toBe('discovery');
    expect(settled()).toBe(true); // back on the proposal it stays still: no second arrival
  });

  it('focusing the composer again shows Listening once the arrival has played', () => {
    const t = ori.begin('capture');
    ori.discover(t);
    ori.focus(); // during the arrival: the discovery finishes first
    expect(mood()).toBe('discovery');
    vi.advanceTimersByTime(ORI_MOOD_TIMING.discoverySettleMs);
    expect(mood()).toBe('attentive');
    expect(settled()).toBe(false);
    ori.blur();
    expect(mood()).toBe('discovery');
    ori.focus(); // after the arrival: at once
    expect(mood()).toBe('attentive');
    expect(ori.getState().phase).toBe('discovery'); // the proposal is still there underneath
  });

  it('a newer proposal is news again, whatever the person was doing before it arrived', () => {
    ori.focus();
    ori.typing();
    const first = ori.begin('capture');
    ori.discover(first);
    expect(mood()).toBe('discovery');
    ori.typing();
    expect(mood()).toBe('attentive');
    const second = ori.begin('capture');
    expect(mood()).toBe('thinking'); // typing never hides a pending request
    ori.discover(second);
    expect(mood()).toBe('discovery');
  });

  it('typing never hides pending work, an error or a clarification', () => {
    const t = ori.begin('apply');
    ori.typing();
    expect(mood()).toBe('building');
    ori.fail(t);
    ori.typing();
    expect(mood()).toBe('error');
    const asking = ori.begin('revision');
    ori.clarify(asking);
    ori.typing();
    expect(mood()).toBe('clarify');
  });

  it('a long pending settles its motion, and the next mood moves again', () => {
    const t = ori.begin('create');
    vi.advanceTimersByTime(ORI_MOOD_TIMING.pendingSettleMs);
    expect(settled()).toBe(true);
    ori.succeed(t);
    expect(mood()).toBe('success');
    expect(settled()).toBe(false);
  });
});

describe('React StrictMode remount (development)', () => {
  // StrictMode mounts, unmounts and remounts each new component once, synchronously, with children's
  // effects before their parent's. These steps follow that order; the hook drives the same lifecycle.
  it('an operation begun on mount survives the simulated unmount and remount', async () => {
    const life = createOriMoodLifecycle(ori);
    life.mount();
    const t = ori.begin('capture'); // a child's mount effect, guarded so it runs only once
    life.unmount(); // simulated
    life.mount();
    await flushMicrotasks();
    expect(ori.isCurrent(t)).toBe(true);
    expect(mood()).toBe('thinking');
    expect(vi.getTimerCount()).toBe(1);
    ori.discover(t);
    expect(mood()).toBe('discovery');
  });

  it('a child that begins before its parent re-activates still gets a live operation', async () => {
    const life = createOriMoodLifecycle(ori);
    life.mount();
    life.unmount(); // simulated
    const t = ori.begin('create'); // the child's effect runs before the parent's remount
    expect(t).not.toBe(NO_ORI_TOKEN);
    life.mount();
    await flushMicrotasks();
    expect(mood()).toBe('building');
    ori.succeed(t);
    expect(mood()).toBe('success');
  });

  it('a real unmount still releases every timer straight after, and ignores later calls', async () => {
    const life = createOriMoodLifecycle(ori);
    life.mount();
    const t = ori.begin('create');
    expect(vi.getTimerCount()).toBe(1);
    life.unmount();
    await flushMicrotasks();
    expect(vi.getTimerCount()).toBe(0);
    expect(mood()).toBe('idle');
    ori.succeed(t);
    expect(ori.begin('apply')).toBe(NO_ORI_TOKEN);
    expect(mood()).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });
});
