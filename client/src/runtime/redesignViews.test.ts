/**
 * Pure logic behind the redesign renderers: gallery tile ordering, queue grouping and completion,
 * practice timer maths, and the theme tables (every text/fill pair must pass WCAG AA).
 */
import { describe, expect, it } from 'vitest';
import { APP_THEMES, AppSpecSchema, type AppSpec } from '@shared/appSpec.ts';
import { ICON_COLORS } from '@shared/icons.ts';
import type { AppRecord } from '@shared/records.ts';
import { addDays, friendlyDate, todayIso } from '@shared/time.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, RIFF_PRACTICE } from '../../../server/fixtures/specs.ts';
import { elapsedMs, pauseTimer, readTimer, remainingMs, resetTimer, selectPreset, settleTimer, startTimer } from './practiceTimer.ts';
import { draftKey } from './runtimeUtils.ts';
import { ACCENTS, contrastRatio, resolveAccent, resolveTheme, THEME_SURFACES, THEMES } from './theme.ts';
import {
  atTime,
  clampTempo,
  clockTime,
  completionPatch,
  draftFieldFor,
  elapsedMinutes,
  formatClock,
  galleryCaption,
  galleryTiles,
  linkHost,
  listedSessions,
  personInitials,
  personShortName,
  queueByPerson,
  queueGroups,
  queueRule,
  recentSessions,
  type GalleryViewSpec,
  type PracticeViewSpec,
  type QueueViewSpec,
} from './viewLogic.ts';

const light = AppSpecSchema.parse(LIGHT_GALLERY);
const people = AppSpecSchema.parse(PEOPLE_QUEUE);
const riff = AppSpecSchema.parse(RIFF_PRACTICE);
const galleryView = light.views[0] as GalleryViewSpec;
const queueView = people.views[0] as QueueViewSpec;
const practiceView = riff.views[0] as PracticeViewSpec;

let n = 0;
function rec(values: Record<string, unknown>, createdAt = `2026-11-10T10:00:${String(n++ % 60).padStart(2, '0')}.000Z`, updatedAt = createdAt): AppRecord {
  return { id: `r${++n}`, appId: 'app', values, createdAt, updatedAt };
}

const today = todayIso();
const day = (d: number) => addDays(today, d);

describe('gallery tiles', () => {
  const a = rec({ photo: 'example:light-1', caption: 'A', date: '2026-11-01' }, '2026-11-01T09:00:00.000Z');
  const b = rec({ photo: 'example:light-2', caption: 'B', date: '2026-11-03' }, '2026-11-03T09:00:00.000Z');
  const c = rec({ photo: 'example:light-3', caption: 'C', date: '2026-11-03' }, '2026-11-03T12:00:00.000Z');
  const note = rec({ caption: 'Text only', note: 'Legacy walk entry', date: '2026-11-02' }, '2026-11-02T09:00:00.000Z');
  const blank = rec({ photo: '', caption: 'Blank photo', date: '2026-11-04' });

  it('splits photos from text-only notes and orders photos newest first (creation as tiebreak)', () => {
    const tiles = galleryTiles(galleryView, [a, note, b, c, blank]);
    expect(tiles.photos.map((r) => r.values.caption)).toEqual(['C', 'B', 'A']);
    expect(tiles.notes.map((r) => r.values.caption)).toEqual(['Blank photo', 'Text only']);
  });
  it('orders oldest first when the view asks for it, notes stay newest first', () => {
    const tiles = galleryTiles({ ...galleryView, sort: 'oldest' }, [c, a, b, note]);
    expect(tiles.photos.map((r) => r.values.caption)).toEqual(['A', 'B', 'C']);
    expect(tiles.notes.map((r) => r.values.caption)).toEqual(['Text only']);
  });
  it('falls back to the record creation date when the date field is missing', () => {
    const late = rec({ photo: 'example:light-4' }, '2026-12-01T09:00:00.000Z');
    expect(galleryTiles(galleryView, [a, late]).photos[0]?.id).toBe(late.id);
  });
  it('captions prefer the caption field, then the first line of the note', () => {
    expect(galleryCaption(galleryView, a)).toBe('A');
    expect(galleryCaption(galleryView, rec({ photo: 'x', note: 'First line\nSecond' }))).toBe('First line');
    expect(galleryCaption(galleryView, rec({ photo: 'x' }))).toBe('');
  });
});

describe('queue grouping', () => {
  const overdue = rec({ person: 'Priya (investor)', action: 'Send the deck', due: day(-2) });
  const todayItem = rec({ person: 'Marcus (mentor)', action: 'Intro', due: today });
  const soon = rec({ person: 'Lena, meetup', action: 'Share route', due: day(2) });
  const later = rec({ person: 'Far Future', action: 'Catch up', due: day(30) });
  const undated = rec({ person: 'Sam Lee', action: 'Coffee' });
  const done = rec({ person: 'Priya (investor)', action: 'SAFE questions', due: day(-5), done: true }, '2026-11-01T09:00:00.000Z', '2026-11-05T09:00:00.000Z');
  const doneLater = rec({ person: 'Jo', action: 'Old', due: day(-9), done: true }, '2026-11-01T09:00:00.000Z', '2026-11-09T09:00:00.000Z');
  const all = [later, done, undated, soon, doneLater, todayItem, overdue];

  it('buckets by due state, puts undated and far-off items in later, and returns every group', () => {
    const groups = queueGroups(people, queueView, all);
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'soon', 'later', 'done']);
    const by = Object.fromEntries(groups.map((g) => [g.key, g.records.map((r) => r.values.action)]));
    expect(by.overdue).toEqual(['Send the deck']);
    expect(by.today).toEqual(['Intro']);
    expect(by.soon).toEqual(['Share route']);
    expect(by.later).toEqual(['Catch up', 'Coffee']);
    expect(by.done).toEqual(['Old', 'SAFE questions']);
  });
  it('sorts open items soonest first with undated last, done items most recently updated first', () => {
    const groups = queueGroups(people, queueView, [undated, rec({ person: 'Z', action: 'Z1', due: day(10) }), later]);
    expect(groups.find((g) => g.key === 'later')?.records.map((r) => r.values.action)).toEqual(['Z1', 'Catch up', 'Coffee']);
  });
  it('groups by person using the short name, soonest open action first, done last within a person', () => {
    const groups = queueByPerson(people, queueView, all);
    expect(groups.map((g) => g.label)).toEqual(['Priya', 'Marcus', 'Lena', 'Far Future', 'Sam Lee', 'Jo']);
    const priya = groups[0]!;
    expect(priya.openCount).toBe(1);
    expect(priya.records.map((r) => r.values.action)).toEqual(['Send the deck', 'SAFE questions']);
    expect(groups.find((g) => g.label === 'Jo')?.openCount).toBe(0);
  });
  it('merges people whose names differ only by case or context', () => {
    const groups = queueByPerson(people, queueView, [rec({ person: 'maya, met at the meetup', action: 'a' }), rec({ person: 'Maya (design)', action: 'b' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.records).toHaveLength(2);
  });
  it('derives the rule from the view and the matching spec rule', () => {
    const rule = queueRule(people, queueView);
    expect(rule.dateFieldId).toBe('due');
    expect(rule.withinDays).toBe(3);
    expect(rule.doneFieldId).toBe('done');
  });
  it('short names and initials', () => {
    expect(personShortName('Maya, met at the design meetup')).toBe('Maya');
    expect(personShortName('Priya (investor)')).toBe('Priya');
    expect(personShortName('Alex from the founders circle')).toBe('Alex');
    expect(personInitials('Maya, met at the design meetup')).toBe('M');
    expect(personInitials('Sam Lee')).toBe('SL');
    expect(personInitials('alex from the founders circle')).toBe('A');
    expect(personInitials('')).toBe('?');
  });
  it('completion toggles the done checkbox', () => {
    expect(completionPatch(people, queueView, overdue)).toEqual({ done: true });
    expect(completionPatch(people, queueView, done)).toEqual({ done: false });
  });
  it('completion moves a stage field to the first done value and back to the first open option', () => {
    const staged: AppSpec = {
      ...people,
      fields: [...people.fields, { id: 'stage', label: 'Stage', type: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'waiting', label: 'Waiting' }, { value: 'closed', label: 'Closed' }] }],
    };
    const view: QueueViewSpec = { ...queueView, doneFieldId: undefined, stageFieldId: 'stage', doneStageValues: ['closed'] };
    expect(completionPatch(staged, view, rec({ person: 'A', action: 'x', stage: 'waiting' }))).toEqual({ stage: 'closed' });
    expect(completionPatch(staged, view, rec({ person: 'A', action: 'x', stage: 'closed' }))).toEqual({ stage: 'open' });
    expect(completionPatch(staged, { ...view, doneStageValues: [] }, rec({ person: 'A', action: 'x' }))).toBeNull();
  });
  it('finds the message draft field by id or label, never anything else', () => {
    expect(draftFieldFor(people)?.id).toBe('draft');
    expect(draftFieldFor(riff)).toBeUndefined();
  });
});

describe('practice helpers', () => {
  it('formats a clock and rounds saved minutes sensibly', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(15 * 60_000)).toBe('15:00');
    expect(formatClock(61_500)).toBe('01:02');
    expect(formatClock(-5)).toBe('00:00');
    // Nothing timed means nothing measured: the plan is never returned as time played.
    expect(elapsedMinutes(0)).toBeNull();
    expect(elapsedMinutes(800)).toBeNull();
    expect(elapsedMinutes(14 * 60_000 + 40_000)).toBe(15);
    expect(elapsedMinutes(20_000)).toBe(1);
    expect(elapsedMinutes(7 * 60_000 + 10_000)).toBe(7);
  });
  it('clamps tempo to 30–240 bpm', () => {
    expect(clampTempo(10)).toBe(30);
    expect(clampTempo(999)).toBe(240);
    expect(clampTempo(72.4)).toBe(72);
    expect(clampTempo(Number.NaN)).toBe(72);
  });
  it('lists recent sessions newest first', () => {
    const a = rec({ kind: 'session', date: '2026-11-01', minutes: 10 });
    const b = rec({ kind: 'session', date: '2026-11-05', minutes: 20 });
    expect(recentSessions(practiceView, [a, b]).map((r) => r.values.minutes)).toEqual([20, 10]);
    expect(recentSessions(practiceView, [a, b], 1)).toHaveLength(1);
  });
  it('lists the newest five sessions, or every one once the person asks', () => {
    const sessions = [3, 1, 7, 5, 2, 6, 4].map((d) => rec({ kind: 'session', date: `2026-11-0${d}`, minutes: d }));
    const short = listedSessions(practiceView, sessions, false);
    expect(short.rows.map((r) => r.values.minutes)).toEqual([7, 6, 5, 4, 3]);
    expect(short).toMatchObject({ total: 7, hasMore: true });
    const all = listedSessions(practiceView, sessions, true);
    expect(all.rows.map((r) => r.values.minutes)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(all).toMatchObject({ total: 7, hasMore: true });
    expect(listedSessions(practiceView, sessions.slice(0, 5), false)).toMatchObject({ total: 5, hasMore: false });
    expect(listedSessions(practiceView, [], true)).toEqual({ rows: [], total: 0, hasMore: false });
  });
  it('says when something happened, naming the day unless it was today', () => {
    const now = new Date(2026, 10, 14, 8, 0);
    const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
    expect(atTime(at(14, 7, 30), now)).toBe(`at ${clockTime(at(14, 7, 30))}`);
    expect(atTime(at(13, 22, 25), now)).toBe(`yesterday at ${clockTime(at(13, 22, 25))}`);
    expect(atTime(at(10, 22, 25), now)).toBe(`on ${friendlyDate('2026-11-10', now)} at ${clockTime(at(10, 22, 25))}`);
  });
  it('timer state is derived from timestamps so it survives remounts', () => {
    const t0 = 1_000_000;
    let t = readTimer('test:timer', 15);
    expect(remainingMs(t, t0)).toBe(15 * 60_000);
    t = startTimer(t, t0);
    expect(elapsedMs(t, t0 + 30_000)).toBe(30_000);
    t = pauseTimer(t, t0 + 30_000);
    expect(t.status).toBe('paused');
    expect(elapsedMs(t, t0 + 90_000)).toBe(30_000);
    t = startTimer(t, t0 + 100_000);
    expect(remainingMs(t, t0 + 130_000)).toBe(15 * 60_000 - 60_000);
    expect(settleTimer(t, t0 + 130_000).status).toBe('running');
    const ended = settleTimer(t, t0 + 100_000 + 15 * 60_000);
    expect(ended.status).toBe('done');
    expect(elapsedMs(ended)).toBe(15 * 60_000);
    expect(selectPreset(startTimer(resetTimer(ended), 0), 10).presetMinutes).toBe(15); // presets cannot change while running
    expect(selectPreset(resetTimer(ended), 10).presetMinutes).toBe(10);
  });
});

describe('links and drafts', () => {
  it('shows a readable host for links', () => {
    expect(linkHost('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(linkHost('not a url')).toBe('not a url');
    expect(linkHost('')).toBe('');
  });
  it('keeps new-record drafts apart per view', () => {
    expect(draftKey('app', undefined, 'practice')).toBe('aas_draft_app_new_practice');
    expect(draftKey('app', 'r1', 'practice')).toBe('aas_draft_app_r1');
    expect(draftKey('app')).toBe('aas_draft_app_new');
  });
});

describe('theme', () => {
  it('resolves the reference identities', () => {
    const r = resolveTheme(riff);
    expect(r.attrs).toEqual({ 'data-theme': 'ink', 'data-typography': 'display', 'data-density': 'regular', 'data-artwork': 'waves' });
    expect(r.accent).toBe('lime');
    expect(r.style['--app-accent']).toBe('#DFFF76');
    expect(resolveTheme(light).attrs['data-theme']).toBe('paper');
    expect(resolveTheme(people).attrs['data-density']).toBe('compact');
  });
  it('gives pre-redesign apps an identity from their pattern', () => {
    const legacy = { ...riff, design: undefined, pattern: 'journal' as const };
    expect(resolveTheme(legacy).attrs['data-theme']).toBe('bright');
    expect(resolveTheme(legacy).attrs['data-typography']).toBe('editorial');
  });
  it('falls back when an accent would vanish on the theme', () => {
    expect(resolveAccent('ink', 'ink')).toBe('lime');
    expect(resolveAccent('bright', 'paper')).toBe('blue');
    expect(resolveAccent('mint', 'mint')).toBe('blue');
    expect(resolveAccent('paper', 'orange')).toBe('orange');
    expect(resolveAccent('charcoal', undefined)).toBe('orange');
  });
  it('every accent fill is readable with its on-fill text (AA)', () => {
    for (const c of ICON_COLORS) {
      const s = ACCENTS[c];
      expect(contrastRatio(s.fill, s.onFill), `${c} fill`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('accent text passes AA on the surfaces of every theme it can be used on', () => {
    for (const theme of APP_THEMES) {
      const info = THEMES[theme];
      const surf = THEME_SURFACES[theme];
      for (const c of ICON_COLORS) {
        if (info.unusable.includes(c)) continue;
        const text = info.dark ? ACCENTS[c].textDark : ACCENTS[c].textLight;
        expect(contrastRatio(text, surf.surface), `${c} text on ${theme} surface`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(text, surf.bg), `${c} text on ${theme} bg`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('theme ink colors pass AA on their own surfaces', () => {
    for (const theme of APP_THEMES) {
      const s = THEME_SURFACES[theme];
      for (const ink of [s.ink, s.ink2, s.ink3]) {
        for (const bg of [s.bg, s.surface, s.surface2]) {
          expect(contrastRatio(ink, bg), `${theme} ${ink} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
