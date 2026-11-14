/**
 * Countdown state for practice views, kept OUTSIDE the component tree so switching tabs inside the
 * app page never loses a running session, and persisted on this device so a reload or a closed
 * page does not either. Time is derived from clock timestamps (never from counting ticks): a paused
 * stretch is excluded, a running one continues from its start time after a reload, and a countdown
 * that ended while the page was hidden or closed is marked so the person can check before saving.
 *
 * Target and measured time stay apart: `presetMinutes` is the plan, `elapsedMs` is what the clock
 * measured. Each timed session has an id minted on its first Start; the saved record uses it, so a
 * retried save is one session, not two.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { newId } from '@shared/ids.ts';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface TimerState {
  presetMinutes: number;
  status: TimerStatus;
  /** Epoch ms when the current running stretch began (running only). */
  startedAt: number | null;
  /** Milliseconds completed in earlier stretches. */
  accumulatedMs: number;
  /** Minted on the first Start; becomes the saved session's record id. */
  sessionId: string | null;
  /** When the countdown really ended (its start plus what was left), not when someone noticed. */
  completedAt: number | null;
  /** The countdown ended while this page was hidden or closed: the person may have stopped earlier. */
  endedAway: boolean;
  /** Restored with a clock that cannot be trusted (it moved backwards): check before saving. */
  needsReview: boolean;
}

const timers = new Map<string, TimerState>();
/** The default preset each timer was created from, so a changed default can be told apart from a choice. */
const seededFrom = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
const STORE_PREFIX = 'aas_timer_';

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

function initial(preset: number): TimerState {
  return { presetMinutes: preset, status: 'idle', startedAt: null, accumulatedMs: 0, sessionId: null, completedAt: null, endedAway: false, needsReview: false };
}

function persist(key: string, t: TimerState): void {
  try {
    if (t.status === 'idle' && t.accumulatedMs === 0) window.localStorage.removeItem(STORE_PREFIX + key);
    else window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(t));
  } catch {
    /* private mode or blocked storage: the session still works until the page closes */
  }
}

function isTimerState(v: unknown): v is TimerState {
  if (!v || typeof v !== 'object') return false;
  const t = v as Partial<TimerState>;
  return typeof t.presetMinutes === 'number' && typeof t.accumulatedMs === 'number' && ['idle', 'running', 'paused', 'done'].includes(String(t.status));
}

/** A session kept on this device across a reload or a closed page, reconciled with the clock. */
function hydrate(key: string, now: number): TimerState | null {
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isTimerState(parsed)) return null;
    const t: TimerState = { ...initial(parsed.presetMinutes), ...parsed };
    if (t.status === 'running' && t.startedAt !== null) {
      // The clock went backwards: keep only what was measured before this stretch and ask for a check.
      if (now < t.startedAt) return { ...t, status: 'paused', startedAt: null, needsReview: true };
      // Otherwise the countdown simply continued; if it ended while the page was closed, say so.
      return settleTimer(t, now, { away: true });
    }
    return t;
  } catch {
    return null;
  }
}

export function readTimer(key: string, preset: number): TimerState {
  let t = timers.get(key);
  if (!t) {
    const restored = typeof window !== 'undefined' ? hydrate(key, Date.now()) : null;
    t = restored ?? initial(preset);
    timers.set(key, t);
    seededFrom.set(key, preset);
    return t;
  }
  const seeded = seededFrom.get(key);
  if (seeded !== preset) {
    // The app's default changed (e.g. a revision altered the presets): an untouched idle timer follows
    // the new default; anything the person chose or started is left alone.
    if (t.status === 'idle' && t.accumulatedMs === 0 && t.presetMinutes === seeded) {
      t = initial(preset);
      timers.set(key, t);
    }
    seededFrom.set(key, preset);
  }
  return t;
}

export function writeTimer(key: string, next: TimerState): void {
  timers.set(key, next);
  if (typeof window !== 'undefined') persist(key, next);
  emit(key);
}

export function targetMs(t: TimerState): number {
  return t.presetMinutes * 60_000;
}

/** Milliseconds elapsed so far, capped at the target once the countdown has ended. */
export function elapsedMs(t: TimerState, now: number = Date.now()): number {
  const live = t.status === 'running' && t.startedAt !== null ? Math.max(0, now - t.startedAt) : 0;
  return Math.min(targetMs(t), t.accumulatedMs + live);
}

export function remainingMs(t: TimerState, now: number = Date.now()): number {
  return Math.max(0, targetMs(t) - elapsedMs(t, now));
}

export function startTimer(t: TimerState, now: number = Date.now()): TimerState {
  if (t.status === 'running') return t;
  // "Again" after a finished countdown is a new session with its own id.
  if (t.status === 'done') return { ...initial(t.presetMinutes), status: 'running', startedAt: now, sessionId: newId() };
  return { ...t, status: 'running', startedAt: now, sessionId: t.sessionId ?? newId(), needsReview: false };
}

export function pauseTimer(t: TimerState, now: number = Date.now()): TimerState {
  if (t.status !== 'running') return t;
  return { ...t, status: 'paused', startedAt: null, accumulatedMs: elapsedMs(t, now) };
}

export function resetTimer(t: TimerState, preset: number = t.presetMinutes): TimerState {
  return initial(preset);
}

/** Choosing a length only applies before a session starts: measured time is never thrown away by a tap. */
export function selectPreset(t: TimerState, preset: number): TimerState {
  if (t.status !== 'idle' || t.accumulatedMs > 0) return t;
  return initial(preset);
}

/** Running timers that hit zero become `done`, recording when the countdown really ended. */
export function settleTimer(t: TimerState, now: number = Date.now(), opts: { away?: boolean } = {}): TimerState {
  if (t.status === 'running' && remainingMs(t, now) <= 0) {
    const completedAt = (t.startedAt ?? now) + Math.max(0, targetMs(t) - t.accumulatedMs);
    return { ...t, status: 'done', startedAt: null, accumulatedMs: targetMs(t), completedAt, endedAway: Boolean(opts.away) };
  }
  return t;
}

// The tempo the person dialled in also survives a tab switch (it is not persisted across reloads).
const tempos = new Map<string, number>();

export function readTempo(key: string, fallback: number): number {
  return tempos.get(key) ?? fallback;
}

export function writeTempo(key: string, bpm: number): void {
  tempos.set(key, bpm);
}

export interface TimerApi {
  state: TimerState;
  now: number;
  elapsed: number;
  remaining: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  choosePreset: (minutes: number) => void;
}

/** Subscribe to one timer; re-renders four times a second while it runs. */
export function usePracticeTimer(key: string, defaultPreset: number): TimerApi {
  const subscribe = useCallback(
    (cb: () => void) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(cb);
      listeners.set(key, set);
      return () => {
        set.delete(cb);
      };
    },
    [key],
  );
  const state = useSyncExternalStore(subscribe, () => readTimer(key, defaultPreset), () => readTimer(key, defaultPreset));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.status !== 'running') return;
    setNow(Date.now());
    const tick = () => {
      const t = Date.now();
      setNow(t);
      // A countdown that ends while the page is hidden is marked: the person may have stopped earlier.
      const settled = settleTimer(readTimer(key, defaultPreset), t, { away: document.visibilityState === 'hidden' });
      if (settled.status === 'done') writeTimer(key, settled);
    };
    const id = window.setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const t = Date.now();
      setNow(t);
      const settled = settleTimer(readTimer(key, defaultPreset), t, { away: true });
      if (settled.status === 'done') writeTimer(key, settled);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state.status, key, defaultPreset]);

  const update = useCallback((fn: (t: TimerState) => TimerState) => writeTimer(key, fn(readTimer(key, defaultPreset))), [key, defaultPreset]);

  return {
    state,
    now,
    elapsed: elapsedMs(state, now),
    remaining: remainingMs(state, now),
    start: () => update((t) => startTimer(t)),
    pause: () => update((t) => pauseTimer(t)),
    reset: () => update((t) => resetTimer(t)),
    choosePreset: (m) => update((t) => selectPreset(t, m)),
  };
}
