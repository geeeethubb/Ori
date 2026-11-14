/**
 * AppSpec contract: what an app definition may contain. The runtime only renders what passes
 * here, so these tests pin down both the happy path (every fixture) and the readable refusals.
 */
import { describe, expect, it } from 'vitest';
import {
  AppSpecSchema, FIELD_TYPES, fieldById, fieldTypeLabel, primaryView, validateAppSpec, visibleFields,
  type AppSpecInput,
} from '../../shared/appSpec.ts';
import { FIXTURES, FOLLOW_UP_BOARD, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER, fixtureSpec } from '../../server/fixtures/specs.ts';

/** Deep copy typed loosely so tests can break the shape on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loose(input: AppSpecInput): any {
  return structuredClone(input);
}

function errorsOf(input: unknown): string[] {
  const result = validateAppSpec(input);
  expect(result.ok).toBe(false);
  expect(result.spec).toBeUndefined();
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors;
}

describe('fixtures are valid apps', () => {
  it.each(Object.keys(FIXTURES))('accepts the "%s" fixture and applies defaults', (key) => {
    const input = FIXTURES[key]!;
    const result = validateAppSpec(input);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const spec = result.spec!;
    expect(spec.name).toBe(input.name);
    expect(spec.permissions).toEqual([]);
    expect(Array.isArray(spec.rules)).toBe(true);
    expect(spec.entryNoun.singular.length).toBeGreaterThan(0);
    expect(fixtureSpec(key)).toEqual(spec);
  });

  it('fills in defaults the UI relies on (rating max, journal sort, metric period, board done stages)', () => {
    const tracker = AppSpecSchema.parse(PRACTICE_TRACKER);
    const quality = fieldById(tracker, 'quality');
    expect(quality?.type).toBe('rating');
    if (quality?.type === 'rating') expect(quality.max).toBe(5);
    const summary = tracker.views.find((v) => v.type === 'summary');
    expect(summary?.type).toBe('summary');
    if (summary?.type === 'summary') expect(summary.metrics.find((m) => m.id === 'sessions')?.period).toBe('all');

    const journal = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
    const entries = primaryView(journal);
    expect(entries.type).toBe('journal');
    if (entries.type === 'journal') expect(entries.sort).toBe('newest');

    const board = AppSpecSchema.parse({ ...FOLLOW_UP_BOARD, views: [{ id: 'b', type: 'board', stageFieldId: 'stage', titleFieldId: 'person' }] });
    const view = primaryView(board);
    expect(view.type).toBe('board');
    if (view.type === 'board') expect(view.doneStageValues).toEqual([]);

    const bare = AppSpecSchema.parse({ ...PHOTO_WALK_JOURNAL, rules: undefined, entryNoun: undefined, permissions: undefined });
    expect(bare.rules).toEqual([]);
    expect(bare.entryNoun).toEqual({ singular: 'entry', plural: 'entries' });
    expect(bare.permissions).toEqual([]);
  });

  it('fixtureSpec returns null for an unknown key', () => {
    expect(fixtureSpec('not-a-fixture')).toBeNull();
  });
});

describe('refusals are specific and point at the offending path', () => {
  it('rejects duplicate field ids', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.fields.push({ ...bad.fields[1], label: 'Second subject' });
    expect(errorsOf(bad)).toContain('fields: Field IDs must be unique');
  });

  it('rejects a board whose stage field is not a choice field', () => {
    const bad = loose(FOLLOW_UP_BOARD);
    bad.views[0].stageFieldId = 'person';
    expect(errorsOf(bad)).toContain('views.0.stageFieldId: Field "person" must be select');
  });

  it('rejects a journal whose date field is a text field', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.views[0].dateFieldId = 'subject';
    expect(errorsOf(bad)).toContain('views.0.dateFieldId: Field "subject" must be date');
  });

  it('rejects a sum over a text field, and a sum with no field at all', () => {
    const bad = loose(PRACTICE_TRACKER);
    bad.views[0].metrics[0].fieldId = 'focus';
    expect(errorsOf(bad)).toContain('views.0.metrics.0.fieldId: Field "focus" must be number or rating');

    const missing = loose(PRACTICE_TRACKER);
    delete missing.views[0].metrics[0].fieldId;
    expect(errorsOf(missing)).toContain('views.0.metrics.0: sum needs a numeric fieldId');
  });

  it('rejects a streak over a non-date field and a latest without a field', () => {
    const bad = loose(PRACTICE_TRACKER);
    bad.views[0].metrics[1].fieldId = 'minutes'; // the streak metric
    expect(errorsOf(bad)).toContain('views.0.metrics.1.fieldId: Field "minutes" must be date');

    const latest = loose(PRACTICE_TRACKER);
    latest.views[0].metrics[2] = { id: 'last', label: 'Last focus', kind: 'latest' };
    expect(errorsOf(latest)).toContain('views.0.metrics.2: latest needs a fieldId');
  });

  it('rejects done stages that are not options of the stage field', () => {
    const bad = loose(FOLLOW_UP_BOARD);
    bad.views[0].doneStageValues = ['done', 'archived'];
    expect(errorsOf(bad)).toContain('views.0.doneStageValues: "archived" is not an option of stage');
  });

  it('rejects unknown field types', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.fields[0].type = 'emoji';
    const errors = errorsOf(bad);
    expect(errors.some((e) => e.startsWith('fields.0.type: '))).toBe(true);
    expect(errors.join('\n')).toContain("'date'"); // the message lists what IS allowed
  });

  it('rejects non-empty permissions (reserved for later)', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.permissions = ['camera'];
    expect(errorsOf(bad).some((e) => e.startsWith('permissions'))).toBe(true);
  });

  it('rejects a choice default that is not one of its options', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.fields[4].default = 'angry'; // mood
    expect(errorsOf(bad)).toContain('fields: Default "angry" is not an option of mood');
  });

  it('rejects a due-soon rule with done stages but no stage field', () => {
    const bad = loose(FOLLOW_UP_BOARD);
    delete bad.rules[0].stageFieldId;
    expect(errorsOf(bad)).toContain('rules.0: doneStageValues requires stageFieldId');
  });

  it('rejects a due-soon rule whose done field is not a checkbox', () => {
    const bad = loose(FOLLOW_UP_BOARD);
    bad.rules[0].doneFieldId = 'commitment';
    expect(errorsOf(bad)).toContain('rules.0.doneFieldId: Field "commitment" must be checkbox');
  });

  it('rejects references to fields that do not exist (views, cards, metrics, where)', () => {
    const view = loose(PHOTO_WALK_JOURNAL);
    view.views[0].titleFieldId = 'nope';
    expect(errorsOf(view)).toContain('views.0.titleFieldId: Unknown field "nope"');

    const card = loose(FOLLOW_UP_BOARD);
    card.views[0].cardFieldIds = ['commitment', 'ghost'];
    expect(errorsOf(card)).toContain('views.0.cardFieldIds.1: Unknown field "ghost"');

    const where = loose(PHOTO_WALK_JOURNAL);
    where.views[1].metrics[1].where.fieldId = 'ghost';
    expect(errorsOf(where)).toContain('views.1.metrics.1.where.fieldId: Unknown field "ghost"');
  });

  it('rejects duplicate view ids', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.views[1].id = 'entries';
    expect(errorsOf(bad)).toContain('views: Duplicate view id entries');
  });

  it('rejects field ids that are not snake_case', () => {
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.fields[0].id = 'Date';
    expect(errorsOf(bad)).toContain('fields.0.id: Field IDs must be snake_case (a-z, 0-9, _)');
  });

  it('rejects an app with no fields or no views', () => {
    const noFields = loose(PHOTO_WALK_JOURNAL);
    noFields.fields = [];
    expect(errorsOf(noFields).some((e) => e.startsWith('fields: '))).toBe(true);

    const noViews = loose(PHOTO_WALK_JOURNAL);
    noViews.views = [];
    expect(errorsOf(noViews).some((e) => e.startsWith('views: '))).toBe(true);
  });

  it('rejects out-of-range rule settings and oversized names', () => {
    const far = loose(FOLLOW_UP_BOARD);
    far.rules[0].withinDays = 365;
    expect(errorsOf(far).some((e) => e.startsWith('rules.0.withinDays: '))).toBe(true);

    const longName = loose(PHOTO_WALK_JOURNAL);
    longName.name = 'x'.repeat(61);
    expect(errorsOf(longName).some((e) => e.startsWith('name: '))).toBe(true);
  });

  it('every error is "<path>: <message>", and non-objects report against "spec"', () => {
    expect(validateAppSpec(null).errors).toEqual(['spec: Invalid input: expected object, received null']);
    expect(validateAppSpec('photo journal').errors[0]).toMatch(/^spec: /);
    const bad = loose(PHOTO_WALK_JOURNAL);
    bad.fields[0].id = 'Date';
    bad.views[1].id = 'entries';
    for (const e of errorsOf(bad)) expect(e).toMatch(/^[a-z][A-Za-z0-9_.]*: \S/);
  });
});

describe('helpers', () => {
  it('visibleFields leaves hidden fields out but fieldById still finds them', () => {
    const spec = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
    const location = fieldById(spec, 'location')!;
    location.hidden = true;
    expect(visibleFields(spec).map((f) => f.id)).toEqual(['date', 'subject', 'reflection', 'mood', 'keeper']);
    expect(fieldById(spec, 'location')?.hidden).toBe(true);
    expect(fieldById(spec, undefined)).toBeUndefined();
    expect(fieldById(spec, 'ghost')).toBeUndefined();
  });

  it('primaryView is the first view', () => {
    const spec = AppSpecSchema.parse(FOLLOW_UP_BOARD);
    expect(primaryView(spec).id).toBe('board');
  });

  it('fieldTypeLabel gives plain words for every field type', () => {
    for (const type of FIELD_TYPES) {
      const label = fieldTypeLabel(type);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain('_');
    }
    expect(fieldTypeLabel('select')).toBe('choice');
    expect(fieldTypeLabel('url')).toBe('link');
  });
});
