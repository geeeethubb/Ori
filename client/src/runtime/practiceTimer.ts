/**
 * Countdown state for practice views, kept OUTSIDE the component tree so switching tabs inside the
 * app page never loses a running session, and persisted on this device so a reload or a closed
 * page does not either. Time is derived from clock timestamps (never from counting ticks): a paused
 * stretch is excluded, a running one continues from its start time after a reload, and a countdown
 * that ended while the page was hidden or closed is marked so the person can check before saving.
 *
 * Target and measured time stay apart: `presetMinutes` is the plan, `elapsedMs` is what the clock
 * measured. Each timed session has an id minted on its first Start; the saved record uses it, so a
 * retried save is one session, not two. The save form reports a sent save (noteSaveSent) and asks for
 * a new id when that entry was deleted or changed elsewhere (renewSessionId).
 *
 * Tabs of one app share the stored timer: a tab shows what another tab stored (the storage event,
 * and a check before every write), and never writes over a state it has not seen. Previews (app id
 * "preview") keep their timers in memory only.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { newId } from '@shared/ids.ts';
import { todayIso } from '@shared/time.ts';

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
  /** Epoch ms of the latest Start or Resume, kept through a pause: a session is dated by its last stretch. */
  lastStartedAt: number | null;
  /** When the countdown really ended (its start plus what was left), not when someone noticed. */
  completedAt: number | null;
  /** The countdown ended while this page was hidden or closed: the person may have stopped earlier. */
  endedAway: boolean;
  /** Restored with a clock that cannot be trusted (it moved backwards): check before saving. */
  needsReview: boolean;
  /** A save of this session was sent (noteSaveSent), so it may already be stored under its id (saving again updates it). */
  saveAttempted: boolean;
}

const timers = new Map<string, TimerState>();
/** The default preset each timer was created from, so a changed default can be told apart from a choice. */
const seededFrom = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
/** The stored text this tab last read or wrote for each timer; anything else in storage came from another tab. */
const lastSeen = new Map<string, string | null>();
const STORE_PREFIX = 'aas_timer_';
/** Make-mine previews render with the app id "preview": their timers are never kept on the device. */
const PREVIEW_PREFIX = 'preview:';

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

function initial(preset: number): TimerState {
  return { presetMinutes: preset, status: 'idle', startedAt: null, accumulatedMs: 0, sessionId: null, lastStartedAt: null, completedAt: null, endedAway: false, needsReview: false, saveAttempted: false };
}

/** Whether a timer is kept in this device's storage (never a preview's, never without a browser). */
function keptOnDevice(key: string): boolean {
  return typeof window !== 'undefined' && !key.startsWith(PREVIEW_PREFIX);
}

/** The stored text for a timer (null when there is none); undefined when storage cannot be read. */
function readStored(key: string): string | null | undefined {
  try {
    return window.localStorage.getItem(STORE_PREFIX + key);
  } catch {
    return undefined;
  }
}

function persist(key: string, t: TimerState): void {
  try {
    if (t.status === 'idle' && t.accumulatedMs === 0) {
      window.localStorage.removeItem(STORE_PREFIX + key);
      lastSeen.set(key, null);
    } else {
      const raw = JSON.stringify(t);
      window.localStorage.setItem(STORE_PREFIX + key, raw);
      lastSeen.set(key, raw);
    }
  } catch {
    /* private mode or blocked storage: the session still works until the page closes */
  }
}

function isTimerState(v: unknown): v is TimerState {
  if (!v || typeof v !== 'object') return false;
  const t = v as Partial<TimerState>;
  return typeof t.presetMinutes === 'number' && typeof t.accumulatedMs === 'number' && ['idle', 'running', 'paused', 'done'].includes(String(t.status));
}

/** A session kept on this device (before a reload, or by another tab), reconciled with the clock. */
function fromStored(raw: string, now: number): TimerState | null {
  try {
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

/** This tab's first look at a timer. What it read is remembered, so a later write can tell whether another tab changed it. */
function load(key: string): TimerState | null {
  if (typeof window === 'undefined') return null;
  if (!keptOnDevice(key)) {
    // A preview timer kept by an earlier version: previews keep nothing.
    try {
      window.localStorage.removeItem(STORE_PREFIX + key);
    } catch {
      /* blocked storage */
    }
    return null;
  }
  watchOtherTabs();
  const raw = readStored(key);
  if (raw === undefined) return null;
  lastSeen.set(key, raw);
  return raw ? fromStored(raw, Date.now()) : null;
}

/**
 * Take over what another tab stored for this timer since this tab last read or wrote it (a pause, a
 * reset, a save, a new session). True when there was something to take over.
 */
function adoptStored(key: string): boolean {
  if (!keptOnDevice(key)) return false;
  const raw = readStored(key);
  if (raw === undefined || raw === (lastSeen.get(key) ?? null)) return false;
  lastSeen.set(key, raw);
  const preset = seededFrom.get(key) ?? timers.get(key)?.presetMinutes ?? 10;
  timers.set(key, (raw ? fromStored(raw, Date.now()) : null) ?? initial(preset));
  emit(key);
  return true;
}

let watching = false;

/** Tabs of one app share the stored timers: what another tab stores is shown here as soon as it is stored. */
function watchOtherTabs(): void {
  if (watching || typeof window.addEventListener !== 'function') return;
  watching = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === null) {
      // Storage was cleared.
      for (const key of [...timers.keys()]) adoptStored(key);
      return;
    }
    if (!e.key.startsWith(STORE_PREFIX)) return;
    const key = e.key.slice(STORE_PREFIX.length);
    if (timers.has(key)) adoptStored(key);
  });
}

export function readTimer(key: string, preset: number): TimerState {
  let t = timers.get(key);
  if (!t) {
    t = load(key) ?? initial(preset);
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

/**
 * Change a timer. Refused (false) when another tab stored something else since this tab last read or
 * wrote it: that state is shown instead, so a stale tab never writes over a newer pause or another
 * session, and the person acts again on what they now see.
 */
export function writeTimer(key: string, next: TimerState): boolean {
  if (adoptStored(key)) return false;
  timers.set(key, next);
  if (keptOnDevice(key)) persist(key, next);
  emit(key);
  return true;
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
  if (t.status === 'done') return { ...initial(t.presetMinutes), status: 'running', startedAt: now, sessionId: newId(), lastStartedAt: now };
  // Resume keeps the session and its id: saving it again updates the same record.
  return { ...t, status: 'running', startedAt: now, sessionId: t.sessionId ?? newId(), lastStartedAt: now, needsReview: false };
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

/**
 * The local day (YYYY-MM-DD) a session is saved under: the day its countdown ended, else the day of its
 * latest Start or Resume, so a paused session resumed and played on a later day belongs to that day.
 * Never after today (the clock may have moved backwards); today when nothing ran.
 */
export function sessionDate(t: TimerState, now: number = Date.now()): string {
  const at = [t.status === 'done' ? t.completedAt : null, t.startedAt, t.lastStartedAt].find((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return todayIso(new Date(Math.min(at ?? now, now)));
}

/** The timer of one practice view of one app (Make-mine previews use the app id "preview"). */
export function practiceTimerKey(appId: string, viewId: string): string {
  return `${appId}:${viewId}`;
}

/** A timer's latest state, with what another tab stored taken over; read from this device if this tab has not shown it yet. */
function latest(key: string): TimerState | null {
  if (!timers.has(key)) {
    const loaded = load(key);
    if (loaded) timers.set(key, loaded);
    return loaded;
  }
  adoptStored(key);
  return timers.get(key) ?? null;
}

/**
 * The form sent the save of this view's timed session. From then on it may be stored under its id (the
 * response can be lost), so discarding the timer no longer says it has not been saved. Call it when the
 * create is actually sent, not when Save session is tapped: the person may still cancel the form.
 */
export function noteSaveSent(appId: string, viewId: string, sessionId?: string): void {
  const key = practiceTimerKey(appId, viewId);
  const t = latest(key);
  // Only the session that was sent: another tab may have reset this timer and started a new one since.
  if (!t?.sessionId || t.saveAttempted || (sessionId !== undefined && t.sessionId !== sessionId)) return;
  writeTimer(key, { ...t, saveAttempted: true });
}

/**
 * Give this view's session a new id, keeping its measured time and status, so the next save is a new
 * session: for when its entry was deleted, or was changed elsewhere and the create was refused.
 * Nothing has been sent under the new id, so the session counts as not saved again.
 */
export function renewSessionId(appId: string, viewId: string, sessionId?: string): void {
  const key = practiceTimerKey(appId, viewId);
  const t = latest(key);
  if (!t?.sessionId || (sessionId !== undefined && t.sessionId !== sessionId)) return;
  writeTimer(key, { ...t, sessionId: newId(), saveAttempted: false });
}

// The tempo the person dialled in also survives a tab switch (it is not persisted across reloads).
const tempos = new Map<string, number>();

export function readTempo(key: string, fallback: number): number {
  return tempos.get(key) ?? fallback;
}

export function writeTempo(key: string, bpm: number): void {
  tempos.set(key, bpm);
}

/** Forget the timers tried in previews (they are never stored), so the next preview starts at its own default. */
export function forgetPreviewTimers(): void {
  for (const key of [...timers.keys()]) {
    if (!key.startsWith(PREVIEW_PREFIX)) continue;
    timers.delete(key);
    seededFrom.delete(key);
    tempos.delete(key);
    emit(key);
  }
}

export interface TimerApi {
  state: TimerState;
  now: number;
  elapsed: number;
  remaining: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  /** Reset only if the timer still holds this session (null: no session); after a save, never a newer one another tab started. */
  resetSession: (sessionId: string | null) => void;
  choosePreset: (minutes: number) => void;
  /** Show what another tab stored since this one last looked; true when this view was out of date. */
  refresh: () => boolean;
}

/** A hidden tab settles this long after the end, so a tab of this app the person is watching records the end first. */
const HIDDEN_SETTLE_DELAY_MS = 1500;

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
      // Settle what is stored, not a stale copy: another tab may have paused, reset or saved this session.
      adoptStored(key);
      // A countdown that ends while the page is hidden is marked: the person may have stopped earlier.
      const hidden = document.visibilityState === 'hidden';
      const settled = settleTimer(readTimer(key, defaultPreset), hidden ? t - HIDDEN_SETTLE_DELAY_MS : t, { away: hidden });
      if (settled.status === 'done') writeTimer(key, settled);
    };
    const id = window.setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const t = Date.now();
      setNow(t);
      adoptStored(key);
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
    resetSession: (sessionId) => {
      adoptStored(key);
      const t = readTimer(key, defaultPreset);
      if (t.sessionId === sessionId) writeTimer(key, resetTimer(t));
    },
    choosePreset: (m) => update((t) => selectPreset(t, m)),
    refresh: () => adoptStored(key),
  };
}
