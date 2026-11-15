/**
 * The bottom sheet that hosts RecordForm for creating, editing and deleting one record. Each view
 * brings its own form (fields, filter value, primary-action label); callers may prefill values.
 */
import { useMemo, useRef, useState } from 'react';
import { formFieldsFor, type AppSpec, type ViewSpec } from '@shared/appSpec.ts';
import { newId } from '@shared/ids.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { ApiError, describeError } from '../api.ts';
import { Sheet, useToast } from '../components/ui.tsx';
import { RecordForm, removeEditDrafts } from './RecordForm.tsx';
import type { RecordActions } from './useAppData.ts';

export type SheetState =
  | {
      mode: 'new';
      /** The view whose form and filter apply. */
      view: ViewSpec;
      /** Values set before the person types (timer results, an uploaded photo). */
      preset?: RecordValues;
      /** Sheet title; defaults to the view's addLabel or "New <noun>". */
      title?: string;
      /** Keep a saved draft out of the way when the preset carries fresh results. */
      fresh?: boolean;
      /** The entry's id when the caller has one (a timed session, a suggestion); otherwise the form mints one and keeps it with its draft. */
      recordId?: string;
      /** The Agent suggestion this entry comes from. */
      recommendationId?: string;
      /** What was prefilled and what to check, shown above the fields. */
      note?: string;
      /** Called once the entry is saved with these values (not when a newer stored copy wins). */
      onSaved?: (record: AppRecord) => void;
      /** Called right before the entry is sent (a timed session then notes that a save was sent). */
      onSending?: () => void;
      /**
       * The recordId cannot be used again: its entry was deleted, or saved before and changed since. Gives
       * the entry a new id for its next save (a timed session keeps its time) and returns it when it can.
       * A save refused because that entry changed since leaves the form open, to save again under the new id.
       */
      onConflict?: () => string | undefined;
      /** What to say when a save under the recordId was refused because that entry changed since (default: the server's message). */
      conflictMessage?: string;
    }
  | { mode: 'edit'; record: AppRecord; view: ViewSpec }
  | null;

export type NewEntrySheet = Extract<NonNullable<SheetState>, { mode: 'new' }>;

/** The toast after saving a new entry: a repeat of the first save changed nothing; one with newer values updated it. */
export function createdMessage(result: { duplicate: boolean; updated: boolean }): string {
  return result.duplicate && !result.updated ? 'Already saved' : 'Saved';
}

/** The toast when the entry under an id was deleted, so the save went to a new entry. */
export const SAVED_AS_NEW = 'That entry was deleted, so this was saved as a new one.';

/** The minutes label of a practice session typed in by hand: what was practiced, not what a timer measured. */
export const TYPED_IN_MINUTES_LABEL = 'Minutes practiced';

/** The minutes field of a practice session saved without the timer (its minutes come in empty: nothing was measured). */
export function typedInMinutesField(sheet: SheetState): string | undefined {
  if (sheet?.mode !== 'new' || sheet.view.type !== 'practice' || !sheet.preset) return undefined;
  const minutes = sheet.view.minutesFieldId;
  return minutes in sheet.preset && sheet.preset[minutes] === null ? minutes : undefined;
}

/**
 * Labels a form shows for this task only. A practice session typed in by hand asks for the minutes
 * practiced, so a typed-in log never reads as timed.
 */
export function formLabels(sheet: SheetState): Record<string, string> | undefined {
  const minutes = typedInMinutesField(sheet);
  return minutes ? { [minutes]: TYPED_IN_MINUTES_LABEL } : undefined;
}

/**
 * Sends a new entry under its id. When the entry under that id was deleted (409 record_deleted), the id
 * is renewed and the entry sent once more, as a new one. When it was saved before and changed since (409
 * record_conflict), nothing is overwritten; with renewOnConflict its next save gets a new id.
 */
export async function createEntry(
  send: (id: string | undefined) => Promise<{ record: AppRecord; duplicate: boolean; updated: boolean }>,
  id: string | undefined,
  renew: () => string,
  opts: { renewOnConflict?: boolean } = {},
): Promise<{ record: AppRecord; message: string }> {
  try {
    const created = await send(id);
    return { record: created.record, message: createdMessage(created) };
  } catch (err) {
    if (!(err instanceof ApiError) || id === undefined) throw err;
    if (err.code === 'record_conflict' && opts.renewOnConflict) renew();
    if (err.code !== 'record_deleted') throw err;
    const created = await send(renew());
    return { record: created.record, message: SAVED_AS_NEW };
  }
}

/**
 * After a save refused because the entry changed since (409 record_conflict): what to say, and whether the
 * form stays open. A new entry whose caller renews its id (a timed session) keeps its form, so saving again
 * keeps what it holds as a new entry; anything else closes, and the latest copy is shown.
 */
export function afterConflict(sheet: SheetState, serverMessage: string): { message: string; keepOpen: boolean } {
  if (sheet?.mode === 'new' && sheet.recordId !== undefined && sheet.onConflict !== undefined) return { message: sheet.conflictMessage ?? serverMessage, keepOpen: true };
  return { message: serverMessage, keepOpen: false };
}

interface Props {
  appId: string;
  spec: AppSpec;
  sheet: SheetState;
  onClose: () => void;
  actions: RecordActions;
  /** The app's records as loaded (a restored draft whose entry is listed was saved already). */
  records?: AppRecord[];
}

export function RecordSheet({ appId, spec, sheet, onClose, actions, records }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>();
  /** Ids replaced because their entry was deleted or changed since: a later save from the same form uses the new one. */
  const renewedIds = useRef(new Map<string, string>());
  const record = sheet?.mode === 'edit' ? sheet.record : undefined;
  const view = sheet?.view;
  const noun = spec.entryNoun.singular;
  const fields = useMemo(() => (view ? formFieldsFor(spec, view) : undefined), [spec, view]);
  const labels = useMemo(() => formLabels(sheet), [sheet]);
  // A session typed in by hand starts at its minutes: that is what the note asks for.
  const focusFieldId = typedInMinutesField(sheet);
  const preset = useMemo<RecordValues | undefined>(() => {
    if (!sheet || sheet.mode !== 'new') return undefined;
    const filter = sheet.view.filter ? { [sheet.view.filter.fieldId]: sheet.view.filter.value } : {};
    return { ...filter, ...(sheet.preset ?? {}) };
  }, [sheet]);

  const close = () => {
    setServerErrors(undefined);
    onClose();
  };

  // A new entry is saved under its id (the form's own, kept with its draft, or the caller's): a retry
  // after a lost response or a second tap saves it once.
  const submit = async (values: RecordValues, recordId: string | undefined, renewOwnId?: () => string) => {
    setSubmitting(true);
    setServerErrors(undefined);
    try {
      if (record) {
        await actions.updateRecord(record.id, values);
        toast('Saved');
      } else if (sheet?.mode === 'new') {
        const entry = sheet;
        // The form renews its own id; a caller's id is renewed by the caller (a timed session) or replaced.
        const renew = () => {
          const next = (entry.recordId === undefined ? renewOwnId?.() : entry.onConflict?.()) ?? newId();
          if (recordId !== undefined) renewedIds.current.set(recordId, next);
          return next;
        };
        const send = (id: string | undefined) => {
          entry.onSending?.();
          return actions.createRecord(values, { id, recommendationId: entry.recommendationId });
        };
        const id = recordId === undefined ? undefined : (renewedIds.current.get(recordId) ?? recordId);
        const saved = await createEntry(send, id, renew, { renewOnConflict: entry.recordId !== undefined && entry.onConflict !== undefined });
        entry.onSaved?.(saved.record);
        toast(saved.message);
      }
      close();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === 'object') {
        setServerErrors(err.details as Record<string, string>);
      } else if (err instanceof ApiError && err.code === 'record_conflict') {
        // Nothing was overwritten, and the latest copy is shown; a new entry is not counted as saved. A timed
        // session now has a new id: its form stays open, so Save keeps this time (and anything typed) as a new session.
        const outcome = afterConflict(sheet, err.message);
        toast(outcome.message, { kind: 'error', durationMs: 8000 });
        if (!outcome.keepOpen) close();
      } else {
        toast(describeError(err), { kind: 'error' });
      }
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const remove = record
    ? async () => {
        if (!window.confirm(`Delete this ${noun}? This cannot be undone.`)) return;
        setSubmitting(true);
        try {
          await actions.deleteRecord(record.id);
          removeEditDrafts(appId, record.id);
          toast('Deleted');
          close();
        } catch (err) {
          toast(describeError(err), { kind: 'error' });
        } finally {
          setSubmitting(false);
        }
      }
    : undefined;

  const title = record ? `Edit ${noun}` : sheet?.mode === 'new' ? (sheet.title ?? sheet.view.addLabel ?? `New ${noun}`) : '';

  return (
    <Sheet open={sheet !== null} onClose={close} title={title}>
      {sheet && view && (
        <RecordForm
          key={record?.id ?? `new-${view.id}`}
          spec={spec}
          appId={appId}
          fields={fields}
          preset={preset}
          draftScope={spec.views.length > 1 ? view.id : undefined}
          restoreDraft={sheet.mode === 'new' ? !sheet.fresh : true}
          initial={record}
          entryId={sheet.mode === 'new' ? sheet.recordId : undefined}
          records={records}
          onSubmit={submit}
          onCancel={close}
          onDelete={remove}
          submitting={submitting}
          serverErrors={serverErrors}
          submitLabel={sheet.mode === 'new' ? sheet.view.addLabel : undefined}
          note={sheet.mode === 'new' ? sheet.note : undefined}
          labels={labels}
          focusFieldId={focusFieldId}
        />
      )}
    </Sheet>
  );
}
