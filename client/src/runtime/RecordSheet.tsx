/**
 * The bottom sheet that hosts RecordForm for creating, editing and deleting one record. Each view
 * brings its own form (fields, filter value, primary-action label); callers may prefill values.
 */
import { useMemo, useState } from 'react';
import { formFieldsFor, type AppSpec, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { ApiError, describeError } from '../api.ts';
import { Sheet, useToast } from '../components/ui.tsx';
import { RecordForm } from './RecordForm.tsx';
import { draftKey, removeKey } from './runtimeUtils.ts';
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
      /** Called once the record exists. */
      onSaved?: (record: AppRecord) => void;
    }
  | { mode: 'edit'; record: AppRecord; view: ViewSpec }
  | null;

interface Props {
  appId: string;
  spec: AppSpec;
  sheet: SheetState;
  onClose: () => void;
  actions: RecordActions;
}

export function RecordSheet({ appId, spec, sheet, onClose, actions }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string> | undefined>();
  const record = sheet?.mode === 'edit' ? sheet.record : undefined;
  const view = sheet?.view;
  const noun = spec.entryNoun.singular;
  const fields = useMemo(() => (view ? formFieldsFor(spec, view) : undefined), [spec, view]);
  const preset = useMemo<RecordValues | undefined>(() => {
    if (!sheet || sheet.mode !== 'new') return undefined;
    const filter = sheet.view.filter ? { [sheet.view.filter.fieldId]: sheet.view.filter.value } : {};
    return { ...filter, ...(sheet.preset ?? {}) };
  }, [sheet]);

  const close = () => {
    setServerErrors(undefined);
    onClose();
  };

  const submit = async (values: RecordValues) => {
    setSubmitting(true);
    setServerErrors(undefined);
    try {
      if (record) {
        await actions.updateRecord(record.id, values);
      } else {
        const created = await actions.createRecord(values);
        if (sheet?.mode === 'new') sheet.onSaved?.(created);
      }
      toast('Saved');
      close();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.details && typeof err.details === 'object') {
        setServerErrors(err.details as Record<string, string>);
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
          removeKey(draftKey(appId, record.id));
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
          onSubmit={submit}
          onCancel={close}
          onDelete={remove}
          submitting={submitting}
          serverErrors={serverErrors}
          submitLabel={sheet.mode === 'new' && sheet.view.type === 'practice' ? 'Save session' : undefined}
        />
      )}
    </Sheet>
  );
}
