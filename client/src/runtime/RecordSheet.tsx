/** The bottom sheet that hosts RecordForm for creating, editing and deleting one record. */
import { useState } from 'react';
import type { AppSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { ApiError, describeError } from '../api.ts';
import { Sheet, useToast } from '../components/ui.tsx';
import { RecordForm } from './RecordForm.tsx';
import { draftKey, removeKey } from './runtimeUtils.ts';
import type { RecordActions } from './useAppData.ts';

export type SheetState = { mode: 'new' } | { mode: 'edit'; record: AppRecord } | null;

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
  const noun = spec.entryNoun.singular;

  const close = () => {
    setServerErrors(undefined);
    onClose();
  };

  const submit = async (values: RecordValues) => {
    setSubmitting(true);
    setServerErrors(undefined);
    try {
      if (record) await actions.updateRecord(record.id, values);
      else await actions.createRecord(values);
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

  return (
    <Sheet open={sheet !== null} onClose={close} title={record ? `Edit ${noun}` : `New ${noun}`}>
      {sheet && (
        <RecordForm
          key={record?.id ?? 'new'}
          spec={spec}
          appId={appId}
          initial={record}
          onSubmit={submit}
          onCancel={close}
          onDelete={remove}
          submitting={submitting}
          serverErrors={serverErrors}
        />
      )}
    </Sheet>
  );
}
