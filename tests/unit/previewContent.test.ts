/**
 * Example content for the Make-mine preview: deterministic, clearly marked, covering every data view
 * (filtered ones included), using example images only, and never storable as real records.
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, recordMatchesView, type AppSpec } from '../../shared/appSpec.ts';
import { EXAMPLE_IMAGE_PREFIX, validateValues } from '../../shared/records.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { EXAMPLE_IMAGES, exampleLabel, focusPlaceholder, hasExamplePhotos, placeholderItems, previewDomain, previewRecords } from '../../shared/previewContent.ts';
import * as serverPreview from '../../server/services/previewContent.ts';
import { FOLLOW_UP_BOARD, LIGHT_GALLERY, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';
import { ALL_CONCEPTS } from '../../server/model/sample/catalog.ts';

const NOW = new Date(2026, 10, 14, 12, 0, 0);
const riff = AppSpecSchema.parse(RIFF_PRACTICE);
const light = AppSpecSchema.parse(LIGHT_GALLERY);
const people = AppSpecSchema.parse(PEOPLE_QUEUE);
const journal = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);

const dataViews = (spec: AppSpec) => spec.views.filter((v) => v.type !== 'summary');

describe('previewRecords', () => {
  it('is deterministic for a fixed clock and only the dates move with it', () => {
    const a = previewRecords(riff, 3, NOW);
    const b = previewRecords(riff, 3, NOW);
    expect(b).toEqual(a);
    const later = previewRecords(riff, 3, new Date(2026, 11, 2, 9, 0, 0));
    expect(later.map((r) => r.id)).toEqual(a.map((r) => r.id));
    expect(later.map((r) => ({ ...r.values, date: undefined }))).toEqual(a.map((r) => ({ ...r.values, date: undefined })));
    expect(later[0]?.values.date).toBe('2026-12-02');
    expect(a[0]?.values.date).toBe('2026-11-14');
  });

  it('marks every record as an example: ids, app id and timestamps in the past', () => {
    const records = previewRecords(riff, 3, NOW);
    expect(records.map((r) => r.id)).toEqual(records.map((_, i) => `example-${i + 1}`));
    for (const r of records) {
      expect(r.appId).toBe('example');
      expect(new Date(r.createdAt).getTime()).toBeLessThan(NOW.getTime());
      expect(r.updatedAt).toBe(r.createdAt);
    }
  });

  it('covers every data view, including filtered ones, with records that belong to it', () => {
    const records = previewRecords(riff, 3, NOW);
    const views = dataViews(riff);
    expect(views.map((v) => v.type)).toEqual(['practice', 'links']);
    for (const v of views) expect(records.filter((r) => recordMatchesView(v, r.values)).length).toBeGreaterThanOrEqual(3);
    for (const r of records) expect(views.some((v) => recordMatchesView(v, r.values))).toBe(true);
    const sessions = records.filter((r) => r.values.kind === 'session');
    const sources = records.filter((r) => r.values.kind === 'source');
    expect(sessions.length + sources.length).toBe(records.length);
    for (const s of sessions) {
      expect(typeof s.values.minutes).toBe('number');
      expect(s.values.minutes as number).toBeGreaterThanOrEqual(1);
      expect(s.values.minutes as number).toBeLessThanOrEqual(180);
    }
    for (const s of sources) expect(String(s.values.url)).toMatch(/^https:\/\//);
  });

  it('would validate as real records, except for the example photos', () => {
    for (const spec of [riff, people, journal]) {
      for (const r of previewRecords(spec, 3, NOW)) {
        const v = validateValues(spec, r.values);
        expect(v.errors, `${spec.name} ${r.id}`).toEqual({});
      }
    }
    for (const r of previewRecords(light, 3, NOW)) {
      const v = validateValues(light, r.values);
      expect(Object.keys(v.errors)).toEqual(['photo']); // the only thing that cannot be stored is the example image
    }
  });

  it('uses example images only, never anything shaped like a media id', () => {
    const records = previewRecords(light, 4, NOW);
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      const photo = String(r.values.photo);
      expect(photo.startsWith(EXAMPLE_IMAGE_PREFIX)).toBe(true);
      expect(EXAMPLE_IMAGES).toContain(photo);
      expect(SHORT_ID_PATTERN.test(photo)).toBe(false);
    }
    expect(new Set(records.map((r) => r.values.photo)).size).toBeGreaterThan(1); // a contact sheet, not one photo repeated
  });

  it('honours perView and leaves hidden fields out', () => {
    expect(previewRecords(journal, 2, NOW)).toHaveLength(2);
    expect(previewRecords(journal, 1, NOW)).toHaveLength(1);
    const hidden = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
    hidden.fields.find((f) => f.id === 'location')!.hidden = true;
    for (const r of previewRecords(hidden, 3, NOW)) expect('location' in r.values).toBe(false);
  });

  it('a date field counts back from today so a journal preview reads as recent history', () => {
    const dates = previewRecords(journal, 3, NOW).map((r) => String(r.values.date));
    expect(dates[0]).toBe('2026-11-14');
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < dates.length; i++) expect(dates[i]! < dates[i - 1]!).toBe(true); // strictly older, newest first
    expect(dates.at(-1)! >= '2026-11-01').toBe(true); // still recent
  });

  // Regression: checkbox examples used to derive from `i + n`, which never varied within a group, so a
  // People preview showed every follow-up as done. Example queues must show a mix of open and done.
  it('a queue preview shows at least one open (not yet done) action', () => {
    const queue = people.views[0];
    if (queue?.type !== 'queue' || !queue.doneFieldId) throw new Error('fixture changed');
    const done = queue.doneFieldId;
    const records = previewRecords(people, 3, NOW);
    expect(records.some((r) => r.values[done] !== true)).toBe(true);
  });

  // Regression: the timed field (seconds, 0–86400) took a value from its min/max, so the Riff preview
  // listed 15-minute sessions as "timed 360:00".
  it('example sessions read like the timer: a preset plan, seconds that match the minutes, one typed in', () => {
    const view = riff.views.find((v) => v.type === 'practice');
    if (view?.type !== 'practice') throw new Error('fixture changed');
    const all = previewRecords(riff, 3, NOW);
    const sessions = all.filter((r) => recordMatchesView(view, r.values));
    expect(sessions).toHaveLength(3);
    const timed = sessions.filter((s) => typeof s.values.timed_seconds === 'number');
    expect(timed).toHaveLength(2);
    for (const s of timed) {
      expect(view.presets).toContain(s.values.target_minutes);
      expect(s.values.timed_seconds).toBe(Number(s.values.minutes) * 60);
      expect(Number(s.values.minutes)).toBeLessThanOrEqual(Number(s.values.target_minutes));
    }
    const typedIn = sessions.filter((s) => s.values.timed_seconds === null);
    expect(typedIn).toHaveLength(1);
    expect(typedIn[0]?.values.target_minutes).toBeNull(); // typed in by hand: no plan
    for (const r of all) if (typeof r.values.timed_seconds === 'number') expect(r.values.timed_seconds).toBeLessThanOrEqual(25 * 60);
  });

  it('a practice view that shares its examples with another view still gets timer-shaped sessions', () => {
    const shared = AppSpecSchema.parse({
      ...RIFF_PRACTICE,
      views: [{ id: 'all', type: 'list', titleFieldId: 'focus' }, ...RIFF_PRACTICE.views.map((v) => (v.type === 'practice' ? { ...v, filter: undefined } : v))],
    });
    const records = previewRecords(shared, 3, NOW);
    expect(records.length).toBeGreaterThan(0);
    // Saved sources fill only their own form, so they carry no timer values at all.
    const timerShaped = records.filter((r) => 'timed_seconds' in r.values);
    expect(timerShaped.length).toBeGreaterThanOrEqual(3);
    for (const r of timerShaped) {
      if (r.values.timed_seconds === null) expect(r.values.target_minutes).toBeNull();
      else expect(r.values.timed_seconds).toBe(Number(r.values.minutes) * 60);
    }
  });

  // Regression: the seconds rule ignored the field's own range and matched the ordinal "Second", so a
  // 10-120 s plank hold showed 1200 s and a field for second-set reps showed 900.
  it('seconds examples stay inside the field range, and an ordinal Second is not seconds', () => {
    const spec = AppSpecSchema.parse({
      ...PHOTO_WALK_JOURNAL,
      fields: [
        ...PHOTO_WALK_JOURNAL.fields,
        { id: 'hold', label: 'Plank hold', type: 'number', min: 10, max: 120, unit: 's' },
        { id: 'rest', label: 'Rest between sets (seconds)', type: 'number', min: 0, max: 90 },
        { id: 'second_set', label: 'Second set reps', type: 'number' },
        { id: 'warmup', label: 'Warm-up (secs)', type: 'number', min: 0 },
      ],
    });
    const records = previewRecords(spec, 3, NOW);
    expect(records).toHaveLength(3);
    for (const r of records) expect(validateValues(spec, r.values).errors, r.id).toEqual({});
    const col = (id: string) => records.map((r) => r.values[id]);
    expect(col('hold')).toEqual([38, 65, 93]); // spread over 10-120, not pinned to its end
    expect(col('rest')).toEqual([23, 45, 68]);
    expect(col('second_set')).toEqual([10, 8, 12]); // reps, not 900 seconds
    expect(col('warmup')).toEqual([900, 1200, 720]); // a seconds field with room reads as minutes-sized
  });

  it('a practice spec whose own fields do not fit the timer still gets examples that validate', () => {
    const odd = AppSpecSchema.parse({
      ...RIFF_PRACTICE,
      fields: RIFF_PRACTICE.fields.map((f) => (f.id === 'target_minutes' ? { ...f, required: true } : f.id === 'timed_seconds' ? { ...f, max: 600 } : f)),
    });
    const records = previewRecords(odd, 3, NOW);
    expect(records.filter((r) => r.values.kind === 'session')).toHaveLength(3);
    for (const r of records) expect(validateValues(odd, r.values).errors, r.id).toEqual({});
  });
});

// ---------- audit P0-02: examples belong to the app being proposed ----------

/** Every string an example shows, lower-cased, for checking that nothing from another domain leaks in. */
const words = (records: { values: Record<string, unknown> }[]) =>
  records.flatMap((r) => Object.values(r.values)).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v): v is string => typeof v === 'string').join(' | ').toLowerCase();

const PHOTO_WORDS = /\b(?:shadows?|expos\w*|underexpos\w*|highlights?|brick|tram|food cart|golden hour|photo\w*|keeper)\b/;
const MUSIC_WORDS = /\b(?:riff|chords?|metronome|strum\w*|tempo|song)\b/;
const PEOPLE_WORDS = /\b(?:maya|demo link|meetup|follow[- ]?up)\b/;

/** A ten-minute sketching timer, shaped like the live model's "Ten-Minute Sketch Sprint". */
const SKETCH_SPRINT = AppSpecSchema.parse({
  schemaVersion: 1,
  name: 'Ten-Minute Sketch Sprint',
  tagline: 'One small drawing a day',
  purpose: 'explore',
  pattern: 'practice',
  icon: { symbol: 'pen', color: 'lilac' },
  fields: [
    { id: 'date', label: 'Date', type: 'date', default: 'today' },
    { id: 'minutes', label: 'Minutes drawn', type: 'number', min: 1, max: 120, unit: 'min' },
    { id: 'subject', label: 'What did you draw?', type: 'text' },
    { id: 'medium', label: 'Medium', type: 'select', options: [{ value: 'pencil', label: 'Pencil' }, { value: 'ink', label: 'Ink' }, { value: 'watercolour', label: 'Watercolour' }] },
    { id: 'notes', label: 'What worked', type: 'long_text' },
    { id: 'planned', label: 'Planned minutes', type: 'number', min: 1, max: 120, unit: 'min' },
    { id: 'timed', label: 'Timed', type: 'number', min: 0, max: 86400, unit: 's' },
  ],
  views: [
    { id: 'sprint', type: 'practice', title: 'Sprint', minutesFieldId: 'minutes', focusFieldId: 'subject', notesFieldId: 'notes', dateFieldId: 'date', targetMinutesFieldId: 'planned', timedSecondsFieldId: 'timed', presets: [10, 5, 15], tempoHelper: false, addLabel: 'Save sketch' },
  ],
  rules: [{ id: 'daily', type: 'prompt_rotation', cadence: 'daily', title: "Today's sketch", prompts: ['Draw your coffee cup', 'Draw your hand', 'Draw the view from a window'] }],
  entryNoun: { singular: 'sketch', plural: 'sketches' },
});

const NEWSLETTER = AppSpecSchema.parse({
  schemaVersion: 1,
  name: 'Newsletter Notebook',
  tagline: 'Collect ideas for your next issue',
  purpose: 'work',
  pattern: 'journal',
  icon: { symbol: 'notebook', color: 'orange' },
  fields: [
    { id: 'date', label: 'Date', type: 'date', default: 'today', required: true },
    { id: 'snippet', label: 'Snippet or idea', type: 'text', required: true },
    { id: 'angle', label: 'The angle', type: 'long_text' },
    { id: 'source', label: 'Link', type: 'url' },
  ],
  views: [{ id: 'notes', type: 'journal', title: 'Snippets', dateFieldId: 'date', titleFieldId: 'snippet' }],
  entryNoun: { singular: 'snippet', plural: 'snippets' },
});

describe('domain-aware examples (audit P0-02)', () => {
  it('reads the domain from the spec itself', () => {
    expect(previewDomain(light)).toBe('photo');
    expect(previewDomain(journal)).toBe('photo');
    expect(previewDomain(riff)).toBe('music');
    expect(previewDomain(AppSpecSchema.parse(PRACTICE_TRACKER))).toBe('music');
    expect(previewDomain(people)).toBe('people');
    expect(previewDomain(AppSpecSchema.parse(FOLLOW_UP_BOARD))).toBe('people');
    expect(previewDomain(SKETCH_SPRINT)).toBe('sketch');
    expect(previewDomain(NEWSLETTER)).toBe('newsletter');
  });

  it('a ten-minute sketching app previews sketches at 10 minutes, with no music or photography filler', () => {
    const records = previewRecords(SKETCH_SPRINT, 3, NOW);
    expect(records).toHaveLength(3);
    const text = words(records);
    expect(text).toMatch(/cup|hands|window|shoes/);
    expect(text).not.toMatch(MUSIC_WORDS);
    expect(text).not.toMatch(PHOTO_WORDS);
    // The first example is a full session at the timer's own default, measured by the clock.
    expect(records[0]?.values).toMatchObject({ minutes: 10, planned: 10, timed: 600 });
    for (const r of records) {
      expect(validateValues(SKETCH_SPRINT, r.values).errors, r.id).toEqual({});
      if (typeof r.values.timed === 'number') expect(r.values.timed).toBe(Number(r.values.minutes) * 60);
      else expect(r.values.planned).toBeNull();
    }
    expect(focusPlaceholder(SKETCH_SPRINT)).toMatch(/draw/i);
  });

  it('People shows people and promises, never photography or music notes', () => {
    const records = previewRecords(people, 3, NOW);
    const text = words(records);
    expect(text).toMatch(/maya|alex|jamie/);
    expect(text).not.toMatch(PHOTO_WORDS);
    expect(text).not.toMatch(MUSIC_WORDS);
    // A date the person has not confirmed stays in their own words.
    expect(records.some((r) => r.values.done !== true && typeof r.values.due_words === 'string' && r.values.due === undefined)).toBe(true);
    for (const r of records) expect(validateValues(people, r.values).errors, r.id).toEqual({});
  });

  it('a newsletter app previews newsletter snippets', () => {
    const records = previewRecords(NEWSLETTER, 3, NOW);
    expect(records).toHaveLength(3);
    expect(String(records[0]?.values.snippet)).toBe('Why small teams ship faster');
    const text = words(records);
    expect(text).not.toMatch(PHOTO_WORDS);
    expect(text).not.toMatch(MUSIC_WORDS);
    expect(text).not.toMatch(PEOPLE_WORDS);
  });

  it('music examples stay musical, and a saved source carries no practice time', () => {
    const records = previewRecords(riff, 3, NOW);
    const text = words(records);
    expect(text).not.toMatch(PHOTO_WORDS);
    expect(text).not.toMatch(PEOPLE_WORDS);
    for (const s of records.filter((r) => r.values.kind === 'source')) {
      for (const id of ['minutes', 'target_minutes', 'timed_seconds', 'tempo', 'feel']) expect(id in s.values, `${s.id} ${id}`).toBe(false);
    }
  });

  it('only photography gets example photos: a sketch gallery shows its empty state instead', () => {
    const gallery = AppSpecSchema.parse({
      ...SKETCH_SPRINT,
      name: 'Sketchbook Wall',
      pattern: 'gallery',
      fields: [...SKETCH_SPRINT.fields, { id: 'scan', label: 'Scan of the sketch', type: 'image' }],
      views: [{ id: 'wall', type: 'gallery', imageFieldId: 'scan', captionFieldId: 'subject', columns: 3 }],
      rules: [],
    });
    expect(previewDomain(gallery)).toBe('sketch');
    expect(previewRecords(gallery, 3, NOW)).toEqual([]);
    // A sketch journal with an optional photo field gets sketches without anyone else's photos.
    const journalWithPhoto = AppSpecSchema.parse({ ...gallery, pattern: 'journal', views: [{ id: 'log', type: 'journal', dateFieldId: 'date', titleFieldId: 'subject' }] });
    const records = previewRecords(journalWithPhoto, 3, NOW);
    expect(records.length).toBe(3);
    for (const r of records) expect('scan' in r.values).toBe(false);
  });

  it('Light captions describe their own example photo', () => {
    const records = previewRecords(light, 4, NOW);
    expect(records.map((r) => [r.values.photo, r.values.caption])).toEqual([
      ['example:light-1', 'Tree shadows across the brick street'],
      ['example:light-2', 'Long shadows over the path by the park'],
      ['example:light-3', "A bare tree's shadow on a warm brick wall"],
      ['example:light-4', 'Branch shadows on blue scaffolding'],
    ]);
    expect(words(records)).not.toMatch(MUSIC_WORDS);
    expect(words(records)).not.toMatch(PEOPLE_WORDS);
  });

  it('labels the examples and suggests a focus in the app\'s own domain', () => {
    expect(exampleLabel(light)).toBe('Example photos');
    expect(exampleLabel(riff)).toBe('Example sessions');
    expect(exampleLabel(people)).toBe('Example follow-ups');
    expect(focusPlaceholder(light)).toBe('Focus on shadows and reflections');
    expect(focusPlaceholder(riff)).toMatch(/chord/i);
    expect(focusPlaceholder(people)).toMatch(/people/i);
  });

  it('every catalog app gets examples that fit its fields, and every required field is filled', () => {
    for (const concept of ALL_CONCEPTS) {
      const spec = AppSpecSchema.parse(concept.buildSpec({ instructions: '' }));
      const records = previewRecords(spec, 3, NOW);
      for (const r of records) {
        const errors = Object.keys(validateValues(spec, r.values).errors);
        const imageIds = new Set(spec.fields.filter((f) => f.type === 'image').map((f) => f.id));
        // Example photos are the only thing a real record could not store.
        expect(errors.filter((k) => !imageIds.has(k)), `${concept.id} ${r.id}`).toEqual([]);
        for (const v of Object.values(r.values)) if (typeof v === 'string') expect(v.trim().length, `${concept.id} ${r.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('dates are relative to the day the preview is made', () => {
    const later = new Date(2027, 2, 3, 9, 0, 0);
    const a = previewRecords(people, 3, NOW);
    const b = previewRecords(people, 3, later);
    expect(a[0]?.values.due).toBe('2026-11-14'); // today
    expect(b[0]?.values.due).toBe('2027-03-03');
    expect(previewRecords(journal, 3, later)[0]?.values.date).toBe('2027-03-03');
  });
});

// ---------- review finding 5: examples differ from one another ----------

describe('examples are not the same words three times', () => {
  // Regression: a field's example placeholder filled every example, so Weekend Explorer showed "The
  // Saturday market in Pilsen" on every card and Habit Streaks "Read 10 pages, stretch, inbox zero"
  // three times; required fields with nothing to say read "Example company" x3.
  it('no visible text field of any catalog app or fixture has one value across all of its examples', () => {
    const specs: [string, AppSpec][] = [
      ...ALL_CONCEPTS.map((c): [string, AppSpec] => [c.id, AppSpecSchema.parse(c.buildSpec({ instructions: '' }))]),
      ...[FOLLOW_UP_BOARD, LIGHT_GALLERY, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER, RIFF_PRACTICE].map((s): [string, AppSpec] => [s.name, AppSpecSchema.parse(s)]),
    ];
    for (const [id, spec] of specs) {
      const records = previewRecords(spec, 3, NOW);
      for (const f of spec.fields) {
        if (f.hidden || (f.type !== 'text' && f.type !== 'long_text')) continue;
        const values = records.map((r) => r.values[f.id]).filter((v): v is string => typeof v === 'string');
        if (values.length < 2) continue;
        expect(new Set(values).size, `${id} ${f.id}: ${JSON.stringify(values)}`).toBeGreaterThan(1);
      }
    }
  });

  it('a placeholder that lists examples gives one item per example; a single example is used once', () => {
    expect(placeholderItems('Read 10 pages, stretch, inbox zero')).toEqual(['Read 10 pages', 'Stretch', 'Inbox zero']);
    expect(placeholderItems('Weekly sync, 1:1 with Priya')).toEqual(['Weekly sync', '1:1 with Priya']);
    // One example with a detail is not a list.
    expect(placeholderItems('Japan, spring')).toEqual(['Japan, spring']);
    expect(placeholderItems('Maya, met at the design meetup')).toEqual(['Maya, met at the design meetup']);
    expect(placeholderItems('Low sun on the brick wall')).toEqual(['Low sun on the brick wall']);

    const spec = AppSpecSchema.parse({
      schemaVersion: 1,
      name: 'Odds and Ends',
      tagline: 'Little things',
      purpose: 'explore',
      pattern: 'journal',
      icon: { symbol: 'star', color: 'lilac' },
      fields: [
        { id: 'date', label: 'Date', type: 'date', default: 'today', required: true },
        { id: 'thing', label: 'Thing', type: 'text', required: true, placeholder: 'Read 10 pages, stretch, inbox zero' },
        { id: 'where', label: 'Spot', type: 'text', placeholder: 'The bench by the river' },
        { id: 'label', label: 'Label', type: 'text', required: true },
      ],
      views: [{ id: 'log', type: 'journal', dateFieldId: 'date', titleFieldId: 'thing' }],
      rules: [],
      entryNoun: { singular: 'thing', plural: 'things' },
    });
    expect(previewDomain(spec)).toBe('general');
    const records = previewRecords(spec, 3, NOW);
    expect(records.map((r) => r.values.thing)).toEqual(['Read 10 pages', 'Stretch', 'Inbox zero']);
    // An optional field's single example appears once; the rest stay empty rather than repeat it.
    expect(records.map((r) => r.values.where)).toEqual(['The bench by the river', undefined, undefined]);
    // A required field with nothing to say is plainly labelled and numbered, never repeated.
    expect(records.map((r) => r.values.label)).toEqual(['Example label', 'Example label 2', 'Example label 3']);
    for (const r of records) expect(validateValues(spec, r.values).errors, r.id).toEqual({});
  });

  it('meetings, jobs, films, projects, homes, outings, habits and budgets have examples of their own', () => {
    const byId = (id: string) => {
      const c = ALL_CONCEPTS.find((x) => x.id === id);
      if (!c) throw new Error(`concept ${id} missing`);
      return AppSpecSchema.parse(c.buildSpec({ instructions: '' }));
    };
    const expected: Record<string, string> = {
      'meeting-notes': 'meetings', 'job-search-tracker': 'jobs', 'film-log': 'film', 'side-project-milestones': 'projects',
      'household-projects': 'home', 'weekend-explorer': 'outings', 'habit-streaks': 'habits', 'budget-check-in': 'budget',
    };
    for (const [id, domain] of Object.entries(expected)) {
      const spec = byId(id);
      expect(previewDomain(spec), id).toBe(domain);
      expect(focusPlaceholder(spec), id).not.toBe('Focus on what matters most to you');
      const text = words(previewRecords(spec, 3, NOW));
      expect(text, id).not.toMatch(/\bexample (?:company|film|entry)\b/);
    }
    // Meeting decisions are decisions, not notes about a person (they used to read "Prefers email to calls.").
    const meetings = previewRecords(byId('meeting-notes'), 3, NOW);
    expect(meetings.map((r) => r.values.meeting)).toEqual(['Weekly team sync', '1:1 with Priya', 'Launch planning']);
    expect(words(meetings)).not.toMatch(/prefers email|demo link|met at the/);
    expect(meetings.every((r) => r.values.my_next_step !== r.values.actions)).toBe(true);
    // A job board names companies and roles; a film log names films and directors.
    expect(previewRecords(byId('job-search-tracker'), 3, NOW).map((r) => r.values.company)).toEqual(['Northwind Labs', 'Brightline Health', 'Studio Parallel']);
    expect(previewRecords(byId('film-log'), 3, NOW).map((r) => [r.values.title, r.values.director])[0]).toEqual(['Paris, Texas', 'Wim Wenders']);
    // A weekend idea that has not happened yet does not say how it went.
    for (const r of previewRecords(byId('weekend-explorer'), 3, NOW)) expect('how_it_went' in r.values).toBe(r.values.stage === 'done');
  });

  it('the existing reference apps keep their domains', () => {
    expect(previewDomain(light)).toBe('photo');
    expect(previewDomain(riff)).toBe('music');
    expect(previewDomain(people)).toBe('people');
    expect(previewDomain(AppSpecSchema.parse(FOLLOW_UP_BOARD))).toBe('people');
  });
});

describe('shared module (review finding 12)', () => {
  it('the server path re-exports the shared module, so both read the same domain', () => {
    expect(serverPreview.previewRecords).toBe(previewRecords);
    expect(serverPreview.exampleLabel).toBe(exampleLabel);
  });

  it('says whether an app\'s examples include photos without comparing label text', () => {
    expect(hasExamplePhotos(light)).toBe(true);
    expect(hasExamplePhotos(journal)).toBe(false); // a photo walk journal has no gallery
    expect(hasExamplePhotos(riff)).toBe(false);
    expect(hasExamplePhotos(people)).toBe(false);
  });
});
