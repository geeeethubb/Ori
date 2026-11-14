/**
 * "Use the app you have": an entry the Agent suggests is described by ROLE (a link, a person and an
 * action, a photo). Here it becomes values for the app's own fields through its view bindings, so a
 * draft never guesses field ids. Nothing is stored: the person checks the prefilled form and saves it.
 */
import { roleField, type AppSpec, type ViewSpec } from './appSpec.ts';
import type { RecordDraft } from './context.ts';
import type { RecordValues } from './records.ts';
import { suggestDateFor } from './time.ts';

export interface DraftEntry {
  /** The view whose form receives the entry. */
  view: ViewSpec;
  values: RecordValues;
  /** What was suggested and what to check, in plain words (shown above the form). */
  note: string;
}

const VIEW_FOR: Record<RecordDraft['kind'], ViewSpec['type']> = { source: 'links', follow_up: 'queue', photo: 'gallery' };

export function draftEntry(spec: AppSpec, draft: RecordDraft, now: Date = new Date()): DraftEntry | null {
  const view = spec.views.find((v) => v.type === VIEW_FOR[draft.kind]);
  if (!view) return null;
  const values: RecordValues = {};
  if (view.filter) values[view.filter.fieldId] = view.filter.value;
  const set = (role: string, value: unknown) => {
    const id = roleField(view, role);
    if (id && value !== undefined && value !== null && value !== '') values[id] = value;
  };
  if (draft.kind === 'source') {
    if (!draft.url) return null;
    set('url', draft.url);
    set('title', draft.title);
    set('note', draft.note);
    return { view, values, note: 'From your AI: the link you shared, kept as a link. The page itself was not read.' };
  }
  if (draft.kind === 'photo') {
    if (!draft.mediaId) return null;
    set('image', draft.mediaId);
    return { view, values, note: 'From your AI: the photo you shared. Add what you noticed, then save.' };
  }
  set('person', draft.person);
  set('action', draft.action);
  const notes = ['From your AI: check who and what before you save. Nothing is sent to anyone.'];
  if (draft.dueText) {
    // The person's own words are kept; a date is only a suggestion until they save it.
    if (roleField(view, 'due_text')) set('due_text', draft.dueText);
    const suggested = suggestDateFor(draft.dueText, now);
    if (suggested) set('due', suggested);
    notes.push(suggested
      ? `You said “${draft.dueText}”, so the date is set to the next one. Change it if you meant another day.`
      : `You said “${draft.dueText}”. Pick the date you mean.`);
  }
  if (draft.note) set('context', `From your note: “${draft.note}”`);
  return { view, values, note: notes.join(' ') };
}
