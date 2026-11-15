/**
 * The redesign's additions to the app contract: image fields, gallery / practice / links / queue
 * views, per-view filters and forms, the design block with compatibility defaults, capabilities,
 * and the set_design revision op. Schema version stays 1, so the old fixtures must keep validating
 * next to the new ones.
 */
import { describe, expect, it } from 'vitest';
import {
  AppSpecSchema, VIEW_TYPES, capabilitiesOf, designFor, fieldTypeLabel, formFieldsFor, recordMatchesView, validateAppSpec, viewTypeLabel,
  type AppSpec, type AppSpecInput, type ViewSpec,
} from '../../shared/appSpec.ts';
import { RevisionOpSchema, applyRevision } from '../../shared/revision.ts';
import { defaultValues, formatValue, imageMediaIds, validateValues } from '../../shared/records.ts';
import { FIXTURES, FOLLOW_UP_BOARD, LIGHT_GALLERY, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER, RIFF_PRACTICE, fixtureSpec } from '../../server/fixtures/specs.ts';

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

const riff = (): AppSpec => AppSpecSchema.parse(RIFF_PRACTICE);
const light = (): AppSpec => AppSpecSchema.parse(LIGHT_GALLERY);
const people = (): AppSpec => AppSpecSchema.parse(PEOPLE_QUEUE);
const journal = (): AppSpec => AppSpecSchema.parse(PHOTO_WALK_JOURNAL);

function viewOf(spec: AppSpec, id: string): ViewSpec {
  const v = spec.views.find((x) => x.id === id);
  if (!v) throw new Error(`fixture changed: no view "${id}"`);
  return v;
}

/** A spec with its design block removed, as an app built before the redesign would look. */
function withoutDesign(input: AppSpecInput): AppSpec {
  const { design: _design, ...rest } = input;
  return AppSpecSchema.parse(rest);
}

const A_MEDIA_ID = 'Ab12Cd34Ef56Gh78'; // 16 URL-safe chars, like newId()

describe('the three reference apps are valid, structurally different apps', () => {
  it.each(['riff-practice', 'light-gallery', 'people-queue'])('accepts the "%s" fixture with its design block', (key) => {
    const input = FIXTURES[key]!;
    const result = validateAppSpec(input);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.spec?.design).toBeDefined();
    expect(fixtureSpec(key)).toEqual(result.spec);
  });

  it('they lead with different primary views and patterns', () => {
    expect([riff(), light(), people()].map((s) => [s.pattern, s.views[0]?.type])).toEqual([
      ['practice', 'practice'],
      ['gallery', 'gallery'],
      ['queue', 'queue'],
    ]);
    expect(VIEW_TYPES).toEqual(expect.arrayContaining(['gallery', 'practice', 'links', 'queue']));
  });

  it('fills in the view defaults the renderers rely on', () => {
    const gallery = loose(LIGHT_GALLERY);
    delete gallery.views[0].columns;
    delete gallery.views[0].sort;
    const sheet = AppSpecSchema.parse(gallery).views[0];
    if (sheet?.type !== 'gallery') throw new Error('view changed');
    expect(sheet.columns).toBe(3);
    expect(sheet.sort).toBe('newest');

    const practice = loose(RIFF_PRACTICE);
    delete practice.views[0].presets;
    delete practice.views[0].defaultTempo;
    delete practice.views[0].tempoHelper;
    const timer = AppSpecSchema.parse(practice).views[0];
    if (timer?.type !== 'practice') throw new Error('view changed');
    expect(timer.presets).toEqual([10, 15, 25]);
    expect(timer.defaultTempo).toBe(72);
    expect(timer.tempoHelper).toBe(true);

    const queue = loose(PEOPLE_QUEUE);
    delete queue.views[0].groupBy;
    const next = AppSpecSchema.parse(queue).views[0];
    if (next?.type !== 'queue') throw new Error('view changed');
    expect(next.groupBy).toBe('due');
    expect(next.doneStageValues).toEqual([]);
  });
});

describe('view filters and forms', () => {
  it('a filter must point at a real select or text field, and at one of its options', () => {
    const unknown = loose(RIFF_PRACTICE);
    unknown.views[0].filter = { fieldId: 'ghost', value: 'session' };
    expect(errorsOf(unknown)).toContain('views.0.filter.fieldId: Unknown field "ghost"');

    const notAnOption = loose(RIFF_PRACTICE);
    notAnOption.views[0].filter = { fieldId: 'kind', value: 'jam' };
    expect(errorsOf(notAnOption)).toContain('views.0.filter.value: "jam" is not an option of kind');

    const wrongType = loose(RIFF_PRACTICE);
    wrongType.views[0].filter = { fieldId: 'minutes', value: '15' };
    expect(errorsOf(wrongType)).toContain('views.0.filter.fieldId: Field "minutes" must be select or text');

    const textFilter = loose(RIFF_PRACTICE);
    textFilter.views[0].filter = { fieldId: 'focus', value: 'Scales' };
    expect(validateAppSpec(textFilter).ok).toBe(true);
  });

  it('formFieldIds must name existing fields', () => {
    const bad = loose(RIFF_PRACTICE);
    bad.views[0].formFieldIds = ['date', 'minutes', 'ghost'];
    expect(errorsOf(bad)).toContain('views.0.formFieldIds.2: Unknown field "ghost"');
  });

  it('formFieldsFor shows the view\'s own fields, never the filter field or hidden fields', () => {
    const spec = riff();
    const practice = viewOf(spec, 'practice');
    expect(formFieldsFor(spec, practice).map((f) => f.id)).toEqual(['date', 'minutes', 'target_minutes', 'focus', 'tempo', 'feel', 'notes']);
    const sources = viewOf(spec, 'sources');
    expect(formFieldsFor(spec, sources).map((f) => f.id)).toEqual(['url', 'title', 'source_note', 'source_kind']);

    // Even when a form lists the filter field, the form never shows it: the view sets it.
    if (practice.type !== 'practice') throw new Error('view changed');
    practice.formFieldIds = ['kind', 'date', 'minutes'];
    expect(formFieldsFor(spec, practice).map((f) => f.id)).toEqual(['date', 'minutes']);

    // Hidden fields drop out of the form while their values stay in the records.
    const tempo = spec.fields.find((f) => f.id === 'tempo')!;
    tempo.hidden = true;
    practice.formFieldIds = ['date', 'minutes', 'tempo', 'focus'];
    expect(formFieldsFor(spec, practice).map((f) => f.id)).toEqual(['date', 'minutes', 'focus']);

    // Without formFieldIds: every visible field except the filter field.
    delete practice.formFieldIds;
    const ids = formFieldsFor(spec, practice).map((f) => f.id);
    expect(ids).not.toContain('kind');
    expect(ids).not.toContain('tempo');
    expect(ids).toEqual(spec.fields.filter((f) => !f.hidden && f.id !== 'kind').map((f) => f.id));
  });

  it('recordMatchesView keeps each view to its own records', () => {
    const spec = riff();
    const practice = viewOf(spec, 'practice');
    const sources = viewOf(spec, 'sources');
    const progress = viewOf(spec, 'progress');
    const session = { kind: 'session', minutes: 15 };
    const source = { kind: 'source', url: 'https://example.org/riff' };
    expect(recordMatchesView(practice, session)).toBe(true);
    expect(recordMatchesView(practice, source)).toBe(false);
    expect(recordMatchesView(sources, source)).toBe(true);
    expect(recordMatchesView(sources, session)).toBe(false);
    // A record that never had the field (older data) belongs to neither filtered view...
    expect(recordMatchesView(practice, { minutes: 20 })).toBe(false);
    // ...but an unfiltered view takes everything.
    expect(recordMatchesView(progress, { minutes: 20 })).toBe(true);
    expect(recordMatchesView(viewOf(journal(), 'entries'), {})).toBe(true);
  });
});

describe('designFor', () => {
  it('gives pre-redesign apps an identity from their pattern instead of making them identical', () => {
    const j = designFor(withoutDesign(PHOTO_WALK_JOURNAL));
    expect(j).toEqual({ theme: 'bright', accent: 'terracotta', typography: 'editorial', density: 'regular', artwork: 'none' });
    const b = designFor(withoutDesign(FOLLOW_UP_BOARD));
    expect(b).toMatchObject({ theme: 'bright', typography: 'compact', accent: 'teal' });
    const t = designFor(withoutDesign(PRACTICE_TRACKER));
    expect(t).toMatchObject({ theme: 'bright', typography: 'editorial', accent: 'plum' });
    expect(designFor(withoutDesign(LIGHT_GALLERY))).toMatchObject({ theme: 'paper', typography: 'editorial' });
    expect(designFor(withoutDesign(RIFF_PRACTICE))).toMatchObject({ theme: 'ink', typography: 'display' });
    expect(designFor(withoutDesign(PEOPLE_QUEUE))).toMatchObject({ theme: 'mint', typography: 'compact' });
  });

  it('an explicit design block wins, with the icon colour as the accent fallback', () => {
    expect(designFor(riff())).toEqual({ theme: 'ink', accent: 'lime', typography: 'display', density: 'regular', artwork: 'waves' });
    expect(designFor(light())).toEqual({ theme: 'paper', accent: 'orange', typography: 'editorial', density: 'airy', artwork: 'none' });
    const noAccent = loose(PEOPLE_QUEUE);
    delete noAccent.design.accent;
    expect(designFor(AppSpecSchema.parse(noAccent)).accent).toBe('white'); // the icon colour
  });

  it('refuses a theme or typography outside the allowlist', () => {
    const bad = loose(RIFF_PRACTICE);
    bad.design.theme = 'neon';
    expect(errorsOf(bad).some((e) => e.startsWith('design.theme: '))).toBe(true);
    const badType = loose(RIFF_PRACTICE);
    badType.design.typography = 'comic';
    expect(errorsOf(badType).some((e) => e.startsWith('design.typography: '))).toBe(true);
  });
});

describe('capabilitiesOf', () => {
  const sorted = (spec: AppSpec) => [...capabilitiesOf(spec)].sort();

  it('derives the real capabilities of every fixture', () => {
    expect(sorted(riff())).toEqual(['practice_timer', 'prompts', 'source_links', 'summary', 'tempo']);
    expect(sorted(light())).toEqual(['gallery', 'photo_upload', 'prompts', 'summary']);
    expect(sorted(people())).toEqual(['due_soon', 'next_actions', 'summary']);
    expect(sorted(journal())).toEqual(['journal', 'prompts', 'summary']);
    expect(sorted(AppSpecSchema.parse(FOLLOW_UP_BOARD))).toEqual(['board', 'due_soon', 'summary']);
    expect(sorted(AppSpecSchema.parse(PRACTICE_TRACKER))).toEqual(['list', 'summary']);
  });

  it('follows the spec, not the pattern: no tempo without the helper, no photo upload for a hidden image field', () => {
    const noTempo = riff();
    const practice = viewOf(noTempo, 'practice');
    if (practice.type !== 'practice') throw new Error('view changed');
    practice.tempoHelper = false;
    expect(capabilitiesOf(noTempo)).not.toContain('tempo');

    const hiddenPhoto = journal();
    hiddenPhoto.fields.push({ id: 'old_photo', label: 'Old photo', type: 'image', hidden: true });
    expect(capabilitiesOf(hiddenPhoto)).not.toContain('photo_upload');
    hiddenPhoto.fields[hiddenPhoto.fields.length - 1]!.hidden = false;
    expect(capabilitiesOf(hiddenPhoto)).toContain('photo_upload');
  });
});

describe('the new views check their field types', () => {
  it('a gallery whose image field is a text field is rejected with the path to the problem', () => {
    const bad = loose(LIGHT_GALLERY);
    bad.views[0].imageFieldId = 'caption';
    expect(errorsOf(bad)).toContain('views.0.imageFieldId: Field "caption" must be image');
    const badCaption = loose(LIGHT_GALLERY);
    badCaption.views[0].captionFieldId = 'date';
    expect(errorsOf(badCaption)).toContain('views.0.captionFieldId: Field "date" must be text or long_text');
  });

  it('a practice view needs a number field for minutes and tempo', () => {
    const bad = loose(RIFF_PRACTICE);
    bad.views[0].minutesFieldId = 'focus';
    expect(errorsOf(bad)).toContain('views.0.minutesFieldId: Field "focus" must be number');
    const badTempo = loose(RIFF_PRACTICE);
    badTempo.views[0].tempoFieldId = 'feel';
    expect(errorsOf(badTempo)).toContain('views.0.tempoFieldId: Field "feel" must be number');
    const outOfRange = loose(RIFF_PRACTICE);
    outOfRange.views[0].presets = [0];
    expect(errorsOf(outOfRange).some((e) => e.startsWith('views.0.presets.0: '))).toBe(true);
  });

  it('a links view needs a url field; a queue needs a text person field', () => {
    const bad = loose(RIFF_PRACTICE);
    bad.views[1].urlFieldId = 'title';
    expect(errorsOf(bad)).toContain('views.1.urlFieldId: Field "title" must be url');
    const badPerson = loose(PEOPLE_QUEUE);
    badPerson.views[0].personFieldId = 'context';
    expect(errorsOf(badPerson)).toContain('views.0.personFieldId: Field "context" must be text');
  });

  it('a queue without doneFieldId or stageFieldId is rejected: actions must be completable', () => {
    const bad = loose(PEOPLE_QUEUE);
    delete bad.views[0].doneFieldId;
    expect(errorsOf(bad)).toContain('views.0: A queue needs doneFieldId or stageFieldId so actions can be completed');

    // A stage-based queue works, as long as its done stages are real options.
    const staged = loose(PEOPLE_QUEUE);
    delete staged.views[0].doneFieldId;
    staged.fields.push({ id: 'stage', label: 'Stage', type: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }] });
    staged.views[0].stageFieldId = 'stage';
    staged.views[0].doneStageValues = ['done'];
    expect(validateAppSpec(staged).ok).toBe(true);
    staged.views[0].doneStageValues = ['done', 'archived'];
    expect(errorsOf(staged)).toContain('views.0.doneStageValues: "archived" is not an option of stage');

    const notCheckbox = loose(PEOPLE_QUEUE);
    notCheckbox.views[0].doneFieldId = 'action';
    expect(errorsOf(notCheckbox)).toContain('views.0.doneFieldId: Field "action" must be checkbox');
  });
});

describe('set_design revision op', () => {
  it('merges into an existing design and describes the change in plain words', () => {
    const before = riff();
    const result = applyRevision(before, [{ op: 'set_design', design: { theme: 'sunset' } }]);
    expect(result.errors).toEqual([]);
    expect(result.spec?.design).toEqual({ theme: 'sunset', accent: 'lime', typography: 'display', density: 'regular', artwork: 'waves' });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatch(/sunset/);
    expect(result.changes[0]).toMatch(/sessions are untouched/);
    expect(result.changes[0]).toMatch(/^[A-Z].*\.$/);
    expect(before.design?.theme).toBe('ink'); // the current spec is never mutated
    expect(designFor(result.spec!).theme).toBe('sunset');
  });

  it('gives a pre-redesign app a complete design block from a partial request', () => {
    const result = applyRevision(withoutDesign(PHOTO_WALK_JOURNAL), [{ op: 'set_design', design: { theme: 'paper', accent: 'orange', density: 'airy' } }]);
    expect(result.ok).toBe(true);
    expect(result.spec?.design).toEqual({ theme: 'paper', accent: 'orange', typography: 'editorial', density: 'airy', artwork: 'none' });
    expect(result.changes[0]).toMatch(/paper/);
    expect(result.changes[0]).toMatch(/orange/);
    expect(result.changes[0]).toMatch(/airy/);
    expect(result.changes[0]).toMatch(/walks are untouched/);
    // Records are untouched: the op never touches fields or views.
    expect(result.spec?.fields).toEqual(withoutDesign(PHOTO_WALK_JOURNAL).fields);
  });

  it('is accepted by the op schema only with allowlisted values', () => {
    expect(RevisionOpSchema.safeParse({ op: 'set_design', design: { theme: 'mint' } }).success).toBe(true);
    expect(RevisionOpSchema.safeParse({ op: 'set_design', design: {} }).success).toBe(true);
    expect(RevisionOpSchema.safeParse({ op: 'set_design', design: { theme: 'neon' } }).success).toBe(false);
    expect(RevisionOpSchema.safeParse({ op: 'set_design', design: { accent: 'hotpink' } }).success).toBe(false);
  });

  it('a practice view can be added to an older app through a revision, and the result stays valid', () => {
    const tracker = AppSpecSchema.parse(PRACTICE_TRACKER);
    const added = applyRevision(tracker, [{ op: 'add_view', view: { id: 'timer', type: 'practice', title: 'Practice', minutesFieldId: 'minutes', focusFieldId: 'focus', feelFieldId: 'quality', notesFieldId: 'notes', dateFieldId: 'date', presets: [15, 25], defaultTempo: 72, tempoHelper: true } }]);
    expect(added.errors).toEqual([]);
    expect(added.changes).toEqual(['Add a practice timer view “Practice”.']);
    expect(capabilitiesOf(added.spec!)).toEqual(expect.arrayContaining(['practice_timer', 'tempo']));

    const wrong = applyRevision(tracker, [{ op: 'add_view', view: { id: 'sheet', type: 'gallery', imageFieldId: 'focus', columns: 3, sort: 'newest' } }]);
    expect(wrong.ok).toBe(false);
    expect(wrong.errors).toContain('views.2.imageFieldId: Field "focus" must be image');
  });
});

describe('image values in records', () => {
  const spec = light();
  const base = { date: '2026-11-14', caption: 'Low sun on the brick wall' };

  it('accepts a media id and refuses example images, so preview content never reaches storage', () => {
    const ok = validateValues(spec, { ...base, photo: A_MEDIA_ID });
    expect(ok).toEqual({ ok: true, values: { ...base, photo: A_MEDIA_ID }, errors: {} });
    expect(validateValues(spec, { ...base, photo: ' Ab12Cd34Ef56Gh78 ' }).values.photo).toBe(A_MEDIA_ID);
    const example = validateValues(spec, { ...base, photo: 'example:light-1' });
    expect(example.ok).toBe(false);
    expect(example.errors).toEqual({ photo: 'Add a photo' });
    expect(validateValues(spec, { ...base, photo: 'https://example.org/photo.jpg' }).errors).toEqual({ photo: 'Add a photo' });
    expect(validateValues(spec, { ...base, photo: 'short' }).errors).toEqual({ photo: 'Add a photo' });
  });

  it('a required photo is "Required" when missing; unknown keys still pass through untouched', () => {
    const missing = validateValues(spec, base);
    expect(missing.ok).toBe(false);
    expect(missing.errors).toEqual({ photo: 'Required' });
    const legacy = validateValues(spec, { ...base, photo: A_MEDIA_ID, legacy_note: 'keep me', gear: { lens: '35mm' } });
    expect(legacy.ok).toBe(true);
    expect(legacy.values.legacy_note).toBe('keep me');
    expect(legacy.values.gear).toEqual({ lens: '35mm' });
    expect(validateValues(spec, { photo: 'example:light-2' }, { partial: true }).errors).toEqual({ photo: 'Add a photo' });
  });

  it('imageMediaIds lists only real media ids for the server\'s ownership check', () => {
    expect(imageMediaIds(spec, { ...base, photo: A_MEDIA_ID })).toEqual([A_MEDIA_ID]);
    expect(imageMediaIds(spec, { ...base, photo: 'example:light-1' })).toEqual([]);
    expect(imageMediaIds(spec, base)).toEqual([]);
    expect(imageMediaIds(journal(), { subject: A_MEDIA_ID })).toEqual([]); // not an image field
  });

  it('shows photos as "Photo", never invents one by default, and names the type "photo"', () => {
    const photo = spec.fields.find((f) => f.id === 'photo');
    expect(formatValue(photo, A_MEDIA_ID)).toBe('Photo');
    expect(formatValue(photo, '')).toBe('');
    expect('photo' in defaultValues(spec, new Date(2026, 10, 14))).toBe(false);
    expect(fieldTypeLabel('image')).toBe('photo');
    expect(viewTypeLabel('gallery')).toBe('photo gallery');
    expect(viewTypeLabel('practice')).toBe('practice timer');
    expect(viewTypeLabel('links')).toBe('saved sources');
    expect(viewTypeLabel('queue')).toBe('next-action queue');
  });
});
