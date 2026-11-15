/**
 * Unit tests for the runtime's pure logic (sorting, grouping, board columns, helpers).
 * Run with: npx vitest run client/src/runtime (requires the include glob to cover client/src).
 */
import { describe, expect, it, vi } from 'vitest';
import { AppSpecSchema, type AppSpec } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { todayIso } from '@shared/time.ts';
import { FOLLOW_UP_BOARD, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER } from '../../../server/fixtures/specs.ts';
import {
  boardCardFields,
  boardLayout,
  dueBadgeClass,
  dueSummaryLine,
  focusCandidates,
  journalFields,
  journalGroups,
  listColumns,
  listRows,
  personGroups,
  personInitials,
  personNote,
  personShortName,
  queueDateField,
  queueRule,
  recentRecords,
  recordDate,
  resolveFields,
  type BoardViewSpec,
  type JournalViewSpec,
  type ListViewSpec,
  type QueueViewSpec,
} from './viewLogic.ts';
import { appHomePath, appSettingsPath, cacheKey, capitalize, detectPlatform, draftKey, purposeLabel, sameValues, stableStringify, timeAgo } from './runtimeUtils.ts';

const journal = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
const board = AppSpecSchema.parse(FOLLOW_UP_BOARD);
const tracker = AppSpecSchema.parse(PRACTICE_TRACKER);

let n = 0;
function rec(values: Record<string, unknown>, createdAt = `2026-11-10T10:00:${String(n++).padStart(2, '0')}.000Z`): AppRecord {
  return { id: `r${n}`, appId: 'app', values, createdAt, updatedAt: createdAt };
}

const journalView = journal.views[0] as JournalViewSpec;
const boardView = board.views[0] as BoardViewSpec;
const listView = tracker.views[1] as ListViewSpec;

describe('recordDate', () => {
  it('uses the date field when it is a valid date', () => {
    expect(recordDate(rec({ date: '2026-11-03' }), 'date')).toBe('2026-11-03');
  });
  it('falls back to the local creation date', () => {
    const r = rec({ date: 'not a date' }, '2026-11-05T12:00:00.000Z');
    const expected = new Date(r.createdAt);
    const iso = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(recordDate(r, 'date')).toBe(iso);
    expect(recordDate(r)).toBe(iso);
  });
});

describe('journal', () => {
  it('groups by day, newest first, with creation time as the tiebreak', () => {
    const a = rec({ date: '2026-11-01', subject: 'a' }, '2026-11-01T09:00:00.000Z');
    const b = rec({ date: '2026-11-03', subject: 'b' }, '2026-11-03T09:00:00.000Z');
    const c = rec({ date: '2026-11-03', subject: 'c' }, '2026-11-03T11:00:00.000Z');
    const groups = journalGroups(journalView, [a, b, c]);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-03', '2026-11-01']);
    expect(groups[0]?.records.map((r) => r.values.subject)).toEqual(['c', 'b']);
  });
  it('sorts oldest first when the view asks for it', () => {
    const a = rec({ date: '2026-11-01' });
    const b = rec({ date: '2026-11-03' });
    const groups = journalGroups({ ...journalView, sort: 'oldest' }, [b, a]);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-01', '2026-11-03']);
  });
  it('shows all visible fields except the title and date, and drops hidden ones', () => {
    const ids = journalFields(journal, journalView).map((f) => f.id);
    expect(ids).toEqual(['location', 'reflection', 'mood', 'keeper']);
    const hidden: AppSpec = { ...journal, fields: journal.fields.map((f) => (f.id === 'mood' ? { ...f, hidden: true } : f)) };
    expect(journalFields(hidden, journalView).map((f) => f.id)).not.toContain('mood');
  });
  it('respects an explicit showFieldIds order and ignores unknown ids', () => {
    const ids = journalFields(journal, { ...journalView, showFieldIds: ['mood', 'nope', 'subject', 'location', 'mood'] }).map((f) => f.id);
    expect(ids).toEqual(['mood', 'location']);
  });
});

describe('board', () => {
  const today = todayIso();
  const addDays = (d: number) => {
    const x = new Date();
    x.setDate(x.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const rule = board.rules.find((r) => r.type === 'due_soon');
  const records = [
    rec({ person: 'Late', stage: 'promised', due: addDays(-2) }),
    rec({ person: 'Today', stage: 'waiting', due: today }),
    rec({ person: 'Soon', stage: 'met', due: addDays(2) }),
    rec({ person: 'Done', stage: 'done', due: addDays(-5) }),
    rec({ person: 'Later', stage: 'met', due: addDays(30) }),
    rec({ person: 'Undated', stage: 'met' }),
    rec({ person: 'Odd', stage: 'mystery' }),
  ];

  it('builds one column per stage option and flags done columns', () => {
    const layout = boardLayout(board, boardView, records, rule && rule.type === 'due_soon' ? rule : undefined);
    expect(layout.stageField?.id).toBe('stage');
    expect(layout.columns.map((c) => c.option.value)).toEqual(['met', 'promised', 'waiting', 'done']);
    expect(layout.columns.find((c) => c.option.value === 'done')?.done).toBe(true);
    expect(layout.columns.find((c) => c.option.value === 'met')?.records.map((r) => r.values.person)).toEqual(['Soon', 'Later', 'Undated']);
    expect(layout.other.map((r) => r.values.person)).toEqual(['Odd']);
  });
  it('filters cards with the include predicate', () => {
    const keep = new Set(['Late', 'Today']);
    const layout = boardLayout(board, boardView, records, undefined, (r) => keep.has(String(r.values.person)));
    const total = layout.columns.reduce((s, c) => s + c.records.length, 0) + layout.other.length;
    expect(total).toBe(2);
  });
  it('returns no columns when the stage field is not a select', () => {
    const broken: AppSpec = { ...board, fields: board.fields.map((f) => (f.id === 'stage' ? { id: 'stage', label: 'Stage', type: 'text' } : f)) };
    expect(boardLayout(broken, boardView, records).stageField).toBeNull();
  });
  it('lists card fields in order without the title or stage', () => {
    expect(boardCardFields(board, boardView).map((f) => f.id)).toEqual(['commitment', 'due']);
    expect(boardCardFields(board, { ...boardView, cardFieldIds: ['person', 'stage', 'channel'] }).map((f) => f.id)).toEqual(['channel']);
  });
  it('summarizes due counts without zeros', () => {
    expect(dueSummaryLine({ overdue: 2, dueToday: 1, dueSoon: 3 })).toBe('2 overdue · 1 due today · 3 due soon');
    expect(dueSummaryLine({ overdue: 0, dueToday: 1, dueSoon: 0 })).toBe('1 due today');
    expect(dueSummaryLine({ overdue: 0, dueToday: 0, dueSoon: 0 })).toBe('');
  });
  it('maps due status to badge classes', () => {
    expect(dueBadgeClass('overdue')).toContain('badge-danger');
    expect(dueBadgeClass('due_today')).toContain('badge-warn');
    expect(dueBadgeClass('due_soon')).toContain('badge-warn');
    expect(dueBadgeClass('done')).toContain('badge-ok');
    expect(dueBadgeClass('scheduled')).toBe('badge');
    expect(dueBadgeClass('none')).toBe('');
  });
});

describe('list', () => {
  const a = rec({ focus: 'a', date: '2026-11-01', minutes: 10 }, '2026-11-01T09:00:00.000Z');
  const b = rec({ focus: 'b', date: '2026-11-03', minutes: 30 }, '2026-11-03T09:00:00.000Z');
  const c = rec({ focus: 'c', minutes: 20 }, '2026-11-02T09:00:00.000Z');

  it('sorts by the sort field in the requested direction, empties last', () => {
    expect(listRows(tracker, listView, [a, b, c]).map((r) => r.values.focus)).toEqual(['b', 'a', 'c']);
    expect(listRows(tracker, { ...listView, sortDir: 'asc' }, [a, b, c]).map((r) => r.values.focus)).toEqual(['a', 'b', 'c']);
  });
  it('sorts numbers numerically', () => {
    expect(listRows(tracker, { ...listView, sortFieldId: 'minutes', sortDir: 'desc' }, [a, b, c]).map((r) => r.values.minutes)).toEqual([30, 20, 10]);
  });
  it('falls back to creation time when there is no sort field', () => {
    expect(listRows(tracker, { ...listView, sortFieldId: undefined }, [a, b, c]).map((r) => r.values.focus)).toEqual(['b', 'c', 'a']);
  });
  it('uses the configured columns, or the first visible short fields', () => {
    expect(listColumns(tracker, listView).map((f) => f.id)).toEqual(['date', 'minutes', 'quality']);
    expect(listColumns(tracker, { ...listView, columnFieldIds: undefined }).map((f) => f.id)).toEqual(['date', 'minutes', 'quality']);
  });
  it('resolveFields skips hidden, excluded and duplicate ids', () => {
    const ids = resolveFields(tracker, ['notes', 'minutes', 'minutes', 'focus'], ['focus'], () => []).map((f) => f.id);
    expect(ids).toEqual(['notes', 'minutes']);
  });
  it('recentRecords returns the newest three', () => {
    expect(recentRecords([a, b, c]).map((r) => r.values.focus)).toEqual(['b', 'c', 'a']);
    expect(recentRecords([a, b, c], 2)).toHaveLength(2);
  });
  it('recentRecords goes by the entry’s own date when it has one, not by when it was typed in', () => {
    const typedToday = (focus: string, date: string, at: string) => rec({ focus, date }, at);
    const older = typedToday('older', '2026-11-01', '2026-11-14T10:00:00.000Z');
    const newer = typedToday('newer', '2026-11-12', '2026-11-14T09:00:00.000Z');
    expect(recentRecords([older, newer], 3, 'date').map((r) => r.values.focus)).toEqual(['newer', 'older']);
    expect(recentRecords([older, newer], 3).map((r) => r.values.focus)).toEqual(['older', 'newer']);
  });
});

describe('runtime helpers', () => {
  it('formats relative times', () => {
    const now = new Date('2026-11-14T12:00:00.000Z');
    expect(timeAgo('2026-11-14T11:59:50.000Z', now)).toBe('just now');
    expect(timeAgo('2026-11-14T11:55:00.000Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-14T09:00:00.000Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-11-13T12:00:00.000Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-11T12:00:00.000Z', now)).toBe('3 days ago');
    expect(timeAgo('2026-10-01T12:00:00.000Z', now)).toMatch(/Oct/);
    expect(timeAgo('garbage', now)).toBe('');
  });
  it('compares value maps regardless of key order and undefined keys', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
    expect(sameValues({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValues({ a: 1 }, { a: 2 })).toBe(false);
  });
  it('builds storage keys and paths', () => {
    expect(cacheKey('abc')).toBe('aas_cache_abc');
    expect(draftKey('abc')).toBe('aas_draft_abc_new');
    expect(draftKey('abc', 'r1')).toBe('aas_draft_abc_r1');
    expect(appHomePath('abc')).toBe('/apps/abc/');
    expect(appSettingsPath('abc')).toBe('/apps/abc/settings');
  });
  it('labels purposes in product language', () => {
    expect(purposeLabel('work')).toBe('Get things done');
    expect(purposeLabel('explore')).toBe('Explore life');
    expect(capitalize('journal')).toBe('Journal');
  });
  it('detects the platform from the user agent', () => {
    vi.stubGlobal('window', {});
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe('desktop');
    vi.unstubAllGlobals();
  });
});

describe('People: names with a hyphen (review finding 7)', () => {
  it('keeps a hyphen inside a name as part of it, and never turns half a name into context', () => {
    expect(personShortName('Mary-Jane Watson')).toBe('Mary-Jane Watson');
    expect(personNote('Mary-Jane Watson')).toBe('');
    expect(personShortName('Jean-Luc')).toBe('Jean-Luc');
    expect(personNote('Jean-Luc')).toBe('');
    expect(personShortName('Seo-yeon Park')).toBe('Seo-yeon Park');
    expect(personInitials('Seo-yeon Park')).toBe('SP');
    expect(personShortName('Anna-Lena, from the meetup')).toBe('Anna-Lena');
    expect(personNote('Anna-Lena, from the meetup')).toBe('From the meetup');
  });

  it('still cuts at a dash set apart by a space, and at an en or em dash', () => {
    expect(personShortName('Maya - design meetup')).toBe('Maya');
    expect(personNote('Maya - design meetup')).toBe('Design meetup');
    expect(personShortName('Maya – design meetup')).toBe('Maya');
    expect(personShortName('Maya—design meetup')).toBe('Maya');
    expect(personNote('Maya—design meetup')).toBe('Design meetup');
  });
});

describe('People: queue helpers', () => {
  const people = AppSpecSchema.parse(PEOPLE_QUEUE);
  const queue = people.views[0] as QueueViewSpec;

  it('a view without its own date field takes the due rule’s, so cards show why they are due (review finding 4)', () => {
    const { dueFieldId: _own, ...rest } = queue;
    const ruled: QueueViewSpec = rest;
    expect(queueDateField(queueRule(people, queue))).toBe('due');
    expect(queueDateField(queueRule(people, ruled))).toBe('due');
    expect(queueDateField(queueRule({ ...people, rules: [] }, ruled))).toBeUndefined();
  });

  it('groups a tab by person in the order each first appears, merging the same person', () => {
    const items = [rec({ person: 'Maya, met at the mixer', action: 'A' }), rec({ person: 'Alex', action: 'B' }), rec({ person: 'maya', action: 'C' })];
    const groups = personGroups(queue, items);
    expect(groups.map((g) => g.label)).toEqual(['Maya', 'Alex']);
    expect(groups[0]!.records.map((r) => r.values.action)).toEqual(['A', 'C']);
  });

  it('after an item leaves, focus goes to it (when kept), then the next, then the one before (review finding 5)', () => {
    expect(focusCandidates(['a', 'b', 'c'], 'b', false)).toEqual(['c', 'a']);
    expect(focusCandidates(['a', 'b', 'c'], 'b', true)).toEqual(['b', 'c', 'a']);
    expect(focusCandidates(['a', 'b', 'c'], 'c', false)).toEqual(['b', 'a']);
    expect(focusCandidates(['a'], 'a', false)).toEqual([]);
    expect(focusCandidates(['a'], 'x', true)).toEqual(['x']);
  });
});
