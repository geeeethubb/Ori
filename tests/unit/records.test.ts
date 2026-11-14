/**
 * Record values: what happens to what a person types into an app form. Coercion is forgiving,
 * errors are per field and readable, and nothing stored under an old or hidden field is lost.
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, type AppSpec } from '../../shared/appSpec.ts';
import { MAX_VALUE_KEYS, defaultValues, formatValue, recordTitle, validateValues, type AppRecord } from '../../shared/records.ts';
import { todayIso } from '../../shared/time.ts';
import { FOLLOW_UP_BOARD, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER } from '../../server/fixtures/specs.ts';

const NOW = new Date(2026, 10, 14, 9, 30);
const journal = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
const tracker = AppSpecSchema.parse(PRACTICE_TRACKER);
const board = AppSpecSchema.parse(FOLLOW_UP_BOARD);

/** Small app covering the field types the fixtures do not use (url, tags) plus a hidden field. */
const readingList: AppSpec = AppSpecSchema.parse({
  schemaVersion: 1,
  name: 'Reading List',
  purpose: 'explore',
  pattern: 'tracker',
  icon: { symbol: 'book', color: 'ocean' },
  fields: [
    { id: 'title', label: 'Title', type: 'text', required: true },
    { id: 'link', label: 'Link', type: 'url' },
    { id: 'tags', label: 'Tags', type: 'tags' },
    { id: 'rating', label: 'Rating', type: 'rating', max: 5 },
    { id: 'old_note', label: 'Old note', type: 'text', hidden: true },
    { id: 'finished', label: 'Finished', type: 'checkbox', required: true },
    { id: 'started', label: 'Started', type: 'date', default: '2026-01-01' },
  ],
  views: [{ id: 'list', type: 'list', titleFieldId: 'title' }],
});

const VALID_WALK = { date: '2026-11-14', subject: 'Low sun on the brick wall', location: 'Station Road', mood: 'calm', keeper: true };

describe('coercion per field type', () => {
  it('numbers accept numeric strings, refuse words, and enforce min/max with readable messages', () => {
    const session = { date: '2026-11-14', focus: 'Scales' };
    expect(validateValues(tracker, { ...session, minutes: '45' })).toMatchObject({ ok: true, values: { minutes: 45 } });
    expect(validateValues(tracker, { ...session, minutes: 30.5 }).values.minutes).toBe(30.5);
    expect(validateValues(tracker, { ...session, minutes: 'forty' })).toMatchObject({ ok: false, errors: { minutes: 'Enter a number' } });
    expect(validateValues(tracker, { ...session, minutes: 0 }).errors).toEqual({ minutes: 'Minimum is 1' });
    expect(validateValues(tracker, { ...session, minutes: 601 }).errors).toEqual({ minutes: 'Maximum is 600' });
  });

  it('checkboxes become real booleans', () => {
    const base = { date: '2026-11-14', subject: 'x' };
    expect(validateValues(journal, { ...base, keeper: 'true' }).values.keeper).toBe(true);
    expect(validateValues(journal, { ...base, keeper: true }).values.keeper).toBe(true);
    expect(validateValues(journal, { ...base, keeper: 1 }).values.keeper).toBe(true);
    expect(validateValues(journal, { ...base, keeper: 'false' }).values.keeper).toBe(false);
    expect(validateValues(journal, { ...base, keeper: false }).values.keeper).toBe(false);
    expect(validateValues(journal, { ...base, keeper: '' }).values.keeper).toBe(false);
    expect(validateValues(journal, { ...base, keeper: null }).values.keeper).toBe(false);
  });

  it('tags accept a comma-separated string or a list, trimmed and de-duplicated', () => {
    const base = { title: 'Dune', finished: false };
    expect(validateValues(readingList, { ...base, tags: 'sci-fi, classic, ,sci-fi' }).values.tags).toEqual(['sci-fi', 'classic']);
    expect(validateValues(readingList, { ...base, tags: [' slow ', 'slow', 'long'] }).values.tags).toEqual(['slow', 'long']);
    expect(validateValues(readingList, { ...base, tags: '' }).values.tags).toEqual([]);
    expect(validateValues(readingList, { ...base, tags: [] }).values.tags).toEqual([]);
    expect(validateValues(readingList, { ...base }).values.tags).toBeUndefined(); // not sent, not invented
  });

  it('ratings must be whole numbers within the scale', () => {
    const base = { title: 'Dune', finished: false };
    expect(validateValues(readingList, { ...base, rating: 4 }).values.rating).toBe(4);
    expect(validateValues(readingList, { ...base, rating: '3' }).values.rating).toBe(3);
    expect(validateValues(readingList, { ...base, rating: 6 }).errors).toEqual({ rating: 'Pick 1–5' });
    expect(validateValues(readingList, { ...base, rating: 2.5 }).errors).toEqual({ rating: 'Pick 1–5' });
    expect(validateValues(readingList, { ...base, rating: 'great' }).errors).toEqual({ rating: 'Enter a number' });
  });

  it('choices must be one of the options', () => {
    expect(validateValues(journal, { ...VALID_WALK, mood: 'inspired' }).ok).toBe(true);
    expect(validateValues(journal, { ...VALID_WALK, mood: 'angry' })).toMatchObject({ ok: false, errors: { mood: 'Pick one of the options' } });
    expect(validateValues(board, { person: 'Sam', stage: 'promised' }).ok).toBe(true);
    expect(validateValues(board, { person: 'Sam', stage: 'archived' }).errors).toEqual({ stage: 'Pick one of the options' });
  });

  it('links must start with http:// or https://', () => {
    const base = { title: 'Dune', finished: false };
    expect(validateValues(readingList, { ...base, link: 'https://example.com/dune' }).ok).toBe(true);
    expect(validateValues(readingList, { ...base, link: 'HTTP://example.com' }).ok).toBe(true);
    expect(validateValues(readingList, { ...base, link: 'example.com/dune' })).toMatchObject({ ok: false, errors: { link: 'Links should start with http:// or https://' } });
    expect(validateValues(readingList, { ...base, link: 'javascript:alert(1)' }).ok).toBe(false);
  });

  it('dates must be YYYY-MM-DD (whitespace tolerated)', () => {
    expect(validateValues(journal, { ...VALID_WALK, date: ' 2026-11-14 ' }).values.date).toBe('2026-11-14');
    expect(validateValues(journal, { ...VALID_WALK, date: 'today' }).errors).toEqual({ date: 'Use a date like 2026-11-14' });
    expect(validateValues(journal, { ...VALID_WALK, date: '14/11/2026' }).errors).toEqual({ date: 'Use a date like 2026-11-14' });
    expect(validateValues(journal, { ...VALID_WALK, date: 14 }).errors).toEqual({ date: 'Use a date like 2026-11-14' });
  });

  it('dates must be real calendar days, not just the right shape', () => {
    // BUG: see report. shared/records.ts coerceField checks only the YYYY-MM-DD shape (ISO_DATE regex),
    // so an impossible day such as 2026-02-30 is saved, and the rules layer (which uses parseIsoDate)
    // then shows no due status for it. Validation should refuse it with the same message.
    expect(validateValues(journal, { ...VALID_WALK, date: '2026-02-30' }).errors).toEqual({ date: 'Use a date like 2026-11-14' });
    expect(validateValues(journal, { ...VALID_WALK, date: '2026-13-01' }).errors).toEqual({ date: 'Use a date like 2026-11-14' });
  });

  it('long text is cut at the limit and flagged rather than silently dropped', () => {
    const result = validateValues(journal, { ...VALID_WALK, subject: 'x'.repeat(501) });
    expect(result.ok).toBe(false);
    expect(result.errors.subject).toBe('Keep this under 500 characters');
    expect(String(result.values.subject)).toHaveLength(500);
  });
});

describe('required fields', () => {
  it('a missing or blank required field says "Required" and nothing else is lost', () => {
    const missing = validateValues(journal, { date: '2026-11-14', location: 'Park' });
    expect(missing.ok).toBe(false);
    expect(missing.errors).toEqual({ subject: 'Required' });
    expect(missing.values.location).toBe('Park');
    expect(validateValues(journal, { ...VALID_WALK, subject: '' }).errors).toEqual({ subject: 'Required' });
    expect(validateValues(journal, { ...VALID_WALK, subject: null }).errors).toEqual({ subject: 'Required' });
  });

  it('partial mode (PATCH) skips fields that were not sent but still checks the ones that were', () => {
    expect(validateValues(journal, { location: 'Canal path' }, { partial: true })).toEqual({ ok: true, values: { location: 'Canal path' }, errors: {} });
    expect(validateValues(journal, { subject: '' }, { partial: true }).errors).toEqual({ subject: 'Required' });
    expect(validateValues(journal, { mood: 'angry' }, { partial: true }).errors).toEqual({ mood: 'Pick one of the options' });
  });

  it('a required checkbox is never "missing": unticked is simply false', () => {
    const result = validateValues(readingList, { title: 'Dune' });
    expect(result.ok).toBe(true);
    expect(result.values.finished).toBeUndefined();
    expect(validateValues(readingList, { title: 'Dune', finished: '' }).values.finished).toBe(false);
  });

  it('a valid entry passes with every value typed correctly', () => {
    expect(validateValues(journal, VALID_WALK)).toEqual({ ok: true, values: VALID_WALK, errors: {} });
  });
});

describe('nothing is lost', () => {
  it('values for unknown keys pass through untouched (data from older versions survives)', () => {
    const nested = { lens: '35mm', settings: { iso: 400 } };
    const result = validateValues(journal, { ...VALID_WALK, legacy_note: 'keep me', gear: nested });
    expect(result.ok).toBe(true);
    expect(result.values.legacy_note).toBe('keep me');
    expect(result.values.gear).toEqual(nested);
  });

  it('values for hidden fields are preserved without coercion', () => {
    const result = validateValues(readingList, { title: 'Dune', finished: true, old_note: 12345 });
    expect(result.ok).toBe(true);
    expect(result.values.old_note).toBe(12345);
    const longHidden = validateValues(readingList, { title: 'Dune', finished: true, old_note: 'y'.repeat(25_000) });
    expect(String(longHidden.values.old_note)).toHaveLength(20_000); // bounded, but kept
  });

  it('errors still return the coerced values so a form can re-render what was typed', () => {
    const result = validateValues(tracker, { date: '2026-11-14', focus: 'Scales', minutes: 900 });
    expect(result.ok).toBe(false);
    expect(result.values).toEqual({ date: '2026-11-14', focus: 'Scales', minutes: 900 });
  });
});

describe('guard rails', () => {
  it('refuses more than the maximum number of keys', () => {
    expect(MAX_VALUE_KEYS).toBe(64);
    const tooMany = Object.fromEntries(Array.from({ length: MAX_VALUE_KEYS + 1 }, (_, i) => [`k${i}`, i]));
    expect(validateValues(journal, tooMany)).toEqual({ ok: false, values: {}, errors: { _: 'Too many fields (max 64)' } });
    const justEnough = { ...VALID_WALK, ...Object.fromEntries(Array.from({ length: MAX_VALUE_KEYS - 5 }, (_, i) => [`k${i}`, i])) };
    expect(Object.keys(justEnough)).toHaveLength(MAX_VALUE_KEYS);
    expect(validateValues(journal, justEnough).ok).toBe(true);
  });

  it('refuses anything that is not an object', () => {
    for (const input of [null, undefined, 'subject', 42, ['subject']]) {
      expect(validateValues(journal, input)).toEqual({ ok: false, values: {}, errors: { _: 'Values must be an object' } });
    }
  });
});

describe('defaultValues', () => {
  it('"today" resolves to the local calendar date and other defaults are applied', () => {
    expect(defaultValues(journal, NOW)).toEqual({ date: todayIso(NOW), mood: 'calm', keeper: false });
    expect(todayIso(NOW)).toBe('2026-11-14');
    expect(defaultValues(board, NOW)).toEqual({ stage: 'met', channel: 'email' });
    expect(defaultValues(tracker, NOW)).toEqual({ date: '2026-11-14' });
  });

  it('skips hidden fields and keeps fixed date defaults as written', () => {
    const defaults = defaultValues(readingList, NOW);
    expect(defaults).toEqual({ tags: [], finished: false, started: '2026-01-01' });
    expect('old_note' in defaults).toBe(false);
  });

  it('uses the current date when none is given', () => {
    expect(defaultValues(journal).date).toBe(todayIso());
  });
});

describe('formatValue', () => {
  it('shows labels, yes/no, joined tags, units and rating scales', () => {
    const f = (id: string) => journal.fields.find((x) => x.id === id) ?? tracker.fields.find((x) => x.id === id) ?? readingList.fields.find((x) => x.id === id);
    expect(formatValue(f('mood'), 'calm')).toBe('Calm');
    expect(formatValue(f('mood'), 'unknown_value')).toBe('unknown_value');
    expect(formatValue(f('keeper'), true)).toBe('Yes');
    expect(formatValue(f('keeper'), false)).toBe('No');
    expect(formatValue(f('tags'), ['light', 'shadow'])).toBe('light, shadow');
    expect(formatValue(f('minutes'), 45)).toBe('45 min');
    expect(formatValue(f('rating'), 4)).toBe('4/5');
    expect(formatValue(f('quality'), 3)).toBe('3/5');
    expect(formatValue(f('subject'), 'Brick wall')).toBe('Brick wall');
  });

  it('shows nothing for empty values and copes with a field that no longer exists', () => {
    expect(formatValue(journal.fields[0], null)).toBe('');
    expect(formatValue(journal.fields[0], undefined)).toBe('');
    expect(formatValue(journal.fields[0], '')).toBe('');
    expect(formatValue(undefined, 'plain')).toBe('plain');
    expect(formatValue(undefined, { a: 1 })).toBe('{"a":1}');
    expect(formatValue(undefined, 12)).toBe('12');
  });
});

describe('recordTitle', () => {
  const record = (values: Record<string, unknown>): AppRecord => ({
    id: 'rec_000000000001', appId: 'app_under_test', values, createdAt: '2026-11-14T12:00:00.000Z', updatedAt: '2026-11-14T12:00:00.000Z',
  });

  it('uses the view title field when given, otherwise the first visible short-text field', () => {
    expect(recordTitle(journal, record(VALID_WALK), 'subject')).toBe('Low sun on the brick wall');
    expect(recordTitle(journal, record(VALID_WALK))).toBe('Low sun on the brick wall');
    expect(recordTitle(journal, record(VALID_WALK), 'location')).toBe('Station Road');
    expect(recordTitle(journal, record({ ...VALID_WALK, mood: 'calm' }), 'mood')).toBe('Calm');
  });

  it('falls back to the first long text, shortened, then to an "Untitled" noun', () => {
    const reflection = 'A long reflection about the way the light fell across the brickwork and how I waited for it to change';
    expect(recordTitle(journal, record({ date: '2026-11-14', reflection }))).toBe(`${reflection.slice(0, 57)}…`);
    expect(recordTitle(journal, record({ date: '2026-11-14', reflection: 'Short note' }))).toBe('Short note');
    expect(recordTitle(journal, record({ date: '2026-11-14' }))).toBe('Untitled walk');
    expect(recordTitle(board, record({}))).toBe('Untitled follow-up');
  });

  it('ignores hidden text fields when choosing a fallback title', () => {
    const hiddenFirst = AppSpecSchema.parse({
      ...PHOTO_WALK_JOURNAL,
      fields: PHOTO_WALK_JOURNAL.fields.map((f) => (f.id === 'subject' ? { ...f, hidden: true, required: false } : f)),
    });
    expect(recordTitle(hiddenFirst, record({ subject: 'hidden value', location: 'Park' }))).toBe('Park');
  });
});
