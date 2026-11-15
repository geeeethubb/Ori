/**
 * The practice timer across tabs, reloads, days and previews, what Save hands to the form, and the
 * session list under the timer.
 * Two browser tabs are two fresh copies of the module over one shared storage. PracticeView is
 * rendered to a string by a probe that keeps its buttons' handlers, so the real save and reset
 * logic runs without a DOM.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSpecSchema } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { RIFF_PRACTICE } from '../../../server/fixtures/specs.ts';
import { previewRecords } from '../../../server/services/previewContent.ts';
import type { PracticeSaveMeta } from './PracticeView.tsx';
import type { PracticeViewSpec } from './viewLogic.ts';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

type StorageListener = (e: { key: string | null }) => void;
const storage = new MemoryStorage();
/** Every tab's storage listener, in the order the tabs registered them. */
const storageListeners: StorageListener[] = [];
const confirms: string[] = [];
let confirmAnswer = false;
(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  addEventListener: (type: string, fn: StorageListener) => {
    if (type === 'storage') storageListeners.push(fn);
  },
  confirm: (message: string) => {
    confirms.push(message);
    return confirmAnswer;
  },
};

const MIN = 60_000;
const T0 = new Date(2026, 10, 14, 20, 0, 0).getTime(); // Sat 14 Nov 2026, 8:00 PM local time
const APP = 'appRiffTimer0001';
const KEY = `${APP}:practice`;
const STORED = `aas_timer_${KEY}`;
const riff = AppSpecSchema.parse(RIFF_PRACTICE);
const practice = riff.views.find((v): v is PracticeViewSpec => v.type === 'practice')!;

type TimerModule = typeof import('./practiceTimer.ts');
type ViewModule = typeof import('./PracticeView.tsx');
type Saved = { preset: RecordValues; meta: PracticeSaveMeta };

/** A browser tab: its own copy of the timer module over the shared storage. `hear` delivers another tab's storage event. */
async function openTab(): Promise<{ m: TimerModule; hear: () => void }> {
  vi.resetModules();
  const m = await import('./practiceTimer.ts');
  const before = storageListeners.length;
  m.readTimer(KEY, 15);
  const listener = storageListeners[before];
  if (!listener) throw new Error('the tab does not follow storage events');
  return { m, hear: () => listener({ key: STORED }) };
}

/** A freshly loaded page with the runtime modules it renders. */
async function openPage() {
  vi.resetModules();
  const timer = await import('./practiceTimer.ts');
  const view = await import('./PracticeView.tsx');
  const preview = await import('./AppPreview.tsx');
  const logic = await import('./viewLogic.ts');
  return { timer, view, preview, logic };
}

/** What a tap hands to a click handler (a row stops the event from reaching the page behind it). */
const tapEvent = { stopPropagation: () => undefined, preventDefault: () => undefined };

/**
 * Render PracticeView to HTML and keep its buttons' click handlers. `tap` presses one control during the
 * first render, so the HTML shows what that press changed in the view's own state.
 */
function renderPractice(view: ViewModule, props: Partial<Parameters<ViewModule['PracticeView']>[0]> = {}, tap?: string) {
  const handlers = new Map<string, (e: typeof tapEvent) => void>();
  const collect = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    const p = (node as { props?: Record<string, unknown> }).props;
    if (!p) return;
    const id = p['data-testid'];
    if (typeof id === 'string' && typeof p.onClick === 'function') handlers.set(id, p.onClick as (e: typeof tapEvent) => void);
    collect(p.children);
  };
  let tapped = tap === undefined;
  function Probe() {
    const tree = view.PracticeView({ appId: APP, spec: riff, view: practice, records: [], ...props });
    collect(tree);
    if (!tapped) {
      tapped = true;
      const fn = handlers.get(tap as string);
      if (!fn) throw new Error(`no ${tap} button`);
      fn(tapEvent);
    }
    return tree;
  }
  const html = renderToStaticMarkup(createElement(Probe));
  return {
    html,
    click(testId: string) {
      const fn = handlers.get(testId);
      if (!fn) throw new Error(`no ${testId} button`);
      fn(tapEvent);
    },
  };
}

const unescape = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const timerNote = (html: string) => unescape(/<p class="rt-timer-note"[^>]*>(.*?)<\/p>/.exec(html)?.[1] ?? '');
const sessionRows = (html: string) =>
  [...html.matchAll(/<li[^>]*data-testid="rt-session"[^>]*>(.*?)<\/li>/g)].map((m) =>
    unescape((m[1] ?? '').replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
  );

beforeEach(() => {
  storage.clear();
  confirms.length = 0;
  confirmAnswer = false;
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('two tabs of one app share one timer', () => {
  it('a tab shows what another tab stored as soon as the storage event arrives', async () => {
    const a = await openTab();
    a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)));
    vi.setSystemTime(T0 + MIN);
    const b = await openTab();
    expect(b.m.readTimer(KEY, 15).status).toBe('running');
    vi.setSystemTime(T0 + 3 * MIN);
    a.m.writeTimer(KEY, a.m.pauseTimer(a.m.readTimer(KEY, 15)));
    b.hear();
    const shown = b.m.readTimer(KEY, 15);
    expect(shown.status).toBe('paused');
    expect(shown.sessionId).toBe(a.m.readTimer(KEY, 15).sessionId);
    expect(b.m.elapsedMs(shown)).toBe(3 * MIN);
  });

  it('a stale background tab cannot turn a session paused at 3:00 into a finished 15 minutes', async () => {
    const a = await openTab();
    a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)));
    vi.setSystemTime(T0 + MIN);
    const b = await openTab(); // restores the running session
    vi.setSystemTime(T0 + 3 * MIN);
    a.m.writeTimer(KEY, a.m.pauseTimer(a.m.readTimer(KEY, 15))); // B misses the storage event
    const pausedInA = storage.getItem(STORED);
    vi.setSystemTime(T0 + 16 * MIN);
    // B's tick settles its old running copy: the write is refused and B shows the pause instead.
    const settled = b.m.settleTimer(b.m.readTimer(KEY, 15), Date.now(), { away: true });
    expect(settled.status).toBe('done');
    expect(b.m.writeTimer(KEY, settled)).toBe(false);
    expect(storage.getItem(STORED)).toBe(pausedInA);
    expect(b.m.readTimer(KEY, 15).status).toBe('paused');
    vi.setSystemTime(T0 + 20 * MIN);
    const reloaded = await openTab();
    const t = reloaded.m.readTimer(KEY, 15);
    expect(t.status).toBe('paused');
    expect(reloaded.m.elapsedMs(t)).toBe(3 * MIN);
  });

  it('a tab opened before the session started cannot start a new one over it', async () => {
    const b = await openTab(); // idle: nothing stored yet
    const a = await openTab();
    a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)));
    vi.setSystemTime(T0 + 10 * MIN);
    a.m.writeTimer(KEY, a.m.pauseTimer(a.m.readTimer(KEY, 15)));
    const paused = a.m.readTimer(KEY, 15);
    vi.setSystemTime(T0 + 11 * MIN);
    // Start pressed in B, which still shows 00:00: refused, and B now shows the paused session.
    expect(b.m.writeTimer(KEY, b.m.startTimer(b.m.readTimer(KEY, 15)))).toBe(false);
    const shown = b.m.readTimer(KEY, 15);
    expect(shown.sessionId).toBe(paused.sessionId);
    expect(b.m.elapsedMs(shown)).toBe(10 * MIN);
    // Pressed again on what B now shows, it resumes that same session.
    expect(b.m.writeTimer(KEY, b.m.startTimer(b.m.readTimer(KEY, 15)))).toBe(true);
    vi.setSystemTime(T0 + 12 * MIN);
    const reloaded = await openTab();
    const t = reloaded.m.readTimer(KEY, 15);
    expect(t.sessionId).toBe(paused.sessionId);
    expect(reloaded.m.elapsedMs(t)).toBe(11 * MIN);
  });

  it('a tab never refuses its own changes, and a reset in another tab is shown', async () => {
    const a = await openTab();
    expect(a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)))).toBe(true);
    const b = await openTab();
    vi.setSystemTime(T0 + 2 * MIN);
    expect(a.m.writeTimer(KEY, a.m.pauseTimer(a.m.readTimer(KEY, 15)))).toBe(true);
    expect(a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)))).toBe(true);
    expect(a.m.writeTimer(KEY, a.m.resetTimer(a.m.readTimer(KEY, 15)))).toBe(true);
    expect(storage.getItem(STORED)).toBeNull();
    b.hear();
    expect(b.m.readTimer(KEY, 15)).toMatchObject({ status: 'idle', sessionId: null });
  });

  it('a sent save and a new id apply to what is stored now, not to a stale copy', async () => {
    const a = await openTab();
    a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)));
    const b = await openTab(); // restores the running session
    vi.setSystemTime(T0 + 3 * MIN);
    a.m.writeTimer(KEY, a.m.pauseTimer(a.m.readTimer(KEY, 15))); // B misses the storage event
    b.m.noteSaveSent(APP, 'practice');
    expect(JSON.parse(storage.getItem(STORED) ?? '{}')).toMatchObject({ status: 'paused', accumulatedMs: 3 * MIN, saveAttempted: true });
    b.m.renewSessionId(APP, 'practice');
    a.hear();
    const shown = a.m.readTimer(KEY, 15);
    expect(shown).toMatchObject({ status: 'paused', accumulatedMs: 3 * MIN, saveAttempted: false });
    expect(shown.sessionId).toBe(b.m.readTimer(KEY, 15).sessionId);
  });
});

describe('a session keeps its id, and is dated by its last stretch', () => {
  it('Resume keeps the id; Again after the end starts a new session', async () => {
    const { m } = await openTab();
    const started = m.startTimer(m.readTimer(KEY, 15), T0);
    const paused = m.pauseTimer(started, T0 + 5 * MIN);
    expect(paused).toMatchObject({ status: 'paused', accumulatedMs: 5 * MIN, sessionId: started.sessionId, lastStartedAt: T0, saveAttempted: false });
    const resumed = m.startTimer(paused, T0 + 6 * MIN);
    expect(resumed).toMatchObject({ status: 'running', sessionId: started.sessionId, lastStartedAt: T0 + 6 * MIN });
    const again = m.startTimer(m.settleTimer(resumed, T0 + 60 * MIN), T0 + 61 * MIN);
    expect(again.sessionId).not.toBe(started.sessionId);
    expect(again).toMatchObject({ lastStartedAt: T0 + 61 * MIN, completedAt: null, saveAttempted: false });
  });

  it('a session is saved under the day it ended, else the day of its latest Start or Resume', async () => {
    const { m } = await openTab();
    const at = (day: number, h: number, min = 0) => new Date(2026, 10, day, h, min).getTime();
    // Started on Sunday 8 Nov and paused at 2:00: Sunday's session until it is resumed.
    const sunday = m.pauseTimer(m.startTimer(m.readTimer(KEY, 15), at(8, 20)), at(8, 20, 2));
    expect(m.sessionDate(sunday, at(13, 18))).toBe('2026-11-08');
    // Resumed and played on Friday 13 Nov: Friday's session, whether running, paused or played out.
    const friday = m.startTimer(sunday, at(13, 19));
    expect(m.sessionDate(friday, at(13, 19, 5))).toBe('2026-11-13');
    expect(m.sessionDate(m.pauseTimer(friday, at(13, 19, 5)), at(13, 19, 6))).toBe('2026-11-13');
    expect(m.sessionDate(m.settleTimer(friday, at(13, 19, 13)), at(13, 19, 14))).toBe('2026-11-13');
    // Ended while the page was closed and saved the next morning: the day it ended.
    const evening = m.startTimer(m.readTimer('appOther00000001:practice', 25), at(13, 22));
    expect(m.sessionDate(m.settleTimer(evening, at(14, 8), { away: true }), at(14, 8))).toBe('2026-11-13');
    const pastMidnight = m.startTimer(m.readTimer('appOther00000002:practice', 25), at(13, 23, 50));
    expect(m.sessionDate(m.settleTimer(pastMidnight, at(14, 8), { away: true }), at(14, 8))).toBe('2026-11-14');
    // Never after today (the clock moved backwards); nothing timed: today.
    expect(m.sessionDate({ ...sunday, lastStartedAt: at(20, 9) }, at(14, 8))).toBe('2026-11-14');
    expect(m.sessionDate(m.readTimer('appOther00000003:practice', 15), at(14, 8))).toBe('2026-11-14');
  });
});

describe('Save session', () => {
  it('a session that ended while the page was closed is saved on the day it was played, and the note names that day', async () => {
    const fri22 = new Date(2026, 10, 13, 22, 0).getTime();
    storage.setItem(STORED, JSON.stringify({ presetMinutes: 25, status: 'running', startedAt: fri22, accumulatedMs: 0, sessionId: 'sessDayTest00001', completedAt: null, endedAway: false, needsReview: false }));
    vi.setSystemTime(new Date(2026, 10, 14, 8, 0));
    const { view, logic } = await openPage();
    const saves: Saved[] = [];
    const page = renderPractice(view, { onSave: (preset, meta) => saves.push({ preset, meta }) });
    expect(timerNote(page.html)).toBe(`Time's up. It finished yesterday at ${logic.clockTime(fri22 + 25 * MIN)} while this page was closed.`);
    page.click('rt-practice-save');
    expect(saves[0]?.preset).toEqual({ minutes: 25, target_minutes: 25, timed_seconds: 1500, tempo: 72, date: '2026-11-13' });
    expect(saves[0]?.meta).toMatchObject({ timed: true, sessionId: 'sessDayTest00001', endedAway: true });
  });

  it('a session typed in without the timer has no plan and nothing measured', async () => {
    const { view } = await openPage();
    const saves: Saved[] = [];
    renderPractice(view, { onSave: (preset, meta) => saves.push({ preset, meta }) }).click('rt-practice-save');
    expect(saves[0]?.meta).toMatchObject({ timed: false, sessionId: null });
    expect(saves[0]?.preset).toEqual({ minutes: null, target_minutes: null, timed_seconds: null, tempo: 72, date: '2026-11-14' });
  });

  it('a paused session resumed and played on a later day is saved under that day', async () => {
    const sunday = new Date(2026, 10, 8, 20, 0).getTime();
    vi.setSystemTime(sunday);
    const before = await openPage();
    before.timer.writeTimer(KEY, before.timer.startTimer(before.timer.readTimer(KEY, 15)));
    vi.setSystemTime(sunday + 2 * MIN);
    before.timer.writeTimer(KEY, before.timer.pauseTimer(before.timer.readTimer(KEY, 15)));
    const friday = new Date(2026, 10, 13, 19, 0).getTime();
    vi.setSystemTime(friday);
    const { view } = await openPage(); // the app opens on the paused timer
    const saves: Saved[] = [];
    const onSave = (preset: RecordValues, meta: PracticeSaveMeta) => saves.push({ preset, meta });
    renderPractice(view, { onSave }).click('rt-practice-start');
    vi.setSystemTime(friday + 10 * MIN);
    renderPractice(view, { onSave }).click('rt-practice-save');
    expect(saves[0]?.preset).toMatchObject({ minutes: 12, timed_seconds: 720, date: '2026-11-13' });
  });

  it('tapping Save and cancelling sends nothing; once the save is sent, Reset no longer says it has not been saved', async () => {
    const { view, timer } = await openPage();
    timer.writeTimer(KEY, timer.startTimer(timer.readTimer(KEY, 15)));
    vi.setSystemTime(T0 + 13 * MIN);
    const saves: Saved[] = [];
    const onSave = (preset: RecordValues, meta: PracticeSaveMeta) => saves.push({ preset, meta });
    renderPractice(view, { onSave }).click('rt-practice-save'); // the form opens, and the person cancels it
    expect(timer.readTimer(KEY, 15)).toMatchObject({ status: 'paused', saveAttempted: false });
    renderPractice(view, { onSave }).click('rt-practice-reset');
    expect(confirms.pop()).toBe('Discard 13:00 of practice? It has not been saved.');
    // Saved again, and this time the form sends it; its response is lost.
    renderPractice(view, { onSave }).click('rt-practice-save');
    timer.noteSaveSent(APP, 'practice');
    expect(timer.readTimer(KEY, 15)).toMatchObject({ status: 'paused', saveAttempted: true });
    renderPractice(view, { onSave }).click('rt-practice-reset');
    expect(confirms.pop()).toBe('Discard 13:00 on the timer? If you already saved this session, it stays saved.');
    // The person resumes and plays on: the same session, still marked, saved again under its id.
    renderPractice(view, { onSave }).click('rt-practice-start');
    vi.setSystemTime(T0 + 14 * MIN);
    expect(timer.readTimer(KEY, 15)).toMatchObject({ status: 'running', saveAttempted: true });
    renderPractice(view, { onSave }).click('rt-practice-save');
    const id = saves[0]?.meta.sessionId;
    expect(id).toMatch(/\S/);
    expect(saves.map((s) => s.meta.sessionId)).toEqual([id, id, id]);
    expect(saves[2]?.preset).toMatchObject({ minutes: 14, timed_seconds: 840 });
  });
});

describe('a save only ever touches the session it saved', () => {
  it('marking, renewing and resetting name their session, so a newer session in another tab is left alone', async () => {
    const a = await openTab();
    a.m.writeTimer(KEY, a.m.startTimer(a.m.readTimer(KEY, 15)));
    vi.setSystemTime(T0 + 13 * MIN);
    a.m.writeTimer(KEY, a.m.pauseTimer(a.m.readTimer(KEY, 15)));
    const s1 = a.m.readTimer(KEY, 15).sessionId!;
    // In tab B the person resets and starts a second session while A's save form is still open.
    const b = await openTab();
    b.m.writeTimer(KEY, b.m.resetTimer(b.m.readTimer(KEY, 15)));
    b.m.writeTimer(KEY, b.m.startTimer(b.m.readTimer(KEY, 15)));
    const s2 = b.m.readTimer(KEY, 15).sessionId!;
    expect(s2).not.toBe(s1);
    a.hear();
    // A now sends S1's save: nothing about S2 is marked or renewed.
    a.m.noteSaveSent(APP, 'practice', s1);
    a.m.renewSessionId(APP, 'practice', s1);
    const stored = JSON.parse(storage.getItem(STORED) ?? '{}');
    expect(stored).toMatchObject({ sessionId: s2, status: 'running', saveAttempted: false });
    // Naming the session that is there still works.
    a.m.noteSaveSent(APP, 'practice', s2);
    expect(JSON.parse(storage.getItem(STORED) ?? '{}')).toMatchObject({ sessionId: s2, saveAttempted: true });
  });
});

describe('a session whose saved entry was deleted or changed elsewhere', () => {
  it('gets a new id with its time and status kept, so the next save is a new session not saved yet', async () => {
    const { view, timer } = await openPage();
    timer.writeTimer(KEY, timer.startTimer(timer.readTimer(KEY, 15)));
    vi.setSystemTime(T0 + 5 * MIN);
    const saves: Saved[] = [];
    const onSave = (preset: RecordValues, meta: PracticeSaveMeta) => saves.push({ preset, meta });
    renderPractice(view, { onSave }).click('rt-practice-save');
    timer.noteSaveSent(APP, 'practice'); // sent and refused: that entry was deleted, or changed elsewhere
    const refused = timer.readTimer(KEY, 15);
    timer.renewSessionId(APP, 'practice');
    const renewed = timer.readTimer(KEY, 15);
    expect(renewed.sessionId).toMatch(/\S/);
    expect(renewed.sessionId).not.toBe(refused.sessionId);
    expect(renewed).toMatchObject({ status: 'paused', accumulatedMs: 5 * MIN, lastStartedAt: refused.lastStartedAt, saveAttempted: false });
    expect(JSON.parse(storage.getItem(STORED) ?? '{}').sessionId).toBe(renewed.sessionId); // a reload or another tab sees it
    renderPractice(view, { onSave }).click('rt-practice-save');
    expect(saves[1]?.meta.sessionId).toBe(renewed.sessionId);
    expect(saves[1]?.preset).toMatchObject({ minutes: 5, timed_seconds: 300, date: '2026-11-14' });
    renderPractice(view, { onSave }).click('rt-practice-reset');
    expect(confirms.pop()).toBe('Discard 05:00 of practice? It has not been saved.');
  });

  it('a running session keeps running; a timer with no session has nothing to renew or mark', async () => {
    const { timer } = await openPage();
    timer.writeTimer(KEY, timer.startTimer(timer.readTimer(KEY, 15)));
    const running = timer.readTimer(KEY, 15);
    vi.setSystemTime(T0 + 3 * MIN);
    timer.renewSessionId(APP, 'practice');
    const renewed = timer.readTimer(KEY, 15);
    expect(renewed).toMatchObject({ status: 'running', startedAt: running.startedAt });
    expect(renewed.sessionId).not.toBe(running.sessionId);
    expect(timer.elapsedMs(renewed)).toBe(3 * MIN);
    const idle = 'appIdleTimer0001';
    timer.renewSessionId(idle, 'practice');
    timer.noteSaveSent(idle, 'practice');
    expect(storage.getItem(`aas_timer_${idle}:practice`)).toBeNull();
    expect(timer.readTimer(timer.practiceTimerKey(idle, 'practice'), 15)).toMatchObject({ status: 'idle', sessionId: null, saveAttempted: false });
  });
});

describe('recent sessions', () => {
  it('"typed in" only for a session saved without the timer, never for one with no timed value at all', async () => {
    const { view } = await openPage();
    const rec = (id: string, day: number, values: RecordValues): AppRecord => {
      const at = new Date(2026, 10, day, 19).toISOString();
      return { id, appId: APP, values: { kind: 'session', date: `2026-11-${day}`, ...values }, createdAt: at, updatedAt: at };
    };
    const rows = sessionRows(
      renderPractice(view, {
        records: [
          rec('rec-timed-000001', 14, { minutes: 10, target_minutes: 10, timed_seconds: 600 }),
          rec('rec-typed-000001', 13, { minutes: 40, target_minutes: null, timed_seconds: null }),
          rec('rec-older-000001', 12, { minutes: 25 }), // seeded, or saved before the timed field existed
        ],
      }).html,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('of 10 planned timed 10:00');
    expect(rows[1]).toContain('typed in');
    expect(rows[1]).not.toContain('planned');
    expect(rows[2]).not.toMatch(/typed in|timed/);
  });

  it('lists the five newest; Show all lists every session, each still editable', async () => {
    const { view } = await openPage();
    const records = [14, 13, 12, 11, 10, 9, 8].map((day): AppRecord => {
      const at = new Date(2026, 10, day, 19).toISOString();
      const dd = String(day).padStart(2, '0');
      return { id: `rec-day-0000000${dd}`, appId: APP, values: { kind: 'session', date: `2026-11-${dd}`, minutes: day }, createdAt: at, updatedAt: at };
    });
    const edited: string[] = [];
    const props = { records, onEdit: (r: AppRecord) => void edited.push(r.id) };
    const toggleOf = (html: string) => /<button[^>]*data-testid="rt-practice-show-all"[^>]*>(.*?)<\/button>/.exec(html);
    const minutesOf = (html: string) => sessionRows(html).map((r) => r.split(' ')[0]);

    const short = renderPractice(view, props).html;
    expect(minutesOf(short)).toEqual(['14', '13', '12', '11', '10']);
    const toggle = toggleOf(short);
    expect(toggle?.[1]).toBe('Show all 7 sessions');
    expect(toggle?.[0]).toContain('aria-expanded="false"');
    const listId = /<ul class="rt-session-list" id="([^"]+)"/.exec(short)?.[1];
    expect(listId).toMatch(/\S/);
    expect(toggle?.[0]).toContain(`aria-controls="${listId}"`);

    const all = renderPractice(view, props, 'rt-practice-show-all');
    expect(minutesOf(all.html)).toEqual(['14', '13', '12', '11', '10', '9', '8']);
    expect(all.html).toContain('<h3 class="rt-subhead">All sessions</h3>');
    expect(toggleOf(all.html)?.[0]).toMatch(/aria-expanded="true"[^>]*>Show fewer</);
    // The oldest session, listed only this way, opens for editing like the others.
    all.click('rt-session');
    expect(edited).toEqual(['rec-day-000000008']);

    // Five sessions or fewer: nothing more to show, so no control.
    expect(renderPractice(view, { ...props, records: records.slice(0, 5) }).html).not.toContain('rt-practice-show-all');
  });
});

describe('Make-mine previews', () => {
  it('a timer tried in a preview is never stored, and is forgotten when the preview closes', async () => {
    const { timer } = await openPage();
    timer.writeTimer('preview:practice', timer.startTimer(timer.readTimer('preview:practice', 15)));
    expect(timer.readTimer('preview:practice', 15).status).toBe('running');
    expect([...storage.map.keys()]).toEqual([]);
    timer.forgetPreviewTimers();
    expect(timer.readTimer('preview:practice', 20)).toMatchObject({ status: 'idle', presetMinutes: 20, sessionId: null });
  });

  it('a preview timer stored by an earlier version does not show up in the preview of another proposal', async () => {
    storage.setItem('aas_timer_preview:practice', JSON.stringify({ presetMinutes: 15, status: 'running', startedAt: T0 - 24 * 60 * MIN, accumulatedMs: 0, sessionId: 'sessPreviewOld01', completedAt: null, endedAway: false, needsReview: false }));
    const { preview } = await openPage();
    const drum = structuredClone(riff);
    drum.name = 'Drum Room';
    for (const v of drum.views) if (v.type === 'practice') v.presets = [20, 30];
    const html = renderToStaticMarkup(createElement(preview.AppPreview, { spec: drum, records: [] }));
    expect(/data-testid="rt-practice"[^>]*data-status="([^"]+)"/.exec(html)?.[1]).toBe('idle');
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="rt-practice-preset-20"/);
    expect(storage.getItem('aas_timer_preview:practice')).toBeNull();
  });

  it('example sessions in the Riff preview are timed in minutes, never hours, and one is typed in', async () => {
    const { preview } = await openPage();
    const html = renderToStaticMarkup(createElement(preview.AppPreview, { spec: riff, records: previewRecords(riff, 3, new Date(T0)) }));
    const rows = sessionRows(html);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => /timed (\d+:\d\d)/.exec(r)?.[1]).filter(Boolean)).toEqual(['15:00', '20:00']);
    expect(rows.filter((r) => r.includes('typed in'))).toHaveLength(1);
  });
});
