/**
 * Countdown state for practice views, kept OUTSIDE the component tree so switching tabs inside the
 * app page never loses a running session. Time is derived from timestamps, so a view that remounts
 * after a tab switch shows the right remaining time without anything ticking in the background.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export interface TimerState {
  presetMinutes: number;
  status: TimerStatus;
  /** Epoch ms when the current running stretch began (running only). */
  startedAt: number | null;
  /** Milliseconds completed in earlier stretches. */
  accumulatedMs: number;
}

const timers = new Map<string, TimerState>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

function initial(preset: number): TimerState {
  return { presetMinutes: preset, status: 'idle', startedAt: null, accumulatedMs: 0 };
}

export function readTimer(key: string, preset: number): TimerState {
  let t = timers.get(key);
  if (!t) {
    t = initial(preset);
    timers.set(key, t);
  }
  return t;
}

export function writeTimer(key: string, next: TimerState): void {
  timers.set(key, next);
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
  if (t.status === 'done') return { ...t, status: 'running', startedAt: now, accumulatedMs: 0 };
  return { ...t, status: 'running', startedAt: now };
}

export function pauseTimer(t: TimerState, now: number = Date.now()): TimerState {
  if (t.status !== 'running') return t;
  return { ...t, status: 'paused', startedAt: null, accumulatedMs: elapsedMs(t, now) };
}

export function resetTimer(t: TimerState, preset: number = t.presetMinutes): TimerState {
  return initial(preset);
}

export function selectPreset(t: TimerState, preset: number): TimerState {
  if (t.status === 'running') return t;
  return initial(preset);
}

/** Running timers that hit zero become `done` (elapsed capped at the target). */
export function settleTimer(t: TimerState, now: number = Date.now()): TimerState {
  if (t.status === 'running' && remainingMs(t, now) <= 0) return { ...t, status: 'done', startedAt: null, accumulatedMs: targetMs(t) };
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
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const settled = settleTimer(readTimer(key, defaultPreset), t);
      if (settled.status === 'done') writeTimer(key, settled);
    }, 250);
    return () => window.clearInterval(id);
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
