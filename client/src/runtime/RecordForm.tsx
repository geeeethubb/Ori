/**
 * Create/edit form for one record. Validates with the shared rules before submitting, keeps an
 * unsaved draft on this device, and restores it when the form opens again.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { visibleFields, type AppSpec } from '@shared/appSpec.ts';
import { defaultValues, validateValues, type AppRecord, type FieldValue, type RecordValues } from '@shared/records.ts';
import { FieldInput } from './FieldInput.tsx';
import { draftKey, readJson, removeKey, sameValues, writeJson } from './runtimeUtils.ts';

interface Props {
  spec: AppSpec;
  appId: string;
  /** Existing record when editing; omitted for a new one. */
  initial?: AppRecord;
  /** Resolves on success (the draft is then cleared) and rejects on failure. */
  onSubmit: (values: RecordValues) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  submitting: boolean;
  /** Field errors returned by the server (422). */
  serverErrors?: Record<string, string>;
}

function isValuesMap(v: unknown): v is RecordValues {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function RecordForm({ spec, appId, initial, onSubmit, onCancel, onDelete, submitting, serverErrors }: Props) {
  const fields = useMemo(() => visibleFields(spec), [spec]);
  const key = draftKey(appId, initial?.id);
  const base = useMemo<RecordValues>(() => (initial ? { ...initial.values } : defaultValues(spec)), [initial, spec]);

  // Restore a draft once, when the form opens.
  const init = useRef<{ values: RecordValues; restored: boolean } | null>(null);
  if (!init.current) {
    const draft = readJson<unknown>(key);
    const usable = isValuesMap(draft) && !sameValues(draft, base);
    init.current = usable ? { values: { ...base, ...draft }, restored: true } : { values: base, restored: false };
  }
  const [values, setValues] = useState<RecordValues>(init.current.values);
  const [restored, setRestored] = useState(init.current.restored);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useRef(init.current.restored);
  const changedSinceServer = useRef(new Set<string>());

  // Server errors arrive fresh with each failed submit; typing in a field clears its message.
  useEffect(() => {
    changedSinceServer.current = new Set();
  }, [serverErrors]);

  useEffect(() => {
    if (!dirty.current) return;
    const t = window.setTimeout(() => writeJson(key, values), 400);
    return () => window.clearTimeout(t);
  }, [values, key]);

  const change = (fieldId: string, v: FieldValue) => {
    dirty.current = true;
    changedSinceServer.current.add(fieldId);
    setValues((prev) => ({ ...prev, [fieldId]: v }));
    setErrors((prev) => {
      if (!(fieldId in prev)) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const merged: Record<string, string> = { ...errors };
  for (const [k, msg] of Object.entries(serverErrors ?? {})) {
    if (!changedSinceServer.current.has(k) && !(k in merged)) merged[k] = msg;
  }
  const general = merged._;

  const discardDraft = () => {
    removeKey(key);
    dirty.current = false;
    setValues(base);
    setRestored(false);
    setErrors({});
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const check = validateValues(spec, values);
    if (!check.ok) {
      setErrors(check.errors);
      const first = fields.find((f) => f.id in check.errors);
      if (first) {
        const el = document.getElementById(`rt-f-${first.id}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) el.focus({ preventScroll: true });
      }
      return;
    }
    setErrors({});
    try {
      await onSubmit(check.values);
      removeKey(key);
    } catch {
      /* the parent reports the failure; the draft stays on this device */
    }
  };

  const firstTextIndex = initial ? -1 : fields.findIndex((f) => f.type === 'text' || f.type === 'long_text');
  const noun = spec.entryNoun.singular;

  return (
    <form className="rt-form" onSubmit={submit} noValidate aria-busy={submitting} data-testid="rt-record-form">
      {restored && (
        <div className="banner banner-info rt-draft-note" role="status" data-testid="rt-draft-note">
          <span>Draft restored.</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={discardDraft}>
            Discard draft
          </button>
        </div>
      )}
      {general && (
        <div className="banner banner-error" role="alert">
          {general}
        </div>
      )}
      {fields.map((f, i) => (
        <FieldInput key={f.id} field={f} value={values[f.id]} onChange={(v) => change(f.id, v)} error={merged[f.id]} autoFocus={i === firstTextIndex} />
      ))}
      <div className="rt-form-actions">
        {onDelete && (
          <button type="button" className="btn btn-danger rt-delete" data-testid="rt-delete-record" onClick={onDelete} disabled={submitting}>
            Delete
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting} data-testid="rt-cancel-record">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" data-testid="rt-save-record" disabled={submitting} aria-label={submitting ? `Saving ${noun}` : undefined}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
