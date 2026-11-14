/**
 * The runtime side of the Velocity decisions, without a browser: the practice clock (target vs
 * measured time, pause, reload and away reconciliation, one id per session), role-based entry drafts,
 * the unsupported-integration detector and the follow-up parser.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { AppSpecSchema } from '../../shared/appSpec.ts';
import { draftEntry } from '../../shared/drafts.ts';
import { findWhenWords, suggestDateFor } from '../../shared/time.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';
import { parseFollowUp } from '../../server/model/sample/respond.ts';
import { findUnsupported } from '../../server/model/sample/unsupported.ts';
import { elapsedMs, pauseTimer, readTimer, selectPreset, settleTimer, startTimer, writeTimer, type TimerState } from '../../client/src/runtime/practiceTimer.ts';
import { elapsedMinutes } from '../../client/src/runtime/viewLogic.ts';

/** A minimal browser storage so the timer's persistence runs under Node. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}
const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = { localStorage: storage };

let n = 0;
const freshKey = () => `velocity-test:${++n}`;
const persisted = (key: string, t: Partial<TimerState>) =>
  storage.setItem(`aas_timer_${key}`, JSON.stringify({ presetMinutes: 15, status: 'idle', startedAt: null, accumulatedMs: 0, sessionId: 'sess-0000001', completedAt: null, endedAway: false, needsReview: false, ...t }));

describe('practice clock: the plan and the measurement stay apart', () => {
  beforeEach(() => storage.clear());

  it('nothing timed means nothing measured; time comes from clock intervals with pauses excluded', () => {
    expect(elapsedMinutes(0)).toBeNull();
    let t = readTimer(freshKey(), 15);
    t = startTimer(t, 1_000_000);
    expect(t.sessionId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    t = pauseTimer(t, 1_000_000 + 90_000); // 1:30 played
    const id = t.sessionId;
    // Paused for an hour: none of it counts.
    t = startTimer(t, 1_000_000 + 90_000 + 3_600_000);
    expect(t.sessionId).toBe(id); // resume is the same session
    expect(elapsedMs(t, 1_000_000 + 90_000 + 3_600_000 + 30_000)).toBe(120_000);
  });

  it('a chosen length never throws away measured time; it only applies before a session starts', () => {
    const key = freshKey();
    let t = startTimer(readTimer(key, 15), 0);
    t = pauseTimer(t, 7 * 60_000);
    expect(selectPreset(t, 25)).toBe(t);
    expect(selectPreset(readTimer(freshKey(), 15), 25).presetMinutes).toBe(25);
  });

  it('a finished countdown records when it really ended, and whether the page was away', () => {
    const t = startTimer(readTimer(freshKey(), 15), 10_000);
    const done = settleTimer(t, 10_000 + 2 * 3_600_000, { away: true });
    expect(done.status).toBe('done');
    expect(done.completedAt).toBe(10_000 + 15 * 60_000);
    expect(done.endedAway).toBe(true);
    expect(elapsedMs(done)).toBe(15 * 60_000);
  });

  it('survives a reload: a running session continues from its start time', () => {
    const key = freshKey();
    const startedAt = Date.now() - 4 * 60_000;
    persisted(key, { status: 'running', startedAt, accumulatedMs: 0 });
    const t = readTimer(key, 15);
    expect(t.status).toBe('running');
    expect(t.sessionId).toBe('sess-0000001');
    expect(Math.round(elapsedMs(t) / 60_000)).toBe(4);
  });

  it('after a reload, a countdown that ended while the page was closed is marked for a check', () => {
    const key = freshKey();
    persisted(key, { status: 'running', startedAt: Date.now() - 3 * 3_600_000, accumulatedMs: 0 });
    const t = readTimer(key, 15);
    expect(t.status).toBe('done');
    expect(t.endedAway).toBe(true);
  });

  it('a clock that moved backwards keeps only what was measured before, paused for review', () => {
    const key = freshKey();
    persisted(key, { status: 'running', startedAt: Date.now() + 3_600_000, accumulatedMs: 120_000 });
    const t = readTimer(key, 15);
    expect(t.status).toBe('paused');
    expect(t.needsReview).toBe(true);
    expect(elapsedMs(t)).toBe(120_000);
  });

  it('a paused session is kept across a reload; an idle untouched timer leaves nothing stored', () => {
    const key = freshKey();
    const t = pauseTimer(startTimer(readTimer(key, 15), Date.now() - 60_000), Date.now());
    writeTimer(key, t);
    expect(storage.getItem(`aas_timer_${key}`)).not.toBeNull();
    const idle = freshKey();
    writeTimer(idle, readTimer(idle, 10));
    expect(storage.getItem(`aas_timer_${idle}`)).toBeNull();
  });
});

describe('entry drafts map roles onto the app\'s own fields', () => {
  it('a link becomes a saved source in Riff, through its links view and its filter', () => {
    const entry = draftEntry(AppSpecSchema.parse(RIFF_PRACTICE), { kind: 'source', url: 'https://example.com/a', title: 'A lesson', note: 'The intro' });
    expect(entry?.view.id).toBe('sources');
    expect(entry?.values).toEqual({ kind: 'source', url: 'https://example.com/a', title: 'A lesson', source_note: 'The intro' });
    expect(entry?.note).toMatch(/not read/);
  });

  it('a photo becomes a Light entry; a follow-up keeps the person\'s words and only suggests a date', () => {
    expect(draftEntry(AppSpecSchema.parse(LIGHT_GALLERY), { kind: 'photo', mediaId: 'media-00000001' })?.values).toMatchObject({ photo: 'media-00000001' });
    const people = AppSpecSchema.parse(PEOPLE_QUEUE);
    const vague = draftEntry(people, { kind: 'follow_up', person: 'Alex', action: 'Share the pricing article', dueText: 'this weekend' });
    expect(vague?.values).toEqual({ person: 'Alex', action: 'Share the pricing article', due_words: 'this weekend' }); // no date guessed
    expect(vague?.note).toMatch(/Pick the date you mean/);
  });

  it('an app without the right view gets no draft', () => {
    expect(draftEntry(AppSpecSchema.parse(LIGHT_GALLERY), { kind: 'follow_up', person: 'Maya' })).toBeNull();
  });
});

describe('words for when', () => {
  it('finds them, and suggests a date only for words that name a day', () => {
    const sat = new Date(2026, 10, 14, 21, 0);
    expect(findWhenWords('Follow up with Maya Thursday')).toBe('Thursday');
    expect(suggestDateFor('Thursday', sat)).toBe('2026-11-19');
    expect(suggestDateFor('tomorrow', sat)).toBe('2026-11-15');
    expect(suggestDateFor('Saturday', sat)).toBe('2026-11-21'); // said on a Saturday: next week
    expect(suggestDateFor('this weekend', sat)).toBeNull();
    expect(findWhenWords('Send the deck')).toBeNull();
  });
});

describe('unsupported integrations are named, not implied', () => {
  it('names each service asked to sync, and the other things that do not exist here', () => {
    expect(findUnsupported('Auto-sync my Spotify and Instagram into Riff').map((u) => u.request)).toEqual(['Spotify sync', 'Instagram sync']);
    expect(findUnsupported('Put my practice in my Google calendar').map((u) => u.request)).toEqual(['Calendar sync']);
    expect(findUnsupported('Text them automatically when it is due').map((u) => u.request)).toEqual(['Sending messages for you']);
    expect(findUnsupported('Can you detect the chords in this clip?').map((u) => u.request)).toEqual(['Listening to audio']);
  });

  it('leaves ordinary notes alone, including ones that mention a service', () => {
    expect(findUnsupported('I like this sound and have 15 minutes to practice')).toEqual([]);
    expect(findUnsupported('Found this riff on Spotify and want to learn it')).toEqual([]);
  });
});

describe('follow-up parsing keeps the person, the action and their words', () => {
  it('handles the common shapes', () => {
    expect(parseFollowUp('Follow up with Maya about the proposal')).toEqual({ kind: 'follow_up', person: 'Maya', action: 'Follow up about the proposal' });
    expect(parseFollowUp('Follow up with Maya Thursday')).toEqual({ kind: 'follow_up', person: 'Maya', action: 'Follow up', dueText: 'Thursday' });
    expect(parseFollowUp('Met Maya at the design meetup, promised to send her the demo link by Friday')).toEqual({ kind: 'follow_up', person: 'Maya', action: 'Send her the demo link', dueText: 'by Friday' });
    expect(parseFollowUp('Send the deck to Alex tomorrow')).toEqual({ kind: 'follow_up', person: 'Alex', action: 'Send the deck', dueText: 'tomorrow' });
  });
});
