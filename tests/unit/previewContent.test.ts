/**
 * Example content for the Make-mine preview: deterministic, clearly marked, covering every data view
 * (filtered ones included), using example images only, and never storable as real records.
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, recordMatchesView, type AppSpec } from '../../shared/appSpec.ts';
import { EXAMPLE_IMAGE_PREFIX, validateValues } from '../../shared/records.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import { EXAMPLE_IMAGES, previewRecords } from '../../server/services/previewContent.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';

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
});
