/**
 * Create/edit form for one record. Shows the fields its view asked for, validates with the shared
 * rules before submitting, keeps an unsaved draft on this device, and restores it when the form
 * opens again (unless the form was opened with fresh results, e.g. from the practice timer).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { visibleFields, type AppSpec, type FieldSpec } from '@shared/appSpec.ts';
import { newId } from '@shared/ids.ts';
import { defaultValues, validateValues, type AppRecord, type FieldValue, type RecordValues } from '@shared/records.ts';
import { ApiError } from '../api.ts';
import { FieldInput } from './FieldInput.tsx';
import { changedValues, draftFor, draftKey, keepUntouched, openForm, parseDraft, readJson, removeKey, writeDraft, type OpenedForm } from './runtimeUtils.ts';
import { conflictCopy } from './useAppData.ts';

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
  /** A new entry's id when the caller has one (a timed session, a suggestion); otherwise the form's own, kept with its draft. */
  entryId?: string;
  /** The app's records as loaded, to tell whether a restored new-entry draft was saved already. Omitted when not known. */
  records?: AppRecord[];
  /**
   * Resolves on success (the draft is then cleared) and rejects on failure. A new entry is saved under
   * `recordId`; `renewId` comes with the form's own id and gives the entry a new one when that id cannot be used again.
   */
  onSubmit: (values: RecordValues, recordId: string | undefined, renewId?: () => string) => Promise<void>;
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

/** Defaults for a new record: the shown fields, plus required fields that carry a default, plus the preset. */
function newRecordBase(spec: AppSpec, fields: FieldSpec[], preset: RecordValues | undefined): RecordValues {
  const all = defaultValues(spec);
  const keep = new Set(fields.map((f) => f.id));
  for (const f of spec.fields) if (f.required && f.id in all) keep.add(f.id);
  const out: RecordValues = {};
  for (const k of Object.keys(all)) if (keep.has(k)) out[k] = all[k];
  return { ...out, ...(preset ?? {}) };
}

export function RecordForm({ spec, appId, fields: fieldsProp, preset, draftScope, restoreDraft = true, initial, entryId, records, onSubmit, onCancel, onDelete, submitting, serverErrors, submitLabel, note }: Props) {
  const fields = useMemo(() => fieldsProp ?? visibleFields(spec), [fieldsProp, spec]);
  const key = draftKey(appId, initial?.id, draftScope);
  const base = useMemo<RecordValues>(() => (initial ? { ...initial.values } : newRecordBase(spec, fields, preset)), [initial, spec, fields, preset]);

  // Restore a draft once, when the form opens. An edit's draft holds only the keys the person changed,
  // laid over the latest copy, so values changed since (here or on another device) never come back.
  // A new entry keeps one id until it is saved (a restored draft its own), so a retry after a lost
  // response saves the same entry once. A draft whose entry is already listed was saved: it is dropped
  // when nothing changed, and otherwise restored under a new id, so it never replaces that entry.
  const init = useRef<(OpenedForm & { key: string }) | null>(null);
  if (!init.current) {
    const stored = restoreDraft ? readJson<unknown>(key) : null;
    const saved = records ? (id: string) => records.find((r) => r.id === id)?.values : undefined;
    const normalize = (v: RecordValues) => validateValues(spec, v).values;
    init.current = { ...openForm(base, stored, { editing: Boolean(initial), preset, mint: newId, saved, normalize }), key };
  }
  const [values, setValues] = useState<RecordValues>(init.current.values);
  const [restored, setRestored] = useState(init.current.restored);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = useRef(init.current.restored);
  const changedSinceServer = useRef(new Set<string>());
  /** A new entry's own id, the one its draft keeps. */
  const formId = useRef(init.current.id);
  /** The form's own id once a create with it was sent: the draft keeps that mark, so a reopen retries the same entry. */
  const sentId = useRef<string | undefined>(init.current.sent ? init.current.id : undefined);
  const pendingDraft = useRef<number | undefined>(undefined);
  /** The id a new entry is saved under: the caller's (a timed session, a suggestion) wins over the form's own. */
  const saveId = () => (initial ? undefined : (entryId ?? formId.current));

  // Server errors arrive fresh with each failed submit; typing in a field clears its message.
  useEffect(() => {
    changedSinceServer.current = new Set();
  }, [serverErrors]);

  /** Keeps the form on this device: a new entry's values and the form's own id (never a caller's), or only the keys an edit changed. */
  const keepDraft = (v: RecordValues) => {
    const d = draftFor(v, { editing: initial?.values, id: initial ? undefined : formId.current });
    writeDraft(key, d && !initial && formId.current && sentId.current === formId.current ? { ...d, sent: true } : d);
  };
  const cancelPendingDraft = () => {
    window.clearTimeout(pendingDraft.current);
    pendingDraft.current = undefined;
  };
  /** The draft is spent (saved, or a newer stored copy won): remove it and stop keeping one. */
  const dropDraft = () => {
    cancelPendingDraft();
    dirty.current = false;
    removeKey(key);
  };

  /** The form's own id cannot be used again (its entry was deleted, or changed since it was saved): take a new one, also for the kept draft. */
  const renewOwnId = (): string => {
    formId.current = newId();
    const kept = parseDraft(readJson<unknown>(key), false);
    if (kept) writeDraft(key, { values: kept.values, id: formId.current });
    return formId.current;
  };

  // A spent draft is removed when the form opens, so it cannot come back later over newer values.
  useEffect(() => {
    if (init.current?.spent) removeKey(init.current.key);
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    pendingDraft.current = window.setTimeout(() => {
      pendingDraft.current = undefined;
      keepDraft(values);
    }, 400);
    return cancelPendingDraft;
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
    dropDraft();
    // Starting over is another entry, under a new id (unless the caller gave one).
    if (!initial) formId.current = newId();
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
    // What was typed is on this device before it is sent, so a lost response leaves it to retry. A new
    // entry under the form's own id is marked as sent, so reopening it later retries the same entry.
    const ownId = !initial && entryId === undefined;
    if (ownId) sentId.current = formId.current;
    if (pendingDraft.current !== undefined || ownId) {
      cancelPendingDraft();
      if (ownId) dirty.current = true;
      keepDraft(values);
    }
    try {
      await onSubmit(check.values, saveId(), ownId ? renewOwnId : undefined);
      dropDraft();
    } catch (err) {
      // The parent reports the failure. What was typed stays on this device, but never in a way that
      // could later overwrite a newer stored copy.
      if (!(err instanceof ApiError)) return;
      if (initial && err.code === 'record_conflict') {
        // The entry changed since this edit opened: only the changes to keys the newer copy left alone are kept.
        cancelPendingDraft();
        dirty.current = false;
        const latest = conflictCopy(err);
        const kept = latest ? keepUntouched(changedValues(initial.values, values), initial.values, latest.values) : null;
        writeDraft(key, kept ? { values: kept } : null);
      } else if (ownId && (err.code === 'record_conflict' || err.status === 400)) {
        // The form's own id was saved before and changed since, or is refused: what was typed stays under a new id.
        renewOwnId();
      }
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
