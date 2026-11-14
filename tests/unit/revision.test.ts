/**
 * Revisions: a bounded set of operations that turn one app version into the next without ever
 * losing saved values. Tests read like the change preview a user sees before accepting.
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, type AppSpec } from '../../shared/appSpec.ts';
import { RevisionOpSchema, applyRevision, fieldsTouched, type ApplyResult, type RevisionOp } from '../../shared/revision.ts';
import { FOLLOW_UP_BOARD, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER } from '../../server/fixtures/specs.ts';

const journal = (): AppSpec => AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
const board = (): AppSpec => AppSpecSchema.parse(FOLLOW_UP_BOARD);
const tracker = (): AppSpec => AppSpecSchema.parse(PRACTICE_TRACKER);

/** Journal whose entries view lists fields explicitly (the fixture shows all visible fields). */
function journalWithShowFields(): AppSpec {
  const spec = journal();
  const view = spec.views[0];
  if (view?.type !== 'journal') throw new Error('fixture changed: first view is no longer the journal');
  view.showFieldIds = ['location', 'reflection', 'mood'];
  return spec;
}

const NEXT_EXPERIMENT: RevisionOp = { op: 'add_field', field: { id: 'next_experiment', label: 'Next experiment', type: 'long_text' } };

function applied(result: ApplyResult): AppSpec {
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  if (!result.spec) throw new Error('ok result without a spec');
  return result.spec;
}

function refused(result: ApplyResult): string[] {
  expect(result.ok).toBe(false);
  expect(result.spec).toBeUndefined();
  expect(result.errors.length).toBeGreaterThan(0);
  return result.errors;
}

describe('adding a field', () => {
  it('appends the field, shows it in journal and list views that enumerate fields, and keeps data', () => {
    const before = journalWithShowFields();
    const result = applyRevision(before, [NEXT_EXPERIMENT]);
    const spec = applied(result);
    expect(spec.fields.at(-1)?.id).toBe('next_experiment');
    expect(spec.fields).toHaveLength(before.fields.length + 1);
    const view = spec.views[0];
    if (view?.type !== 'journal') throw new Error('view changed');
    expect(view.showFieldIds).toEqual(['location', 'reflection', 'mood', 'next_experiment']);
    expect(result.changes).toEqual(['Add “Next experiment” (long text). Existing walks keep their data; this field starts empty for them.']);

    const log = applied(applyRevision(tracker(), [NEXT_EXPERIMENT])).views.find((v) => v.id === 'log');
    if (log?.type !== 'list') throw new Error('list view missing');
    expect(log.columnFieldIds).toEqual(['date', 'minutes', 'quality', 'next_experiment']);
  });

  it('leaves a journal that shows all fields implicitly alone (no showFieldIds invented)', () => {
    const spec = applied(applyRevision(journal(), [NEXT_EXPERIMENT]));
    const view = spec.views[0];
    if (view?.type !== 'journal') throw new Error('view changed');
    expect(view.showFieldIds).toBeUndefined();
  });

  it('places the field right after afterFieldId, or at the end when that id is unknown', () => {
    const after = applied(applyRevision(journal(), [{ ...NEXT_EXPERIMENT, afterFieldId: 'subject' }]));
    const ids = after.fields.map((f) => f.id);
    expect(ids.indexOf('next_experiment')).toBe(ids.indexOf('subject') + 1);

    const unknown = applied(applyRevision(journal(), [{ ...NEXT_EXPERIMENT, afterFieldId: 'ghost' }]));
    expect(unknown.fields.at(-1)?.id).toBe('next_experiment');
  });

  it('refuses a duplicate id instead of overwriting the existing field', () => {
    const errors = refused(applyRevision(journal(), [{ op: 'add_field', field: { id: 'subject', label: 'Subject again', type: 'text' } }]));
    expect(errors).toEqual(['A field with id "subject" already exists']);
  });

  it('does not mutate the current spec (the preview is safe to show before accepting)', () => {
    const current = journalWithShowFields();
    const snapshot = structuredClone(current);
    applyRevision(current, [NEXT_EXPERIMENT, { op: 'hide_field', fieldId: 'location' }, { op: 'rename_app', name: 'Renamed' }]);
    expect(current).toEqual(snapshot);
  });
});

describe('changing a field', () => {
  it('update_field renames the label but keeps the id (saved values stay attached)', () => {
    const result = applyRevision(journal(), [{ op: 'update_field', fieldId: 'subject', patch: { label: 'Subject', required: false } }]);
    const spec = applied(result);
    const subject = spec.fields.find((f) => f.id === 'subject');
    expect(subject).toMatchObject({ id: 'subject', label: 'Subject', type: 'text', required: false });
    expect(result.changes).toEqual(['Rename “What caught your eye?” to “Subject”.']);
  });

  it('update_field without a label change says "Update"', () => {
    const result = applyRevision(journal(), [{ op: 'update_field', fieldId: 'location', patch: { help: 'Street or park is enough' } }]);
    expect(applied(result).fields.find((f) => f.id === 'location')?.help).toBe('Street or park is enough');
    expect(result.changes).toEqual(['Update “Where”.']);
  });

  it('refuses to update an unknown field', () => {
    expect(refused(applyRevision(journal(), [{ op: 'update_field', fieldId: 'ghost', patch: { label: 'x' } }]))).toEqual(['Unknown field "ghost"']);
  });
});

describe('hiding and showing a field', () => {
  it('hide_field keeps the field (hidden, no longer required) and drops it from every view list', () => {
    const spec = journalWithShowFields();
    const result = applyRevision(spec, [{ op: 'hide_field', fieldId: 'location' }]);
    const next = applied(result);
    const location = next.fields.find((f) => f.id === 'location');
    expect(location).toMatchObject({ id: 'location', hidden: true, required: false });
    const view = next.views[0];
    if (view?.type !== 'journal') throw new Error('view changed');
    expect(view.showFieldIds).toEqual(['reflection', 'mood']);
    expect(result.changes).toEqual(['Hide “Where”. Saved values are kept and can be restored later.']);
  });

  it('hiding removes the field from list columns and board cards too', () => {
    const list = applied(applyRevision(tracker(), [{ op: 'hide_field', fieldId: 'quality' }])).views.find((v) => v.id === 'log');
    if (list?.type !== 'list') throw new Error('list view missing');
    expect(list.columnFieldIds).toEqual(['date', 'minutes']);

    const b = applied(applyRevision(board(), [{ op: 'hide_field', fieldId: 'commitment' }])).views.find((v) => v.id === 'board');
    if (b?.type !== 'board') throw new Error('board view missing');
    expect(b.cardFieldIds).toEqual(['due']);
  });

  it('hiding an already hidden field changes nothing', () => {
    const once = applied(applyRevision(journal(), [{ op: 'hide_field', fieldId: 'location' }]));
    const twice = applyRevision(once, [{ op: 'hide_field', fieldId: 'location' }]);
    expect(applied(twice)).toEqual(once);
    expect(twice.changes).toEqual([]);
  });

  it('unhide_field brings it back into the journal view', () => {
    const hidden = applied(applyRevision(journalWithShowFields(), [{ op: 'hide_field', fieldId: 'location' }]));
    const result = applyRevision(hidden, [{ op: 'unhide_field', fieldId: 'location' }]);
    const shown = applied(result);
    expect(shown.fields.find((f) => f.id === 'location')?.hidden).toBe(false);
    const view = shown.views[0];
    if (view?.type !== 'journal') throw new Error('view changed');
    expect(view.showFieldIds).toEqual(['reflection', 'mood', 'location']);
    expect(result.changes).toEqual(['Show “Where” again.']);
  });

  it('a required field that was hidden cannot block saving (required is cleared)', () => {
    const base = applied(applyRevision(journal(), [{ op: 'add_field', field: { id: 'weather', label: 'Weather', type: 'text', required: true } }]));
    const spec = applied(applyRevision(base, [{ op: 'hide_field', fieldId: 'weather' }]));
    expect(spec.fields.find((f) => f.id === 'weather')?.required).toBe(false);
  });

  it('refuses to hide a field a view is built around, with the reason', () => {
    // The journal's title field and the board's person are what those views show; hiding them would break the app.
    const titled = applyRevision(journal(), [{ op: 'hide_field', fieldId: 'subject' }]);
    expect(titled.ok).toBe(false);
    expect(titled.errors.join(' ')).toMatch(/built around/);
    const person = applyRevision(board(), [{ op: 'hide_field', fieldId: 'person' }]);
    expect(person.ok).toBe(false);
  });
});

describe('choice options', () => {
  it('add_select_option appends a new option and ignores one that already exists', () => {
    const added = applyRevision(journal(), [{ op: 'add_select_option', fieldId: 'mood', option: { value: 'tired', label: 'Tired' } }]);
    const mood = applied(added).fields.find((f) => f.id === 'mood');
    if (mood?.type !== 'select') throw new Error('mood is not a choice field');
    expect(mood.options.map((o) => o.value)).toEqual(['calm', 'curious', 'rushed', 'inspired', 'tired']);
    expect(added.changes).toEqual(['Add option “Tired” to “How did it feel?”.']);

    const again = applyRevision(journal(), [{ op: 'add_select_option', fieldId: 'mood', option: { value: 'calm', label: 'Calm again' } }]);
    const unchanged = applied(again).fields.find((f) => f.id === 'mood');
    if (unchanged?.type !== 'select') throw new Error('mood is not a choice field');
    expect(unchanged.options).toHaveLength(4);
    expect(again.changes).toEqual([]);
  });

  it('refuses to add an option to a field that is not a choice', () => {
    expect(refused(applyRevision(journal(), [{ op: 'add_select_option', fieldId: 'subject', option: { value: 'x', label: 'X' } }]))).toEqual(['"subject" is not a choice field']);
  });
});

describe('app-level changes', () => {
  it('rename_app changes the name (and tagline when given)', () => {
    const result = applyRevision(journal(), [{ op: 'rename_app', name: 'Evening Walks', tagline: 'Light after work' }]);
    expect(applied(result)).toMatchObject({ name: 'Evening Walks', tagline: 'Light after work' });
    expect(result.changes).toEqual(['Rename the app from “Photo Walk Journal” to “Evening Walks”.']);

    const taglineOnly = applyRevision(journal(), [{ op: 'rename_app', name: 'Photo Walk Journal', tagline: 'New tagline' }]);
    expect(taglineOnly.changes).toEqual(['Update the tagline.']);
  });

  it('set_icon, set_entry_noun and set_empty_state_hint', () => {
    const result = applyRevision(journal(), [
      { op: 'set_icon', icon: { symbol: 'sun', color: 'mustard' } },
      { op: 'set_entry_noun', singular: 'outing', plural: 'outings' },
      { op: 'set_empty_state_hint', hint: 'Start with the walk to the shop.' },
    ]);
    const spec = applied(result);
    expect(spec.icon).toEqual({ symbol: 'sun', color: 'mustard' });
    expect(spec.entryNoun).toEqual({ singular: 'outing', plural: 'outings' });
    expect(spec.emptyStateHint).toBe('Start with the walk to the shop.');
    expect(result.changes).toEqual(['Change the app icon.', 'Call items “outings”.', 'Update the empty-state hint.']);
  });
});

describe('rules', () => {
  const dueRule: RevisionOp = { op: 'add_rule', rule: { id: 'due_soon', type: 'due_soon', dateFieldId: 'date', withinDays: 3, doneFieldId: 'keeper' } };

  it('add_rule adds a due-soon rule and describes it in plain words', () => {
    const result = applyRevision(journal(), [dueRule]);
    const spec = applied(result);
    expect(spec.rules.map((r) => r.id)).toEqual(['weekly_challenge', 'due_soon']);
    expect(result.changes).toEqual(['Highlight items due within 3 days and anything overdue.']);

    const oneDay = applyRevision(journal(), [{ op: 'add_rule', rule: { id: 'd', type: 'due_soon', dateFieldId: 'date', withinDays: 1 } }]);
    expect(oneDay.changes).toEqual(['Highlight items due within 1 day and anything overdue.']);

    const prompts = applyRevision(board(), [{ op: 'add_rule', rule: { id: 'nudge', type: 'prompt_rotation', cadence: 'weekly', title: 'This week', prompts: ['Reconnect with one person', 'Thank someone'] } }]);
    expect(prompts.changes).toEqual(['Add a rotating weekly prompt (2 prompts).']);
  });

  it('refuses a rule id that already exists', () => {
    expect(refused(applyRevision(board(), [{ op: 'add_rule', rule: { id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 7 } }]))).toEqual(['Rule "due_soon" already exists']);
  });

  it('replace_rule swaps the rule in place; remove_rule drops it; removing an unknown rule is a quiet no-op', () => {
    const replaced = applyRevision(board(), [{ op: 'replace_rule', ruleId: 'due_soon', rule: { id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 7, stageFieldId: 'stage', doneStageValues: ['done'] } }]);
    const rule = applied(replaced).rules[0];
    expect(rule?.type === 'due_soon' ? rule.withinDays : null).toBe(7);
    expect(replaced.changes).toEqual(['Change the due-soon window to 7 days.']);
    expect(refused(applyRevision(board(), [{ op: 'replace_rule', ruleId: 'ghost', rule: { id: 'ghost', type: 'due_soon', dateFieldId: 'due', withinDays: 1 } }]))).toEqual(['Unknown rule "ghost"']);

    const removed = applyRevision(board(), [{ op: 'remove_rule', ruleId: 'due_soon' }]);
    expect(applied(removed).rules).toEqual([]);
    expect(removed.changes).toEqual(['Remove a rule.']);

    const noop = applyRevision(board(), [{ op: 'remove_rule', ruleId: 'ghost' }]);
    expect(applied(noop).rules).toHaveLength(1);
    expect(noop.changes).toEqual([]);
  });
});

describe('views', () => {
  it('remove_view refuses to remove the last view', () => {
    const single = journal();
    single.views = [single.views[0]!];
    expect(refused(applyRevision(single, [{ op: 'remove_view', viewId: 'entries' }]))).toEqual(['An app needs at least one view']);
  });

  it('remove_view removes one of several views', () => {
    const result = applyRevision(journal(), [{ op: 'remove_view', viewId: 'stats' }]);
    expect(applied(result).views.map((v) => v.id)).toEqual(['entries']);
    expect(result.changes).toEqual(['Remove a view.']);
  });

  it('add_view and replace_view', () => {
    const added = applyRevision(journal(), [{ op: 'add_view', view: { id: 'all', type: 'list', title: 'All walks', titleFieldId: 'subject', sortDir: 'desc' } }]);
    expect(applied(added).views.map((v) => v.id)).toEqual(['entries', 'stats', 'all']);
    expect(added.changes).toEqual(['Add a list view “All walks”.']);
    expect(refused(applyRevision(journal(), [{ op: 'add_view', view: { id: 'stats', type: 'list', titleFieldId: 'subject', sortDir: 'desc' } }]))).toEqual(['View "stats" already exists']);

    const replaced = applyRevision(journal(), [{ op: 'replace_view', viewId: 'stats', view: { id: 'stats', type: 'list', titleFieldId: 'subject', sortDir: 'asc' } }]);
    expect(applied(replaced).views[1]?.type).toBe('list');
    expect(replaced.changes).toEqual(['Update the list view.']);
    expect(refused(applyRevision(journal(), [{ op: 'replace_view', viewId: 'ghost', view: { id: 'ghost', type: 'list', titleFieldId: 'subject', sortDir: 'asc' } }]))).toEqual(['Unknown view "ghost"']);
  });
});

describe('the result is always a valid app', () => {
  it('a view that references the wrong kind of field is refused with the path to the problem', () => {
    const errors = refused(applyRevision(journal(), [{ op: 'add_view', view: { id: 'kanban', type: 'board', stageFieldId: 'subject', titleFieldId: 'subject', doneStageValues: [] } }]));
    expect(errors).toContain('views.2.stageFieldId: Field "subject" must be select');
  });

  it('a rule that references an unknown field is refused', () => {
    const errors = refused(applyRevision(journal(), [{ op: 'add_rule', rule: { id: 'd', type: 'due_soon', dateFieldId: 'deadline', withinDays: 3 } }]));
    expect(errors).toContain('rules.1.dateFieldId: Unknown field "deadline"');
  });

  it('reports a structural error without a spec, keeping earlier change lines for context', () => {
    const result = applyRevision(journal(), [NEXT_EXPERIMENT, { op: 'hide_field', fieldId: 'ghost' }]);
    expect(result.ok).toBe(false);
    expect(result.spec).toBeUndefined();
    expect(result.errors).toEqual(['Unknown field "ghost"']);
    expect(result.changes).toHaveLength(1);
  });
});

describe('change preview sentences', () => {
  it('every change is a full sentence in plain words, without raw field ids', () => {
    const result = applyRevision(journalWithShowFields(), [
      NEXT_EXPERIMENT,
      { op: 'update_field', fieldId: 'subject', patch: { label: 'Subject' } },
      { op: 'hide_field', fieldId: 'location' },
      { op: 'add_select_option', fieldId: 'mood', option: { value: 'tired', label: 'Tired' } },
      { op: 'rename_app', name: 'Evening Walks' },
      { op: 'remove_view', viewId: 'stats' },
    ]);
    applied(result);
    expect(result.changes).toHaveLength(6);
    for (const line of result.changes) {
      expect(line).toMatch(/^[A-Z].*\.$/);
      expect(line).not.toMatch(/undefined|\[object|next_experiment|location/);
    }
  });
});

describe('fieldsTouched', () => {
  it('lists each field a set of ops touches once, in order', () => {
    const ops: RevisionOp[] = [
      NEXT_EXPERIMENT,
      { op: 'update_field', fieldId: 'subject', patch: { label: 'Subject' } },
      { op: 'hide_field', fieldId: 'location' },
      { op: 'unhide_field', fieldId: 'subject' },
      { op: 'rename_app', name: 'x' },
    ];
    expect(fieldsTouched(ops)).toEqual(['next_experiment', 'subject', 'location']);
    expect(fieldsTouched([])).toEqual([]);
  });
});

describe('RevisionOpSchema', () => {
  it('accepts every op used above and refuses unknown ops or malformed fields', () => {
    expect(RevisionOpSchema.safeParse(NEXT_EXPERIMENT).success).toBe(true);
    expect(RevisionOpSchema.safeParse({ op: 'delete_everything' }).success).toBe(false);
    expect(RevisionOpSchema.safeParse({ op: 'add_field', field: { id: 'Bad Id', label: 'x', type: 'text' } }).success).toBe(false);
    expect(RevisionOpSchema.safeParse({ op: 'add_field', field: { id: 'ok', label: 'x', type: 'emoji' } }).success).toBe(false);
    expect(RevisionOpSchema.safeParse({ op: 'rename_app', name: '' }).success).toBe(false);
  });
});
