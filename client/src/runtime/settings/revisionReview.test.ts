/**
 * Edit with Ori's review: what a proposed change says before anything happens (future tense, before →
 * after for defaults), when "Keep your photos and notes" may be said, what the toast says after Apply,
 * which screen the preview shows, and that the example chips are changes Ori can actually preview.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { RevisionPreviewDto } from '@shared/api.ts';
import { AppSpecSchema, type AppSpec } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { applyRevision, type RevisionOp } from '@shared/revision.ts';
import { FIXTURES } from '../../../../server/fixtures/specs.ts';
import { proposeRevision } from '../../../../server/model/sample/revise.ts';
import type { OriMoodHandle } from '../../components/ori/useOriMood.ts';
import type { AppDetailDto } from '@shared/api.ts';
import { ApiError } from '../../api.ts';
import {
  appliedMessage,
  changeFocus,
  checkLostApply,
  describeRevision,
  editExamples,
  keepsEveryEntry,
  keptWhat,
  latestEntry,
  listOf,
  RevisionReview,
  revisionErrorText,
  UNCONFIRMED_APPLY,
  type RevisionFlow,
} from './ReviseSection.tsx';

const spec = (key: string): AppSpec => AppSpecSchema.parse(FIXTURES[key]);
const light = spec('light-gallery');
const riff = spec('riff-practice');
const people = spec('people-queue');

const applied = (base: AppSpec, ops: RevisionOp[]): AppSpec => {
  const r = applyRevision(base, ops);
  if (!r.ok || !r.spec) throw new Error(r.errors.join('; '));
  return r.spec;
};

const rec = (id: string, values: Record<string, unknown>, createdAt: string): AppRecord => ({ id, appId: 'app_00000001', values, createdAt, updatedAt: createdAt });

const cameraOps: RevisionOp[] = [
  { op: 'add_field', field: { id: 'camera', label: 'Camera', type: 'text' } },
  { op: 'add_field', field: { id: 'shutter', label: 'Shutter', type: 'text' } },
  { op: 'add_field', field: { id: 'aperture', label: 'Aperture', type: 'text' } },
];
const lightWithCamera = applied(light, cameraOps);

const photos = [
  rec('rec_00000001', { date: '2026-11-10', photo: 'media_000001', caption: 'Long shadows across the tram tracks', note: 'Harsh light.' }, '2026-11-10T09:00:00.000Z'),
  rec('rec_00000002', { date: '2026-11-13', photo: 'media_000002', caption: 'Waited for the light.' }, '2026-11-13T18:00:00.000Z'),
  rec('rec_00000003', { date: '2026-11-14', caption: 'A note without a photo' }, '2026-11-14T08:00:00.000Z'),
];

const practiceOps = (presets: number[]): RevisionOp[] => {
  const view = riff.views.find((v) => v.type === 'practice')!;
  return [{ op: 'replace_view', viewId: view.id, view: { ...view, presets } as never }];
};

describe('describeRevision', () => {
  it('says added fields in future tense, for each entry, and points the preview at them', () => {
    const model = describeRevision(light, lightWithCamera);
    expect(model.checklist[0]).toBe('“Camera”, “Shutter” and “Aperture” will be added to each photo.');
    expect(model.newFieldIds).toEqual(['camera', 'shutter', 'aperture']);
    expect(model.beforeAfter).toEqual([]);
    // Nothing is described as done before Apply.
    for (const line of model.checklist) expect(line).not.toMatch(/\b(added|changed|updated)\.$/i);
  });

  it('shows a changed default as before → after (audit P1-02)', () => {
    const model = describeRevision(riff, applied(riff, practiceOps([10, 15, 25])));
    expect(model.beforeAfter).toContainEqual({ label: 'Default session', before: '15 min', after: '10 min' });
    expect(model.checklist).toContain('Sessions will start at 10 minutes.');
  });

  it('describes a due-soon window, a rename, a new look and a hidden field', () => {
    const rule = people.rules.find((r) => r.type === 'due_soon')!;
    const window = describeRevision(people, applied(people, [{ op: 'replace_rule', ruleId: rule.id, rule: { ...rule, withinDays: 5 } as never }]));
    expect(window.beforeAfter).toContainEqual({ label: 'Due soon', before: 'within 3 days', after: 'within 5 days' });
    expect(window.checklist).toContain('Anything due within 5 days will be highlighted.');

    const renamed = describeRevision(light, applied(light, [{ op: 'rename_app', name: 'Lumen' }]));
    expect(renamed.beforeAfter).toContainEqual({ label: 'Name', before: 'Light', after: 'Lumen' });

    const darker = describeRevision(light, applied(light, [{ op: 'set_design', design: { theme: 'charcoal' } }]));
    expect(darker.beforeAfter).toContainEqual({ label: 'Look', before: 'Paper', after: 'Charcoal' });
    expect(darker.checklist).toContain('The look will change.');

    const hidden = describeRevision(light, applied(light, [{ op: 'hide_field', fieldId: 'location' }]));
    expect(hidden.hiddenFieldIds).toEqual(['location']);
    expect(hidden.checklist).toContain('“Where” will be hidden. What you saved in it stays.');

    const sheet = light.views.find((v) => v.type === 'gallery')!;
    const button = describeRevision(light, applied(light, [{ op: 'replace_view', viewId: sheet.id, view: { ...sheet, addLabel: 'Add a frame' } as never }]));
    expect(button.beforeAfter).toContainEqual({ label: 'Button', before: 'Add photo', after: 'Add a frame' });
    expect(button.checklist).toEqual(['The button will read “Add a frame”.']);
  });

  it('lists names naturally', () => {
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('what a change keeps, and what the toast says', () => {
  it('keeps every entry when fields are only added', () => {
    expect(keepsEveryEntry(light, lightWithCamera, photos)).toBe(true);
    expect(keptWhat(light)).toBe('photos and notes');
    expect(appliedMessage({ alreadyApplied: false, before: light, after: lightWithCamera, records: photos })).toBe('Updated. Existing photos and notes kept.');
  });

  it('does not claim to keep everything when a field holding values is hidden', () => {
    const withWhere = [...photos, rec('rec_00000004', { photo: 'media_000004', location: 'By the station' }, '2026-11-12T09:00:00.000Z')];
    const hid = applied(light, [{ op: 'hide_field', fieldId: 'location' }]);
    expect(keepsEveryEntry(light, hid, withWhere)).toBe(false);
    expect(appliedMessage({ alreadyApplied: false, before: light, after: hid, records: withWhere })).toBe('Updated. “Where” is hidden; what you saved in it is kept.');
    // Hiding a field nobody filled in keeps everything that was saved.
    expect(keepsEveryEntry(light, hid, photos)).toBe(true);
  });

  it('says only "Updated." when there is nothing to keep, and never offers a second apply as new', () => {
    expect(appliedMessage({ alreadyApplied: false, before: light, after: lightWithCamera, records: [] })).toBe('Updated.');
    expect(appliedMessage({ alreadyApplied: true, before: light, after: lightWithCamera, records: photos })).toBe('That change was already applied. Undo is in History.');
  });

  it('names what each app keeps in its own words', () => {
    expect(keptWhat(riff)).toBe('sessions and notes');
    expect(keptWhat(people)).toBe('follow-ups and notes');
  });
});

describe('the affected screen', () => {
  it('focuses a field change on the form it lands in, with the latest entry that has a photo', () => {
    const focus = changeFocus(lightWithCamera, describeRevision(light, lightWithCamera), photos);
    expect(focus.mode).toBe('record');
    if (focus.mode !== 'record') return;
    expect(focus.view.type).toBe('gallery');
    expect(focus.fieldIds).toEqual(['camera', 'shutter', 'aperture']);
    expect(focus.record?.id).toBe('rec_00000002');
  });

  it('uses no entry (a labelled example) when the app has none, and the whole app for a timer default', () => {
    const empty = changeFocus(lightWithCamera, describeRevision(light, lightWithCamera), []);
    expect(empty.mode === 'record' && empty.record).toBe(null);
    const timer = applied(riff, practiceOps([10, 15, 25]));
    expect(changeFocus(timer, describeRevision(riff, timer), []).mode).toBe('app');
  });

  it('shows a hidden field on the entry it leaves, not the whole gallery (reviewer finding 9)', () => {
    const hid = applied(light, [{ op: 'hide_field', fieldId: 'location' }]);
    const model = describeRevision(light, hid);
    const focus = changeFocus(hid, model, photos, light);
    expect(focus.mode).toBe('record');
    if (focus.mode !== 'record') return;
    expect(focus.view.type).toBe('gallery');
    expect(focus.fieldIds).toEqual([]);
    expect(focus.hiddenIds).toEqual(['location']);
    expect(focus.record?.id).toBe('rec_00000002');
    // Without the current definition the hidden field cannot be placed, so the whole app is shown.
    expect(changeFocus(hid, model, photos).mode).toBe('app');
  });

  it('picks the newest entry of the view it belongs to', () => {
    const view = riff.views.find((v) => v.type === 'practice')!;
    const mixed = [
      rec('rec_s1', { kind: 'session', focus: 'Older' }, '2026-11-10T09:00:00.000Z'),
      rec('rec_x1', { kind: 'source', title: 'Newest, but a source' }, '2026-11-14T09:00:00.000Z'),
      rec('rec_s2', { kind: 'session', focus: 'Newer' }, '2026-11-12T09:00:00.000Z'),
    ];
    expect(latestEntry(view, mixed)?.id).toBe('rec_s2');
  });
});

describe('example changes', () => {
  it('offers outcome examples for each kind of app, at most three', () => {
    expect(editExamples(light)).toEqual(['Add camera settings to my photo notes', 'Add a field for the lens', 'Make it darker']);
    expect(editExamples(riff)).toEqual(['Make my sessions shorter: 10 minutes', 'Set the metronome to 60 bpm', 'Add a field for which song']);
    // People keeps its white-and-orange identity: a useful field instead of a darker look.
    expect(editExamples(people)).toEqual(['Add a field for how we met', 'Highlight anything due within 5 days', 'Add a field for the company']);
    for (const key of Object.keys(FIXTURES)) expect(editExamples(spec(key)).length).toBeLessThanOrEqual(3);
  });

  it('only offers examples Ori can preview (Sample mode planner)', () => {
    for (const key of Object.keys(FIXTURES)) {
      const s = spec(key);
      for (const request of editExamples(s)) {
        const plan = proposeRevision({ spec: s, request, sampleRecords: [] });
        expect(plan.ops.length, `${key}: "${request}" maps to a change`).toBeGreaterThan(0);
        expect(applyRevision(s, plan.ops).ok).toBe(true);
      }
    }
  });
});

describe('RevisionReview', () => {
  const ori: OriMoodHandle = {
    mood: 'discovery', settled: true, phase: 'discovery', pendingKind: null, companion: { mood: 'discovery', motion: 'none' },
    begin: () => 1, succeed: () => undefined, fail: () => undefined, clarify: () => undefined, discover: () => undefined, cancel: () => undefined,
    isCurrent: () => false, focus: () => undefined, typing: () => undefined, blur: () => undefined, reset: () => undefined,
  };
  const flowWith = (base: AppSpec, ops: RevisionOp[], extra: Partial<RevisionPreviewDto> = {}): RevisionFlow => {
    const dry = applyRevision(base, ops);
    const preview: RevisionPreviewDto = { proposalId: 'prop_0001', summary: 'Proposed', changes: dry.changes, ops, unsupported: [], previewSpec: dry.spec!, generatedBy: 'sample', baseVersion: 1, ...extra };
    const noop = async () => undefined;
    return { request: 'x', setRequest: () => undefined, preview, busy: null, error: null, runPreview: noop, apply: noop, keepCurrent: () => undefined, rephrase: () => undefined, abandon: () => undefined };
  };
  const render = (base: AppSpec, ops: RevisionOp[], records: AppRecord[], extra?: Partial<RevisionPreviewDto>) =>
    renderToString(createElement(MemoryRouter, null, createElement(RevisionReview, { flow: flowWith(base, ops, extra), spec: base, records, ori, onKeep: () => undefined, onRephrase: () => undefined })));

  it('shows the checklist, what is kept, the affected entry with the new fields, and both decisions', () => {
    const html = render(light, cameraOps, photos);
    expect(html).toContain('Here’s the change');
    expect(html).toContain('will be added to each photo.');
    expect(html).toContain('Keep your photos and notes');
    expect(html).toContain('data-testid="rt-change-preview"');
    expect(html).toContain('data-testid="rt-input-camera"');
    expect(html).toContain('Waited for the light.');
    expect(html).toContain('Your latest photo, with the change. Nothing is saved.');
    expect(html).toContain('Apply change');
    expect(html).toContain('Keep current version');
    expect(html).toContain('Sample mode');
  });

  it('labels an example entry and leaves out "Keep your …" when there is nothing to keep', () => {
    const html = render(light, cameraOps, []);
    expect(html).toContain('An example photo, not yours. Nothing is saved.');
    expect(html).not.toContain('Keep your photos and notes');
  });

  it('shows the before → after of a timer default and the proposed app itself', () => {
    const html = render(riff, practiceOps([10, 15, 25]), []);
    expect(html).toContain('Default session');
    expect(html).toContain('15 min');
    expect(html).toContain('10 min');
    expect(html).toContain('data-testid="make-preview"');
  });

  it('previews a hidden field on the latest entry, saying what was saved in it is kept', () => {
    const withWhere = [rec('rec_00000009', { date: '2026-11-14', photo: 'media_000009', caption: 'By the canal', location: 'By the station' }, '2026-11-14T09:00:00.000Z'), ...photos];
    const html = render(light, [{ op: 'hide_field', fieldId: 'location' }], withWhere);
    expect(html).toContain('data-testid="rt-change-preview"');
    expect(html).toContain('data-testid="rt-change-hidden"');
    expect(html).toContain('By the canal');
    expect(html).toContain('Hidden. “By the station” is kept.');
    expect(html).toContain('Hidden field');
    // Not the whole contact sheet with its weekly prompt.
    expect(html).not.toContain('data-testid="make-preview"');
  });

  it('reads a before → after line as "becomes", with the arrow hidden from screen readers', () => {
    const html = render(riff, practiceOps([10, 15, 25]), []);
    expect(html).toContain('<span class="ori-ba-arrow" aria-hidden="true">→</span><span class="sr-only"> becomes </span>');
    expect(html).not.toContain('aria-label="becomes"');
  });

  it('says the app is unchanged after a failed apply only when Ori answered', () => {
    const renderWith = (error: RevisionFlow['error']) =>
      renderToString(createElement(MemoryRouter, null, createElement(RevisionReview, { flow: { ...flowWith(light, cameraOps), error }, spec: light, records: photos, ori, onKeep: () => undefined, onRephrase: () => undefined })));
    const refused = renderWith({ message: 'Something went wrong on our side.', code: 'internal', during: 'apply', unchanged: true });
    expect(refused).toContain('Something went wrong on our side. Light is unchanged.');
    const lost = renderWith({ message: UNCONFIRMED_APPLY, code: 'unconfirmed', during: 'apply' });
    expect(lost).toContain('We couldn’t confirm the change. Try again; it won’t be applied twice.');
    expect(lost).not.toContain('is unchanged');
    expect(lost).toContain('data-testid="rt-revise-retry"');
  });

  it('offers to change the request, not to apply, when nothing would change', () => {
    const html = render(light, [], photos, { unsupported: [{ request: 'x', reason: 'That is not a change I know how to make yet.', alternative: 'Try adding a field.' }] });
    expect(html).toContain('Nothing to change yet');
    expect(html).toContain('Change the request');
    expect(html).not.toContain('rt-revise-accept');
  });
});

describe('an apply whose answer was lost (reviewer finding 4)', () => {
  const body = { ops: cameraOps, summary: 'Add camera settings', baseVersion: 11, proposalId: 'prop_0001' };
  const at = (version: number, s: AppSpec): AppDetailDto => ({
    app: {} as AppDetailDto['app'],
    spec: s,
    version,
    canUndo: true,
  });
  const never = () => Promise.reject(new Error('should not be sent again'));

  it('is "not applied" when the app is still at the preview’s version (nothing is sent again)', async () => {
    const out = await checkLostApply('app_00000001', body, lightWithCamera, { read: async () => at(11, light), resend: never });
    expect(out.state).toBe('not_applied');
  });

  it('is "applied" when the app is one version on with exactly the previewed definition', async () => {
    const out = await checkLostApply('app_00000001', body, lightWithCamera, { read: async () => at(12, lightWithCamera), resend: never });
    expect(out.state).toBe('applied');
    if (out.state === 'applied') expect(out.res.version).toBe(12);
  });

  it('otherwise sends the same apply again: Ori answers "already applied" instead of applying twice', async () => {
    let sent = 0;
    const resend = async () => {
      sent++;
      return { ...at(12, lightWithCamera), changes: [], alreadyApplied: true };
    };
    const out = await checkLostApply('app_00000001', body, lightWithCamera, { read: async () => null, resend });
    expect(sent).toBe(1);
    expect(out.state).toBe('applied');
  });

  it('is "unknown" when neither the app nor the apply can be reached, and stale when another change came first', async () => {
    const offline = () => Promise.reject(new ApiError(0, 'You appear to be offline.', 'network'));
    expect((await checkLostApply('app_00000001', body, lightWithCamera, { read: async () => null, resend: offline })).state).toBe('unknown');
    // A server error says nothing about the earlier try either.
    const broken = () => Promise.reject(new ApiError(500, 'Something went wrong on our side.', 'internal'));
    expect((await checkLostApply('app_00000001', body, lightWithCamera, { read: async () => at(13, light), resend: broken })).state).toBe('unknown');
    const stale = () => Promise.reject(new ApiError(409, 'The app changed since this preview was made.', 'stale_preview'));
    await expect(checkLostApply('app_00000001', body, lightWithCamera, { read: async () => at(13, light), resend: stale })).rejects.toMatchObject({ code: 'stale_preview' });
  });

  it('only says "<App> is unchanged" when that is known', () => {
    expect(revisionErrorText({ message: 'Something went wrong on our side.', unchanged: true }, 'Light')).toBe('Something went wrong on our side. Light is unchanged.');
    expect(revisionErrorText({ message: UNCONFIRMED_APPLY }, 'Light')).toBe(UNCONFIRMED_APPLY);
  });
});
