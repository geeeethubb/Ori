/**
 * Operation-bound companion mood (docs/ori/ORI_DESIGN_SPEC.md section 5).
 *
 * The companion reflects the CURRENT UI operation, never a model-chosen mood:
 * - a pending capture or revision request is "thinking"; a pending create or apply is "building";
 * - "success" only follows a server-confirmed result, shows briefly, then returns to idle;
 * - "discovery" means a valid proposal arrived: one short arrival, then it stays put (settled);
 * - error and clarification of the active operation win over ambient focus;
 * - composer focus gives "attentive" only when nothing is pending, failed or waiting on a choice.
 *
 * Every operation gets an id. begin() returns it as a token and only the current token can resolve
 * the operation, so a late response from an older request never changes the mood. After about ten
 * seconds of pending the character settles (stops moving) while the UI keeps its truthful pending
 * label. Cancel, reset (route change) and unmount clear every timer.
 *
 * Layers: a pure reducer (oriMoodReducer + moodOf), a framework-free controller that owns the one
 * timer, and a small React hook. Tests drive the reducer and controller with fake timers.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { OriMood } from '@shared/oriArt.ts';

export const ORI_MOOD_TIMING = {
  /** How long "Ready" shows after a server-confirmed success before returning to idle. */
  successMs: 1500,
  /** The discovery arrival (one gentle 200–300 ms motion) before the proposal state goes static. */
  discoverySettleMs: 300,
  /** Pending motion stops after this long; the pending label stays. No invented progress. */
  pendingSettleMs: 10_000,
} as const;

export type OriMoodTiming = { readonly successMs: number; readonly discoverySettleMs: number; readonly pendingSettleMs: number };

/**
 * capture: an Agent share is being read; revision: a change preview is being prepared (both "thinking").
 * create: Make mine is building an app; apply: a revision is being applied (both "building").
 */
export type OriOperationKind = 'capture' | 'revision' | 'create' | 'apply';

/** An operation id. 0 is never a live operation. */
export type OriToken = number;
export const NO_ORI_TOKEN: OriToken = 0;

export type OriPhase = 'idle' | 'pending' | 'success' | 'discovery' | 'clarify' | 'error';

export interface OriMoodState {
  /** Last id handed out; monotonic for the controller's lifetime, including across resets. */
  seq: number;
  /** The current operation, or null when nothing is in flight or being acknowledged. */
  op: { id: OriToken; kind: OriOperationKind } | null;
  phase: OriPhase;
  /** True once motion should stop: pending for too long, or the discovery arrival is over. */
  settled: boolean;
  /** Composer focus. Only ever shows as "attentive" when idle or after a discovery. */
  focused: boolean;
}

export const initialOriMoodState: OriMoodState = { seq: 0, op: null, phase: 'idle', settled: false, focused: false };

type OperationAction = 'succeed' | 'fail' | 'clarify' | 'discover' | 'cancel' | 'settle' | 'expire';

export type OriMoodAction =
  | { type: 'begin'; kind: OriOperationKind }
  | { type: OperationAction; token: OriToken }
  | { type: 'focus' }
  | { type: 'blur' }
  | { type: 'reset' };

const BUILD_KINDS: ReadonlySet<OriOperationKind> = new Set<OriOperationKind>(['create', 'apply']);

/** Pure transition function. Returns the same object when nothing changes. */
export function oriMoodReducer(state: OriMoodState, action: OriMoodAction): OriMoodState {
  switch (action.type) {
    case 'begin': {
      // A new operation supersedes whatever was current (including an error: that is a retry).
      const id = state.seq + 1;
      return { ...state, seq: id, op: { id, kind: action.kind }, phase: 'pending', settled: false };
    }
    case 'focus':
      return state.focused ? state : { ...state, focused: true };
    case 'blur':
      return state.focused ? { ...state, focused: false } : state;
    case 'reset':
      return { ...initialOriMoodState, seq: state.seq };
    default:
      break;
  }
  // Everything else concerns one operation. A token that is not the current operation is stale.
  if (!state.op || state.op.id !== action.token) return state;
  switch (action.type) {
    case 'succeed':
      return state.phase === 'pending' ? { ...state, phase: 'success', settled: false } : state;
    case 'discover':
      return state.phase === 'pending' ? { ...state, phase: 'discovery', settled: false } : state;
    case 'clarify':
      return state.phase === 'pending' ? { ...state, phase: 'clarify', settled: false } : state;
    case 'fail':
      return state.phase === 'pending' ? { ...state, phase: 'error', settled: false } : state;
    case 'cancel':
      return { ...state, op: null, phase: 'idle', settled: false };
    case 'settle':
      return (state.phase === 'pending' || state.phase === 'discovery') && !state.settled ? { ...state, settled: true } : state;
    case 'expire':
      return state.phase === 'success' ? { ...state, op: null, phase: 'idle', settled: false } : state;
  }
}

/** The mood to render for a state. */
export function moodOf(state: OriMoodState): OriMood {
  switch (state.phase) {
    case 'error':
      return 'error';
    case 'clarify':
      return 'clarify';
    case 'pending':
      return state.op && BUILD_KINDS.has(state.op.kind) ? 'building' : 'thinking';
    case 'success':
      // A short, server-confirmed acknowledgement; focus does not hide it.
      return 'success';
    case 'discovery':
      return state.focused ? 'attentive' : 'discovery';
    case 'idle':
      return state.focused ? 'attentive' : 'idle';
  }
}

export interface OriMoodController {
  getState(): OriMoodState;
  subscribe(listener: () => void): () => void;
  /** Start an operation; returns its token. Returns NO_ORI_TOKEN after dispose. */
  begin(kind: OriOperationKind): OriToken;
  /** Server-confirmed success of this operation (persisted, usable). */
  succeed(token: OriToken): void;
  fail(token: OriToken): void;
  /** A genuinely missing choice blocks this operation. */
  clarify(token: OriToken): void;
  /** A valid, useful proposal arrived for this operation. */
  discover(token: OriToken): void;
  /** Stop showing this operation (cancelled, or an error/proposal dismissed). */
  cancel(token: OriToken): void;
  /** Whether a token is still the current operation (use it to drop stale results elsewhere too). */
  isCurrent(token: OriToken): boolean;
  focus(): void;
  blur(): void;
  /** Route change: forget the operation and focus, clear the timer. */
  reset(): void;
  /** Unmount: clear the timer, reset, and ignore every later call until activate(). */
  dispose(): void;
  activate(): void;
}

/** Framework-free controller: owns the state and at most one timer. */
export function createOriMoodController(timing: OriMoodTiming = ORI_MOOD_TIMING): OriMoodController {
  let state = initialOriMoodState;
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const schedule = (ms: number, action: OriMoodAction) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      dispatch(action);
    }, ms);
  };
  // The one timer always belongs to the current phase of the current operation.
  const syncTimer = (prev: OriMoodState, next: OriMoodState) => {
    if (prev.phase === next.phase && prev.op?.id === next.op?.id) return;
    clearTimer();
    if (!next.op) return;
    if (next.phase === 'pending') schedule(timing.pendingSettleMs, { type: 'settle', token: next.op.id });
    else if (next.phase === 'discovery') schedule(timing.discoverySettleMs, { type: 'settle', token: next.op.id });
    else if (next.phase === 'success') schedule(timing.successMs, { type: 'expire', token: next.op.id });
  };
  const dispatch = (action: OriMoodAction) => {
    if (!active) return;
    const next = oriMoodReducer(state, action);
    if (next === state) return;
    const prev = state;
    state = next;
    syncTimer(prev, next);
    notify();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin(kind) {
      if (!active) return NO_ORI_TOKEN;
      dispatch({ type: 'begin', kind });
      return state.op?.id ?? NO_ORI_TOKEN;
    },
    succeed: (token) => dispatch({ type: 'succeed', token }),
    fail: (token) => dispatch({ type: 'fail', token }),
    clarify: (token) => dispatch({ type: 'clarify', token }),
    discover: (token) => dispatch({ type: 'discover', token }),
    cancel: (token) => dispatch({ type: 'cancel', token }),
    isCurrent: (token) => token !== NO_ORI_TOKEN && state.op?.id === token,
    focus: () => dispatch({ type: 'focus' }),
    blur: () => dispatch({ type: 'blur' }),
    reset() {
      clearTimer();
      dispatch({ type: 'reset' });
    },
    dispose() {
      clearTimer();
      active = false;
      const next = oriMoodReducer(state, { type: 'reset' });
      if (next !== state) {
        state = next;
        notify();
      }
    },
    activate() {
      active = true;
    },
  };
}

export interface OriMoodHandle {
  mood: OriMood;
  /** Stop motion (OriCompanion motion="none") while keeping the mood and any pending label. */
  settled: boolean;
  phase: OriPhase;
  /** Kind of the pending operation, for a truthful label ("Making Light yours…"). */
  pendingKind: OriOperationKind | null;
  /** Spread onto <OriCompanion>: the mood plus motion that stops once settled. */
  companion: { mood: OriMood; motion: 'auto' | 'none' };
  begin: OriMoodController['begin'];
  succeed: OriMoodController['succeed'];
  fail: OriMoodController['fail'];
  clarify: OriMoodController['clarify'];
  discover: OriMoodController['discover'];
  cancel: OriMoodController['cancel'];
  isCurrent: OriMoodController['isCurrent'];
  focus: OriMoodController['focus'];
  blur: OriMoodController['blur'];
  reset: OriMoodController['reset'];
}

/**
 * Companion mood for one surface. Pass the route (or another key) as `resetKey` so a route change
 * forgets the operation and clears its timer; unmount does the same.
 */
export function useOriMood(options: { resetKey?: unknown } = {}): OriMoodHandle {
  const [controller] = useState(() => createOriMoodController());
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);

  const lastKey = useRef(options.resetKey);
  useEffect(() => {
    if (Object.is(lastKey.current, options.resetKey)) return;
    lastKey.current = options.resetKey;
    controller.reset();
  }, [controller, options.resetKey]);

  return useMemo(() => {
    const mood = moodOf(state);
    return {
      mood,
      settled: state.settled,
      phase: state.phase,
      pendingKind: state.phase === 'pending' ? (state.op?.kind ?? null) : null,
      companion: { mood, motion: state.settled ? 'none' : 'auto' },
      begin: controller.begin,
      succeed: controller.succeed,
      fail: controller.fail,
      clarify: controller.clarify,
      discover: controller.discover,
      cancel: controller.cancel,
      isCurrent: controller.isCurrent,
      focus: controller.focus,
      blur: controller.blur,
      reset: controller.reset,
    };
  }, [controller, state]);
}
