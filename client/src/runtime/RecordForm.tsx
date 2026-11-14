/**
 * Create/edit form for one record. Shows the fields its view asked for, validates with the shared
 * rules before submitting, keeps an unsaved draft on this device, and restores it when the form
 * opens again (unless the form was opened with fresh results, e.g. from the practice timer).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { visibleFields, type AppSpec, type FieldSpec } from '@shared/appSpec.ts';
import { defaultValues, validateValues, type AppRecord, type FieldValue, type RecordValues } from '@shared/records.ts';
import { FieldInput } from './FieldInput.tsx';
import { draftKey, readJson, removeKey, sameValues, writeJson } from './runtimeUtils.ts';

interface Props {
  spec: AppSpec;
  appId: string;
  /** Fields the form shows, in order (the caller resolves them with formFieldsFor). Default: every visible field. */
  fields?: FieldSpec[];
  /** Values set before the person types: the view's filter value, timer results, an uploaded photo. */
  preset?: RecordValues;
  /** Keep drafts of new records apart per view. */
  draftScope?: string;
  /** Restore an unsaved draft from this device (default on; off when `preset` carries fresh results). */
  restoreDraft?: boolean;
  /** Existing record when editing; omitted for a new one. */
  initial?: AppRecord;
  /** Resolves on success (the draft is then cleared) and rejects on failure. */
  onSubmit: (values: RecordValues) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  submitting: boolean;
  /** Field errors returned by the server (422). */
  serverErrors?: Record<string, string>;
  /** Label of the submit button (default "Save"). */
  submitLabel?: string;
  /** What was prefilled and what to check (timer results, an Agent suggestion), shown above the fields. */
  note?: ReactNode;
}

/** The keys an edit actually changed: untouched stored values (legacy, hidden or newer fields) are never re-sent. */
function changedValues(before: RecordValues, after: RecordValues): RecordValues {
  const out: RecordValues = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(after[k] ?? null) !== JSON.stringify(before[k] ?? null)) out[k] = after[k];
  }
  return out;
}

function isValuesMap(v: unknown): v is RecordValues {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Defaults for a new record: the shown fields, plus required fields that carry a default, plus the preset. */
function newRecordBase(spec: AppSpec, fields: FieldSpec[], preset: RecordValues | undefined): RecordValues {
  const all = defaultValues(spec);
  const keep = new Set(fields.map((f) => f.id));
  for (const f of spec.fields) if (f.required && f.id in all) keep.add(f.id);
  const out: RecordValues = {};
  for (const k of Object.keys(all)) if (keep.has(k)) out[k] = all[k];
  return { ...out, ...(preset ?? {}) };
}

export function RecordForm({ spec, appId, fields: fieldsProp, preset, draftScope, restoreDraft = true, initial, onSubmit, onCancel, onDelete, submitting, serverErrors, submitLabel, note }: Props) {
  const fields = useMemo(() => fieldsProp ?? visibleFields(spec), [fieldsProp, spec]);
  const key = draftKey(appId, initial?.id, draftScope);
  const base = useMemo<RecordValues>(() => (initial ? { ...initial.values } : newRecordBase(spec, fields, preset)), [initial, spec, fields, preset]);

  // Restore a draft once, when the form opens.
  const init = useRef<{ values: RecordValues; restored: boolean } | null>(null);
  if (!init.current) {
    const draft = restoreDraft ? readJson<unknown>(key) : null;
    const usable = isValuesMap(draft) && !sameValues(draft, base);
    init.current = usable ? { values: { ...base, ...draft, ...(preset ?? {}) }, restored: true } : { values: base, restored: false };
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
  // Problems with fields this form does not show are reported at the top instead of vanishing.
  const shownIds = new Set(fields.map((f) => f.id));
  const hiddenProblems = Object.entries(merged)
    .filter(([k]) => k !== '_' && !shownIds.has(k))
    .map(([k, msg]) => `${spec.fields.find((f) => f.id === k)?.label ?? k}: ${msg}`);
  const general = merged._ ?? (hiddenProblems.length ? hiddenProblems.join(' · ') : undefined);

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
    // A new entry is checked in full. An edit sends only what changed (so an old entry without a field
    // added later, or with a photo that is gone, stays editable) and the server merges it.
    const check = initial ? validateValues(spec, changedValues(initial.values, values), { partial: true }) : validateValues(spec, values);
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
      {note && (
        <div className="banner banner-info rt-form-note" role="note" data-testid="rt-form-note">
          {note}
        </div>
      )}
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
          {submitting ? 'Saving…' : (submitLabel ?? 'Save')}
        </button>
      </div>
    </form>
  );
}
