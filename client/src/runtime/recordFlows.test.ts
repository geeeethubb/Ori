/**
 * Record flows that must not lose or revert anyone's data: form drafts (an edit keeps only what the
 * person changed, a new entry keeps its id), retried creates, the queue's Undo, rolling back failed
 * edits, and the example flag on Agent shares. The components call these helpers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppSpecSchema, formFieldsFor, type AppSpecInput } from '@shared/appSpec.ts';
import { FIELD_ID_PATTERN, SHORT_ID_PATTERN } from '@shared/ids.ts';
import { validateValues, type AppRecord, type RecordValues } from '@shared/records.ts';
import { FOLLOW_UP_BOARD, PEOPLE_QUEUE } from '../../../server/fixtures/specs.ts';
import { ApiError } from '../api.ts';
import { isUnchangedExample } from '../pages/AgentPage.tsx';
import { saveMessageDraft, undoPatch } from './QueueView.tsx';
import { editDraftKey, newRecordBase, shownChanges, splitEditDraft } from './RecordForm.tsx';
import { afterConflict, createdMessage, createEntry, SAVED_AS_NEW } from './RecordSheet.tsx';
import { changedValues, draftFor, draftKey, keepUntouched, openForm, parseDraft, readJson, serializeDraft, writeDraft } from './runtimeUtils.ts';
import { revertKeys, upsertRecord } from './useAppData.ts';
import { completionPatch, type QueueViewSpec } from './viewLogic.ts';

const rec = (id: string, values: Record<string, unknown>, updatedAt = '2026-11-14T10:00:00.000Z'): AppRecord => ({
  id,
  appId: 'app_00000001',
  values,
  createdAt: '2026-11-14T09:00:00.000Z',
  updatedAt,
});
let minted = 0;
const mint = () => 'minted_' + String(++minted).padStart(8, '0');
/** A stored draft as it comes back from localStorage. */
const stored = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
const marker = Object.keys(serializeDraft({ values: {} })).find((k) => k !== 'values' && k !== 'id')!;

describe('edit drafts keep only what the person changed (finding 30)', () => {
  const opened = { person: 'Maya', action: 'Send the deck', done: false };

  it('stores the changed keys, never the untouched ones', () => {
    expect(draftFor({ ...opened, action: 'Send the deck and the pricing' }, { editing: opened })).toEqual({ values: { action: 'Send the deck and the pricing' } });
    expect(draftFor(opened, { editing: opened })).toBeNull();
  });

  it('after another device marks it done, reopening keeps Done and the save sends only the action', () => {
    const draft = stored(serializeDraft(draftFor({ ...opened, action: 'Send the deck and the pricing' }, { editing: opened })!));
    const latest = { ...opened, done: true };
    const form = openForm(latest, draft, { editing: true, mint });
    expect(form.restored).toBe(true);
    expect(form.values).toEqual({ person: 'Maya', action: 'Send the deck and the pricing', done: true });
    expect(changedValues(latest, form.values)).toEqual({ action: 'Send the deck and the pricing' });
    expect(form.id).toBeUndefined();
  });

  it('one device: type, cancel, tick Done, reopen and save keeps Done', () => {
    const before = { person: 'Sam', action: 'Book the room', done: false };
    const draft = stored(serializeDraft(draftFor({ ...before, action: 'Book the big room' }, { editing: before })!));
    const afterDone = { ...before, done: true };
    const form = openForm(afterDone, draft, { editing: true, mint });
    expect(changedValues(afterDone, form.values)).toEqual({ action: 'Book the big room' });
  });

  it('an edit draft from an older build (the whole values map) is never restored', () => {
    const old = { person: 'Maya', action: 'Send the deck and the pricing', done: false };
    expect(parseDraft(old, true)).toBeNull();
    const latest = { person: 'Maya', action: 'Send the deck', done: true };
    expect(openForm(latest, old, { editing: true, mint })).toMatchObject({ restored: false, spent: true, values: latest });
  });

  it('a draft whose change is already saved is spent and changes nothing', () => {
    const latest = { person: 'Maya', action: 'Send the deck today', done: false };
    const draft = stored(serializeDraft({ values: { action: 'Send the deck today' } }));
    expect(openForm(latest, draft, { editing: true, mint })).toMatchObject({ restored: false, spent: true, values: latest });
  });

  it('marks its format with a key no field id can take, and ignores formats it does not know', () => {
    expect(FIELD_ID_PATTERN.test(marker)).toBe(false);
    expect(parseDraft({ ...serializeDraft({ values: { action: 'x' } }), [marker]: 99 }, true)).toBeNull();
    // Fields may be called "id" or "values": an older plain draft with them is still read as values.
    expect(parseDraft({ id: 'A-12', values: 'x' }, false)).toEqual({ values: { id: 'A-12', values: 'x' } });
  });
});

describe('a new entry keeps its id with its draft (finding 33)', () => {
  const defaults = { person: '', action: '', done: false };

  it('reopening after a lost response restores the draft under the same id', () => {
    const first = openForm(defaults, null, { editing: false, mint });
    const typed = { ...defaults, person: 'Maya', action: 'Send the deck' };
    // Submitting marks the draft as sent before the request goes out.
    const again = openForm(defaults, stored(serializeDraft({ ...draftFor(typed, { id: first.id })!, sent: true })), { editing: false, mint });
    expect(again.restored).toBe(true);
    expect(again.values).toEqual(typed);
    expect(again.id).toBe(first.id);
    expect(again.sent).toBe(true);
  });

  it('a draft that was never sent (another tab may hold it) comes back under a new id', () => {
    const typed = { ...defaults, person: 'Maya', action: 'Send the deck' };
    const tabB = openForm(defaults, stored(serializeDraft(draftFor(typed, { id: 'tab_a_entry_01' })!)), { editing: false, mint });
    expect(tabB.restored).toBe(true);
    expect(tabB.id).not.toBe('tab_a_entry_01');
    expect(tabB.sent).toBeUndefined();
  });

  it("a caller's id (a suggestion, a timed session) is never kept with the draft: a later form restores the form's own id", () => {
    // A suggestion form saves under use_<recommendation id>, but its draft keeps the form's own id.
    const suggestion = openForm({ person: '', action: '' }, null, { editing: false, mint });
    const kept = stored(serializeDraft({ ...draftFor({ person: 'Maya', action: 'Send Maya the proposal' }, { id: suggestion.id })!, sent: true }));
    const add = openForm({ person: '', action: '' }, kept, { editing: false, mint });
    expect(add).toMatchObject({ restored: true, id: suggestion.id });
    expect(add.id).not.toMatch(/^use_/);
  });

  it('fresh preset values win over a restored draft', () => {
    const draft = stored(serializeDraft({ values: { minutes: 5, notes: 'clean' }, id: 'draft_id_123' }));
    expect(openForm({ minutes: 15, notes: '' }, draft, { editing: false, preset: { minutes: 15 }, mint }).values).toEqual({ minutes: 15, notes: 'clean' });
  });

  it('a draft from an older build (plain values) is restored as before, under a new id', () => {
    const form = openForm(defaults, { person: 'Maya', action: 'Send the deck' }, { editing: false, mint });
    expect(form.restored).toBe(true);
    expect(form.values).toEqual({ person: 'Maya', action: 'Send the deck', done: false });
    expect(form.id).toMatch(SHORT_ID_PATTERN);
  });

  it('nothing stored, or a draft that changes nothing: a new id each time', () => {
    const a = openForm(defaults, null, { editing: false, mint });
    const b = openForm(defaults, stored(serializeDraft({ values: defaults, id: 'old_draft_id1' })), { editing: false, mint });
    expect(b).toMatchObject({ restored: false, spent: true });
    expect(b.id).not.toBe('old_draft_id1');
    expect(a.id).not.toBe(b.id);
  });

  it('a malformed id in a draft is not used', () => {
    expect(parseDraft({ ...serializeDraft({ values: { person: 'Maya' } }), id: 'no spaces allowed' }, false)).toEqual({ values: { person: 'Maya' } });
  });
});

describe('a restored new-entry draft whose entry is already saved', () => {
  const people = AppSpecSchema.parse(PEOPLE_QUEUE);
  const normalize = (v: RecordValues) => validateValues(people, v).values;
  const defaults = { person: '', action: '', done: false, channel: 'email' };
  const typed = { ...defaults, person: 'Maya', action: 'Send the deck' };
  const draft = () => stored(serializeDraft({ values: typed, id: 'saved_entry_001', sent: true }));
  const listedAs = (values: RecordValues) => (id: string) => (id === 'saved_entry_001' ? values : undefined);

  it('is dropped when the listed entry has its values, and the form starts blank under a new id', () => {
    const form = openForm(defaults, draft(), { editing: false, mint, saved: listedAs(normalize(typed)), normalize });
    expect(form).toMatchObject({ restored: false, spent: true, values: defaults });
    expect(form.id).not.toBe('saved_entry_001');
  });

  it('comes back under a new id when the listed entry differs, so saving never replaces that entry', () => {
    const form = openForm(defaults, draft(), { editing: false, mint, saved: listedAs({ ...normalize(typed), done: true }), normalize });
    expect(form).toMatchObject({ restored: true, spent: false, values: typed });
    expect(form.id).not.toBe('saved_entry_001');
  });

  it('compares values as they are stored (empty text is null, a missing key is null)', () => {
    const withEmpty = stored(serializeDraft({ values: { ...typed, due: '', context: '' }, id: 'saved_entry_001', sent: true }));
    const listed = { person: 'Maya', action: 'Send the deck', done: false, channel: 'email', due: null };
    expect(openForm(defaults, withEmpty, { editing: false, mint, saved: listedAs(listed), normalize })).toMatchObject({ restored: false, spent: true });
  });

  it('keeps its id when the entry is not listed or the records are not known, so a retry saves it once', () => {
    expect(openForm(defaults, draft(), { editing: false, mint, saved: () => undefined, normalize }).id).toBe('saved_entry_001');
    expect(openForm(defaults, draft(), { editing: false, mint }).id).toBe('saved_entry_001');
  });
});

describe('an edit refused because the entry changed since keeps what the other change left alone', () => {
  const opened = { person: 'Maya', action: 'Send the deck', done: false, context: '' };

  it('keeps the typed keys the other device did not touch and drops the ones it changed', () => {
    const typed = { ...opened, action: 'Send the deck and the pricing', context: 'She asked about pricing for small teams' };
    const latest = { ...opened, done: true, action: 'Send the deck today' };
    expect(keepUntouched(changedValues(opened, typed), opened, latest)).toEqual({ context: 'She asked about pricing for small teams' });
    expect(keepUntouched({ action: 'Mine' }, opened, { ...opened, action: 'Theirs' })).toBeNull();
  });

  it('reopening lays the kept note over the latest copy, and Done stays', () => {
    const latest = { ...opened, done: true };
    const kept = keepUntouched(changedValues(opened, { ...opened, context: 'A long note' }), opened, latest)!;
    const form = openForm(latest, stored(serializeDraft({ values: kept })), { editing: true, mint });
    expect(form).toMatchObject({ restored: true, values: { ...latest, context: 'A long note' } });
    expect(changedValues(latest, form.values)).toEqual({ context: 'A long note' });
  });
});

describe('a new entry whose id cannot be used again', () => {
  const created = (id: string) => ({ record: rec(id, { minutes: 15 }), duplicate: false, updated: false });
  const refused = (code: 'record_deleted' | 'record_conflict') => new ApiError(409, code === 'record_deleted' ? 'That entry was deleted.' : 'This changed on another device.', code);

  it('was deleted: it is saved once more under a new id, and the toast says so', async () => {
    const sent: (string | undefined)[] = [];
    const send = async (id: string | undefined) => {
      sent.push(id);
      if (sent.length === 1) throw refused('record_deleted');
      return created(id!);
    };
    const result = await createEntry(send, 'session_old_001', () => 'session_new_001');
    expect(sent).toEqual(['session_old_001', 'session_new_001']);
    expect(result).toMatchObject({ message: SAVED_AS_NEW, record: { id: 'session_new_001' } });
  });

  it('is tried only once more', async () => {
    let calls = 0;
    const send = async (): Promise<ReturnType<typeof created>> => {
      calls++;
      throw refused('record_deleted');
    };
    await expect(createEntry(send, 'session_old_001', () => 'session_new_001')).rejects.toMatchObject({ code: 'record_deleted' });
    expect(calls).toBe(2);
  });

  it('was changed since: nothing is sent again, and the id is renewed only when the caller can renew it', async () => {
    for (const renewOnConflict of [true, false]) {
      let calls = 0;
      let renewed = 0;
      const send = async (): Promise<ReturnType<typeof created>> => {
        calls++;
        throw refused('record_conflict');
      };
      const renew = () => `session_new_00${++renewed}`;
      await expect(createEntry(send, 'session_old_001', renew, { renewOnConflict })).rejects.toMatchObject({ code: 'record_conflict' });
      expect({ calls, renewed }).toEqual({ calls: 1, renewed: renewOnConflict ? 1 : 0 });
    }
  });

  it('a lost response keeps the id, so the retry is the same entry', async () => {
    let renewed = 0;
    const send = async (): Promise<ReturnType<typeof created>> => {
      throw new ApiError(0, 'You appear to be offline.', 'network');
    };
    await expect(createEntry(send, 'entry_id_0001', () => `x_${++renewed}`)).rejects.toMatchObject({ status: 0 });
    expect(renewed).toBe(0);
  });

  it('a timed session refused because it changed since keeps its form open and says what to do; anything else closes', () => {
    const view = AppSpecSchema.parse(PEOPLE_QUEUE).views[0]!;
    const server = 'This changed on another device, so nothing was overwritten. Here is the latest version.';
    const said = 'That session was changed on another device, so it was not overwritten. Save again to keep this time as a new session.';
    expect(afterConflict({ mode: 'new', view, recordId: 'session_old_001', onConflict: () => 'session_new_001', conflictMessage: said }, server)).toEqual({ message: said, keepOpen: true });
    expect(afterConflict({ mode: 'new', view, recordId: 'use_rec_00000001', recommendationId: 'rec_00000001' }, server)).toEqual({ message: server, keepOpen: false });
    expect(afterConflict({ mode: 'new', view }, server)).toEqual({ message: server, keepOpen: false });
    expect(afterConflict({ mode: 'edit', view, record: rec('rec_maya_0001', { person: 'Maya' }) }, server)).toEqual({ message: server, keepOpen: false });
  });
});

describe('drafts on this device', () => {
  const store = new Map<string, string>();
  const g = globalThis as { window?: unknown };
  beforeEach(() => {
    store.clear();
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) } };
  });
  afterEach(() => {
    delete g.window;
  });

  it('keeps a new entry with its id, and removes an edit draft once nothing differs', () => {
    const newKey = draftKey('app_00000001');
    writeDraft(newKey, { ...draftFor({ person: 'Maya' }, { id: 'entry_id_0001' })!, sent: true });
    expect(openForm({ person: '' }, readJson(newKey), { editing: false, mint })).toMatchObject({ restored: true, id: 'entry_id_0001' });

    const editKey = draftKey('app_00000001', 'rec_maya_0001');
    writeDraft(editKey, draftFor({ person: 'Maya B.' }, { editing: { person: 'Maya' } }));
    expect(readJson(editKey)).toEqual(serializeDraft({ values: { person: 'Maya B.' } }));
    writeDraft(editKey, draftFor({ person: 'Maya' }, { editing: { person: 'Maya' } }));
    expect(store.has(editKey)).toBe(false);
  });
});

describe('a form never restores or sends a field it does not show (review finding 1)', () => {
  const alex = { person: 'Alex', action: 'Send the article', draft: null };
  const unsavedEdit = { action: 'Send the article AND the invoice (unsaved edit)' };
  const onlyDraft = new Set(['draft']);

  it('an unsaved Edit details change to the action is not restored in the message form, and is kept for Edit details', () => {
    const split = splitEditDraft(stored(serializeDraft({ values: unsavedEdit })), onlyDraft);
    expect(split.own).toBeNull();
    expect(split.foreign).toEqual(unsavedEdit);
    const form = openForm(alex, split.own, { editing: true, mint });
    expect(form.restored).toBe(false);
    expect(form.spent).toBe(false);
  });

  it('saving the message sends the message only, never the action', () => {
    const typed = { ...alex, draft: 'Hi Alex, here is the article.' };
    expect(shownChanges(changedValues(alex, typed), onlyDraft)).toEqual({ draft: 'Hi Alex, here is the article.' });
    // Even values that somehow carry the other form's change send only what this form shows.
    expect(shownChanges({ ...unsavedEdit, draft: 'Hi' }, onlyDraft)).toEqual({ draft: 'Hi' });
  });

  it('restores the shown part of a mixed draft, keeps the rest apart, and drops a format edits cannot use', () => {
    const split = splitEditDraft(stored(serializeDraft({ values: { ...unsavedEdit, draft: 'Hi' } })), onlyDraft);
    expect(parseDraft(split.own, true)).toEqual({ values: { draft: 'Hi' } });
    expect(split.foreign).toEqual(unsavedEdit);
    const old = { action: 'whole values map from an older build' };
    expect(splitEditDraft(old, onlyDraft)).toEqual({ own: old, foreign: {} });
    expect(splitEditDraft(null, onlyDraft)).toEqual({ own: null, foreign: {} });
  });

  it('the message form keeps its own draft, apart from Edit details (which keeps its key)', () => {
    expect(editDraftKey('app_00000001', 'rec_alex_0001')).toBe(draftKey('app_00000001', 'rec_alex_0001'));
    expect(editDraftKey('app_00000001', 'rec_alex_0001', 'message')).not.toBe(draftKey('app_00000001', 'rec_alex_0001'));
  });
});

describe('the message draft after another device changed it (review finding 2)', () => {
  const steps = () => {
    const log: string[] = [];
    return { log, after: { saved: () => log.push('saved'), close: () => log.push('closed') } };
  };

  it('a refusal because it changed elsewhere closes the sheet, so a second Save cannot go over the newer draft', async () => {
    const { log, after } = steps();
    const refused = new ApiError(409, 'This changed on another device, so nothing was overwritten.', 'record_conflict');
    await expect(saveMessageDraft(() => Promise.reject(refused), after)).rejects.toBe(refused);
    expect(log).toEqual(['closed']);
  });

  it('another failure keeps the sheet open with what was typed; a save says so and closes', async () => {
    const failed = steps();
    await expect(saveMessageDraft(() => Promise.reject(new ApiError(0, 'You appear to be offline.', 'network')), failed.after)).rejects.toBeInstanceOf(ApiError);
    expect(failed.log).toEqual([]);
    const ok = steps();
    await saveMessageDraft(() => Promise.resolve(), ok.after);
    expect(ok.log).toEqual(['saved', 'closed']);
  });
});

describe('a new card lands in a column (review finding 3)', () => {
  it('an optional stage without a default still starts at the first stage, so the card is not left in "Other"', () => {
    const input: AppSpecInput = structuredClone(FOLLOW_UP_BOARD);
    const stage = (input.fields as { id: string; required?: boolean; default?: unknown }[]).find((f) => f.id === 'stage')!;
    delete stage.default;
    stage.required = false;
    const board = AppSpecSchema.parse(input);
    const stageField = board.fields.find((f) => f.id === 'stage');
    if (stageField?.type !== 'select') throw new Error('the board stage is a select');
    expect(stageField.required).toBe(false);
    expect(newRecordBase(board, formFieldsFor(board, board.views[0]!), {}).stage).toBe(stageField.options[0]!.value);
  });

  it('an optional choice no view is built on (how a person was reached) still starts unchosen', () => {
    const people = AppSpecSchema.parse(PEOPLE_QUEUE);
    expect(newRecordBase(people, formFieldsFor(people, people.views[0]!), {})).not.toHaveProperty('channel');
  });
});

describe('a retried create (finding 31)', () => {
  it("says 'Already saved' only when nothing changed; newer values that updated the entry are 'Saved'", () => {
    expect(createdMessage({ duplicate: false, updated: false })).toBe('Saved');
    expect(createdMessage({ duplicate: true, updated: false })).toBe('Already saved');
    expect(createdMessage({ duplicate: true, updated: true })).toBe('Saved');
  });

  it('puts the returned copy in place of the one with its id, never twice', () => {
    const a = rec('rec_a_000001', { minutes: 5 });
    const b = rec('rec_b_000001', { minutes: 20 });
    const updated = rec('rec_a_000001', { minutes: 15, timed_seconds: 900 }, '2026-11-14T11:00:00.000Z');
    expect(upsertRecord([b, a], updated)).toEqual([b, updated]);
    const fresh = rec('rec_c_000001', { minutes: 3 });
    expect(upsertRecord([b, a], fresh)).toEqual([fresh, b, a]);
  });
});

describe('queue Undo puts back what the item had (finding 32)', () => {
  const staged = AppSpecSchema.parse({
    schemaVersion: 1,
    name: 'Follow-ups',
    tagline: 'Keep promises',
    purpose: 'work',
    pattern: 'queue',
    icon: { symbol: 'contact', color: 'mint' },
    fields: [
      { id: 'person', label: 'Who', type: 'text', required: true },
      { id: 'action', label: 'Next action', type: 'text', required: true },
      { id: 'stage', label: 'Stage', type: 'select', default: 'todo', options: [{ value: 'todo', label: 'To do' }, { value: 'waiting', label: 'Waiting on them' }, { value: 'done', label: 'Done' }] },
      { id: 'due', label: 'By when', type: 'date' },
    ],
    views: [{ id: 'queue', type: 'queue', title: 'Next actions', personFieldId: 'person', actionFieldId: 'action', dueFieldId: 'due', stageFieldId: 'stage', doneStageValues: ['done'], groupBy: 'due' }],
    rules: [],
    entryNoun: { singular: 'follow-up', plural: 'follow-ups' },
    permissions: [],
  });
  const view = staged.views[0] as QueueViewSpec;
  const undoFor = (spec: typeof staged, v: QueueViewSpec, item: AppRecord) => {
    const patch = completionPatch(spec, v, item)!;
    const now = { ...item, values: { ...item.values, ...patch } };
    return { patch, back: undoPatch(item, patch, completionPatch(spec, v, now)) };
  };

  it('Done then Undo returns a "Waiting on them" item to waiting, not to the first open stage', () => {
    const { patch, back } = undoFor(staged, view, rec('rec_waiting_01', { person: 'Sam', action: 'Send the intro', stage: 'waiting' }));
    expect(patch).toEqual({ stage: 'done' });
    expect(back).toEqual({ stage: 'waiting' });
  });

  it('a done checkbox goes back to not done', () => {
    const people = AppSpecSchema.parse(PEOPLE_QUEUE);
    const { patch, back } = undoFor(people, people.views[0] as QueueViewSpec, rec('rec_maya_0001', { person: 'Maya', action: 'Send the deck', done: false }));
    expect(patch).toEqual({ done: true });
    expect(back).toEqual({ done: false });
  });

  it('an item with no stage yet gets the plain toggle back', () => {
    const { back } = undoFor(staged, view, rec('rec_nostage_1', { person: 'Sam', action: 'Send the intro' }));
    expect(back).toEqual({ stage: 'todo' });
    expect(undoPatch(rec('rec_nostage_1', {}), { stage: 'done' })).toEqual({ stage: null });
  });
});

describe('a failed edit rolls back only its own keys (finding 34)', () => {
  const confirmed = rec('rec_maya_0001', { person: 'Maya', action: 'Send the deck', done: false });

  it('two queued edits that both fail leave the item as the server has it', () => {
    // Done (edit 1) and a new action (edit 2) are both shown while they wait; then the connection drops.
    let shown: AppRecord = { ...confirmed, values: { ...confirmed.values, done: true, action: 'Send the deck today' } };
    shown = revertKeys(shown, confirmed, ['done']);
    shown = revertKeys(shown, confirmed, ['action']);
    expect(shown.values).toEqual(confirmed.values);
  });

  it('keeps what other edits changed and drops a key the server never had', () => {
    const shown = { ...confirmed, values: { ...confirmed.values, done: true, due: '2026-11-20' } };
    expect(revertKeys(shown, confirmed, ['due']).values).toEqual({ person: 'Maya', action: 'Send the deck', done: true });
  });
});

describe('Agent example flag (finding 37)', () => {
  const example = { text: 'I keep stopping for long shadows on brick walls in the late afternoon.', url: '' };

  it('an example sent as offered is stored as an example', () => {
    expect(isUnchangedExample(example, { text: ' ' + example.text + ' ', url: '', file: null })).toBe(true);
  });

  it("a photo of the person's own makes the share personal", () => {
    const photo = new File([new Uint8Array([0xff, 0xd8])], 'my-street.jpg', { type: 'image/jpeg' });
    expect(isUnchangedExample(example, { text: example.text, url: '', file: photo })).toBe(false);
  });

  it('changed text or link, or no example picked, is personal', () => {
    expect(isUnchangedExample(example, { text: example.text + ' Mine.', url: '', file: null })).toBe(false);
    expect(isUnchangedExample(example, { text: example.text, url: 'https://example.com/walk', file: null })).toBe(false);
    expect(isUnchangedExample(null, { text: example.text, url: '', file: null })).toBe(false);
  });
});
