/**
 * Deterministic rules: due-soon/overdue status, summary metrics and prompt rotation, all pinned
 * to a fixed "now" so the results never depend on the day the suite runs.
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, DueSoonRuleSchema, MetricSchema, PromptRotationRuleSchema, type DueSoonRule, type MetricSpec } from '../../shared/appSpec.ts';
import { computeMetric, currentPrompt, dueLabel, dueRuleFor, dueStatus, isDone, summarizeDue } from '../../shared/rules.ts';
import type { AppRecord } from '../../shared/records.ts';
import { isoWeekNumber, startOfWeekIso, todayIso } from '../../shared/time.ts';
import { FOLLOW_UP_BOARD, PHOTO_WALK_JOURNAL } from '../../server/fixtures/specs.ts';

/** Saturday 14 November 2026, 09:30 local time. */
const NOW = new Date(2026, 10, 14, 9, 30);
/** Monday 16 November 2026, 09:30 local time (for week-boundary checks). */
const MONDAY = new Date(2026, 10, 16, 9, 30);
const TODAY = '2026-11-14';

let seq = 0;
/** Midday UTC timestamps keep the calendar date stable in every time zone the suite may run in. */
function rec(values: Record<string, unknown>, createdAt = '2026-11-14T12:00:00.000Z'): AppRecord {
  seq += 1;
  return { id: `rec_${String(seq).padStart(6, '0')}`, appId: 'app_under_test', values, createdAt, updatedAt: createdAt };
}

const stageRule: DueSoonRule = DueSoonRuleSchema.parse({ id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 3, stageFieldId: 'stage', doneStageValues: ['done'] });
const checkboxRule: DueSoonRule = DueSoonRuleSchema.parse({ id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 3, doneFieldId: 'done' });
const metric = (m: Record<string, unknown>): MetricSpec => MetricSchema.parse({ id: 'm', label: 'Metric', ...m });

describe('the calendar fixture is what the tests assume', () => {
  it('14 Nov 2026 is a Saturday and 16 Nov a Monday', () => {
    expect(NOW.getDay()).toBe(6);
    expect(MONDAY.getDay()).toBe(1);
    expect(todayIso(NOW)).toBe(TODAY);
    expect(startOfWeekIso(MONDAY)).toBe('2026-11-16');
    expect(startOfWeekIso(NOW)).toBe('2026-11-09');
  });
});

describe('due status', () => {
  it('a follow-up due yesterday is overdue', () => {
    expect(dueStatus(rec({ due: '2026-11-13', stage: 'promised' }), stageRule, NOW)).toBe('overdue');
    expect(dueStatus(rec({ due: '2026-10-01', stage: 'promised' }), stageRule, NOW)).toBe('overdue');
  });

  it('due today is due_today', () => {
    expect(dueStatus(rec({ due: TODAY, stage: 'promised' }), stageRule, NOW)).toBe('due_today');
  });

  it('due within the window is due_soon; one day past the window is scheduled', () => {
    expect(dueStatus(rec({ due: '2026-11-15', stage: 'promised' }), stageRule, NOW)).toBe('due_soon');
    expect(dueStatus(rec({ due: '2026-11-17', stage: 'promised' }), stageRule, NOW)).toBe('due_soon'); // withinDays = 3
    expect(dueStatus(rec({ due: '2026-11-18', stage: 'promised' }), stageRule, NOW)).toBe('scheduled'); // withinDays + 1
  });

  it('withinDays 0 means only today counts as soon', () => {
    const strict = DueSoonRuleSchema.parse({ ...stageRule, withinDays: 0 });
    expect(dueStatus(rec({ due: TODAY, stage: 'promised' }), strict, NOW)).toBe('due_today');
    expect(dueStatus(rec({ due: '2026-11-15', stage: 'promised' }), strict, NOW)).toBe('scheduled');
  });

  it('a done stage wins even when the date is long past', () => {
    expect(dueStatus(rec({ due: '2026-01-05', stage: 'done' }), stageRule, NOW)).toBe('done');
    expect(isDone(rec({ stage: 'done' }), stageRule)).toBe(true);
    expect(isDone(rec({ stage: 'waiting' }), stageRule)).toBe(false);
  });

  it('a ticked done checkbox also wins; only a real boolean counts', () => {
    expect(dueStatus(rec({ due: '2026-01-05', done: true }), checkboxRule, NOW)).toBe('done');
    expect(dueStatus(rec({ due: '2026-01-05', done: 'true' }), checkboxRule, NOW)).toBe('overdue');
    expect(dueStatus(rec({ due: '2026-01-05', done: false }), checkboxRule, NOW)).toBe('overdue');
  });

  it('a missing or unreadable date gives none instead of a wrong warning', () => {
    expect(dueStatus(rec({ stage: 'promised' }), stageRule, NOW)).toBe('none');
    expect(dueStatus(rec({ due: '', stage: 'promised' }), stageRule, NOW)).toBe('none');
    expect(dueStatus(rec({ due: 'next week', stage: 'promised' }), stageRule, NOW)).toBe('none');
    expect(dueStatus(rec({ due: '2026-02-30', stage: 'promised' }), stageRule, NOW)).toBe('none'); // not a real day
    expect(dueStatus(rec({ due: 20261114, stage: 'promised' }), stageRule, NOW)).toBe('none');
  });

  it('labels read naturally', () => {
    expect(dueLabel('overdue', '2026-11-13', NOW)).toBe('Overdue by 1 day');
    expect(dueLabel('overdue', '2026-11-11', NOW)).toBe('Overdue by 3 days');
    expect(dueLabel('due_today', TODAY, NOW)).toBe('Due today');
    expect(dueLabel('due_soon', '2026-11-15', NOW)).toBe('Due tomorrow');
    expect(dueLabel('due_soon', '2026-11-17', NOW)).toBe('Due in 3 days');
    expect(dueLabel('scheduled', '2026-11-18', NOW)).toBe('Due in 4 days');
    expect(dueLabel('done', '2026-11-01', NOW)).toBe('Done');
    expect(dueLabel('none', 'whenever', NOW)).toBe('');
    expect(dueLabel('overdue', undefined, NOW)).toBe('');
  });

  it('summarizeDue groups and orders what needs attention, soonest first', () => {
    const b = rec({ due: '2026-11-12', stage: 'promised' });
    const a = rec({ due: '2026-11-10', stage: 'promised' });
    const today = rec({ due: TODAY, stage: 'waiting' });
    const soonLater = rec({ due: '2026-11-17', stage: 'promised' });
    const soonEarlier = rec({ due: '2026-11-15', stage: 'promised' });
    const scheduled = rec({ due: '2026-11-30', stage: 'promised' });
    const done = rec({ due: '2026-11-01', stage: 'done' });
    const undated = rec({ stage: 'promised' });

    const s = summarizeDue([b, a, today, soonLater, soonEarlier, scheduled, done, undated], stageRule, NOW);
    expect(s.overdue.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(s.dueToday.map((r) => r.id)).toEqual([today.id]);
    expect(s.dueSoon.map((r) => r.id)).toEqual([soonEarlier.id, soonLater.id]);
    expect(s.attention.map((r) => r.id)).toEqual([a.id, b.id, today.id, soonEarlier.id, soonLater.id]);
  });

  it('dueRuleFor finds the rule for a board view', () => {
    const board = AppSpecSchema.parse(FOLLOW_UP_BOARD);
    expect(dueRuleFor(board, 'due')?.id).toBe('due_soon');
    expect(dueRuleFor(board)?.id).toBe('due_soon');
    expect(dueRuleFor(board, 'other_date')?.id).toBe('due_soon'); // falls back to the first due rule
    expect(dueRuleFor(AppSpecSchema.parse(PHOTO_WALK_JOURNAL), 'date')).toBeUndefined();
  });
});

describe('metrics', () => {
  const sessions = [
    rec({ date: '2026-11-14', minutes: 30, quality: 4, focus: 'Scales' }, '2026-11-14T12:00:00.000Z'),
    rec({ date: '2026-11-13', minutes: 45, quality: 3, focus: 'Bar 12' }, '2026-11-13T12:00:00.000Z'),
    rec({ date: '2026-11-12', minutes: '15', quality: 5, focus: 'New song' }, '2026-11-12T12:00:00.000Z'),
    rec({ date: '2026-11-01', focus: 'Warm-up only' }, '2026-11-01T12:00:00.000Z'),
  ];

  it('count counts matching entries and shows a unit when given', () => {
    expect(computeMetric(sessions, metric({ kind: 'count' }), NOW)).toMatchObject({ value: 4, display: '4' });
    expect(computeMetric(sessions, metric({ kind: 'count', unit: 'sessions' }), NOW).display).toBe('4 sessions');
    expect(computeMetric([], metric({ kind: 'count' }), NOW)).toMatchObject({ value: 0, display: '0' });
  });

  it('sum accepts numeric strings, skips blanks, and keeps the unit', () => {
    const r = computeMetric(sessions, metric({ kind: 'sum', fieldId: 'minutes', unit: 'min' }), NOW);
    expect(r.value).toBe(90);
    expect(r.display).toBe('90 min');
  });

  it('avg shows one decimal only when needed and a dash when empty', () => {
    expect(computeMetric(sessions, metric({ kind: 'avg', fieldId: 'quality' }), NOW)).toMatchObject({ value: 4, display: '4' });
    expect(computeMetric(sessions.slice(0, 2), metric({ kind: 'avg', fieldId: 'quality' }), NOW).display).toBe('3.5');
    expect(computeMetric([sessions[3]!], metric({ kind: 'avg', fieldId: 'quality' }), NOW)).toMatchObject({ value: null, display: '—' });
  });

  it('min and max', () => {
    expect(computeMetric(sessions, metric({ kind: 'min', fieldId: 'minutes', unit: 'min' }), NOW).display).toBe('15 min');
    expect(computeMetric(sessions, metric({ kind: 'max', fieldId: 'minutes' }), NOW)).toMatchObject({ value: 45, display: '45' });
    expect(computeMetric([], metric({ kind: 'max', fieldId: 'minutes' }), NOW)).toMatchObject({ value: null, display: '—' });
  });

  it('latest takes the most recently created entry', () => {
    const shuffled = [sessions[2]!, sessions[0]!, sessions[1]!];
    expect(computeMetric(shuffled, metric({ kind: 'latest', fieldId: 'focus' }), NOW)).toMatchObject({ value: 'Scales', display: 'Scales' });
    expect(computeMetric(shuffled, metric({ kind: 'latest', fieldId: 'minutes' }), NOW)).toMatchObject({ value: 30, display: '30' });
    const tagged = [rec({ tags: ['light', 'shadow'] }, '2026-11-14T12:00:00.000Z')];
    expect(computeMetric(tagged, metric({ kind: 'latest', fieldId: 'tags' }), NOW).display).toBe('light, shadow');
    expect(computeMetric([], metric({ kind: 'latest', fieldId: 'focus' }), NOW).display).toBe('—');
  });

  describe('where filters', () => {
    const cards = [
      rec({ stage: 'done', keeper: true, tags: ['a'] }),
      rec({ stage: 'promised', keeper: false, tags: [] }),
      rec({ stage: 'waiting', tags: ['b', 'c'] }),
    ];
    it('eq / neq compare the stored value', () => {
      expect(computeMetric(cards, metric({ kind: 'count', where: { fieldId: 'stage', op: 'eq', value: 'done' } }), NOW).value).toBe(1);
      expect(computeMetric(cards, metric({ kind: 'count', where: { fieldId: 'stage', op: 'neq', value: 'done' } }), NOW).value).toBe(2);
    });
    it('truthy / falsy treat an empty list as empty', () => {
      expect(computeMetric(cards, metric({ kind: 'count', where: { fieldId: 'keeper', op: 'truthy' } }), NOW).value).toBe(1);
      expect(computeMetric(cards, metric({ kind: 'count', where: { fieldId: 'keeper', op: 'falsy' } }), NOW).value).toBe(2);
      expect(computeMetric(cards, metric({ kind: 'count', where: { fieldId: 'tags', op: 'truthy' } }), NOW).value).toBe(2);
      expect(computeMetric(cards, metric({ kind: 'count', where: { fieldId: 'tags', op: 'falsy' } }), NOW).value).toBe(1);
    });
  });

  describe('periods', () => {
    it('today only counts entries dated today', () => {
      expect(computeMetric(sessions, metric({ kind: 'count', fieldId: 'date', period: 'today' }), NOW).value).toBe(1);
    });

    it('week starts on Monday: last Sunday is out when now is Monday, and the future is out too', () => {
      const week = [
        rec({ date: '2026-11-15' }), // Sunday, previous week
        rec({ date: '2026-11-16' }), // Monday = today
        rec({ date: '2026-11-17' }), // tomorrow
      ];
      expect(computeMetric(week, metric({ kind: 'count', fieldId: 'date', period: 'week' }), MONDAY).value).toBe(1);
      // On Saturday the 14th the week runs from Monday the 9th.
      const sat = [rec({ date: '2026-11-08' }), rec({ date: '2026-11-09' }), rec({ date: '2026-11-14' })];
      expect(computeMetric(sat, metric({ kind: 'count', fieldId: 'date', period: 'week' }), NOW).value).toBe(2);
    });

    it("week sums only this week's minutes", () => {
      expect(computeMetric(sessions, metric({ kind: 'sum', fieldId: 'minutes', period: 'week', unit: 'min' }), NOW).display).toBe('90 min');
      expect(computeMetric(sessions, metric({ kind: 'sum', fieldId: 'minutes', period: 'week', unit: 'min' }), MONDAY).display).toBe('0 min');
    });

    it('month uses the calendar month up to today', () => {
      const month = [rec({ date: '2026-10-31' }), rec({ date: '2026-11-01' }), rec({ date: '2026-11-14' }), rec({ date: '2026-11-15' })];
      expect(computeMetric(month, metric({ kind: 'count', fieldId: 'date', period: 'month' }), NOW).value).toBe(2);
    });

    it('falls back to the creation date when the metric has no date field', () => {
      const byCreated = [
        rec({ stage: 'done' }, '2026-11-14T12:00:00.000Z'),
        rec({ stage: 'done' }, '2026-11-02T12:00:00.000Z'),
        rec({ stage: 'done' }, '2026-10-30T12:00:00.000Z'),
      ];
      expect(computeMetric(byCreated, metric({ kind: 'count', period: 'week' }), NOW).value).toBe(1);
      expect(computeMetric(byCreated, metric({ kind: 'count', period: 'month' }), NOW).value).toBe(2);
    });
  });

  describe('streak', () => {
    const streak = metric({ kind: 'streak', fieldId: 'date' });
    it('counts consecutive days ending today', () => {
      const r = computeMetric([rec({ date: '2026-11-14' }), rec({ date: '2026-11-13' }), rec({ date: '2026-11-12' }), rec({ date: '2026-11-10' })], streak, NOW);
      expect(r).toMatchObject({ value: 3, display: '3 days' });
    });
    it('still counts when today has no entry yet (ends yesterday)', () => {
      expect(computeMetric([rec({ date: '2026-11-13' }), rec({ date: '2026-11-12' })], streak, NOW).value).toBe(2);
    });
    it('is zero after a two-day gap, one for a single day, and counts a day once', () => {
      expect(computeMetric([rec({ date: '2026-11-11' })], streak, NOW)).toMatchObject({ value: 0, display: '0 days' });
      expect(computeMetric([rec({ date: '2026-11-14' }), rec({ date: '2026-11-14' })], streak, NOW)).toMatchObject({ value: 1, display: '1 day' });
      expect(computeMetric([], streak, NOW).value).toBe(0);
    });
    it('uses the creation date when the date field is unreadable', () => {
      expect(computeMetric([rec({ date: 'someday' }, '2026-11-14T12:00:00.000Z')], streak, NOW).value).toBe(1);
    });
    it('honours the where filter like every other metric', () => {
      // BUG: see report. computeMetric's streak branch iterates `records` instead of the where-filtered
      // rows, so "days in a row with a keeper shot" counts every day that has any entry.
      const keepers = metric({ kind: 'streak', fieldId: 'date', where: { fieldId: 'keeper', op: 'truthy' } });
      const walks = [rec({ date: '2026-11-14', keeper: false }), rec({ date: '2026-11-13', keeper: true }), rec({ date: '2026-11-12', keeper: true })];
      expect(computeMetric(walks, keepers, NOW).value).toBe(2);
    });
  });
});

describe('prompt rotation', () => {
  const prompts = ['Shadows', 'Distances', 'Light', 'Corners', 'Textures', 'Frames', 'Colour pairs', 'Motion'];
  const weekly = PromptRotationRuleSchema.parse({ id: 'challenge', type: 'prompt_rotation', cadence: 'weekly', prompts });
  const daily = PromptRotationRuleSchema.parse({ id: 'daily', type: 'prompt_rotation', cadence: 'daily', prompts });

  it('a weekly prompt is the same all week and labelled with the ISO week', () => {
    const mon = currentPrompt(weekly, MONDAY);
    const sun = currentPrompt(weekly, new Date(2026, 10, 22, 23, 15));
    expect(sun.index).toBe(mon.index);
    expect(sun.text).toBe(prompts[mon.index]);
    expect(isoWeekNumber(MONDAY)).toBe(47);
    expect(mon.periodLabel).toBe('Week 47');
    expect(weekly.title).toBe('This week');
  });

  it('weekly prompts advance one step per week and cycle through every prompt', () => {
    const seen: number[] = [];
    for (let w = 0; w < prompts.length; w++) {
      const monday = new Date(2026, 5, 1 + 7 * w, 9, 30); // Mondays from 1 June 2026
      expect(monday.getDay()).toBe(1);
      seen.push(currentPrompt(weekly, monday).index);
    }
    expect(new Set(seen).size).toBe(prompts.length);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBe((seen[i - 1]! + 1) % prompts.length);
    const next = currentPrompt(weekly, new Date(2026, 5, 1 + 7 * prompts.length, 9, 30));
    expect(next.index).toBe(seen[0]);
  });

  it('a daily prompt changes every day, cycles, and is stable within the day', () => {
    const morning = currentPrompt(daily, new Date(2026, 10, 14, 7, 0));
    const evening = currentPrompt(daily, new Date(2026, 10, 14, 22, 0));
    expect(evening.index).toBe(morning.index);
    expect(morning.periodLabel).toBe('Today');
    const tomorrow = currentPrompt(daily, new Date(2026, 10, 15, 9, 30));
    expect(tomorrow.index).toBe((morning.index + 1) % prompts.length);
    const nextCycle = currentPrompt(daily, new Date(2026, 10, 14 + prompts.length, 9, 30));
    expect(nextCycle.index).toBe(morning.index);
  });

  it('a single prompt is always the prompt', () => {
    const one = PromptRotationRuleSchema.parse({ id: 'one', type: 'prompt_rotation', prompts: ['Just this'] });
    expect(currentPrompt(one, NOW)).toMatchObject({ index: 0, text: 'Just this' });
    expect(currentPrompt(one, MONDAY).index).toBe(0);
  });
});
