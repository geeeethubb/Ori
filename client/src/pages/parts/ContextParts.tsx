import { useState, type FormEvent } from 'react';
import type { ContextSource, ProfileFact } from '@shared/context.ts';
import { FactStatusChip, SampleBadge } from './badges.tsx';
import { SOURCE_KIND_LABELS, formatDate } from './helpers.ts';

export type SourceMap = Map<string, ContextSource>;

function SourceChips({ fact, sourceById }: { fact: ProfileFact; sourceById: SourceMap }) {
  const sources = fact.sourceIds.map((id) => sourceById.get(id)).filter((s): s is ContextSource => Boolean(s));
  if (sources.length === 0) return null;
  const hasSample = sources.some((s) => s.kind === 'sample');
  return (
    <>
      {sources.map((s) => (
        <span key={s.id} className="chip" title={SOURCE_KIND_LABELS[s.kind]}>
          {s.label}
        </span>
      ))}
      {hasSample && <SampleBadge />}
    </>
  );
}

// ---------- one fact ----------

interface FactRowProps {
  fact: ProfileFact;
  sourceById: SourceMap;
  onEdit: (fact: ProfileFact, value: string) => Promise<boolean>;
  onRemove: (fact: ProfileFact) => Promise<void>;
}

export function FactRow({ fact, sourceById, onEdit, onRemove }: FactRowProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(fact.value);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = value.trim();
    if (v.length < 3 || busy) return;
    setBusy(true);
    const ok = await onEdit(fact, v);
    setBusy(false);
    if (ok) setEditing(false);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    await onRemove(fact);
    setBusy(false);
  }

  return (
    <div className="st-fact" data-testid="fact-item" data-status={fact.status} data-category={fact.category}>
      <div className="st-fact-main">
        {editing ? (
          <form className="st-fact-edit" onSubmit={(e) => void save(e)}>
            <input
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={240}
              aria-label="Edit this"
              data-testid="fact-edit-input"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={busy || value.trim().length < 3} data-testid="fact-edit-save">
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(false);
                setValue(fact.value);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <div className="st-fact-value">{fact.value}</div>
            <div className="row" style={{ gap: 6 }}>
              <FactStatusChip status={fact.status} />
              <SourceChips fact={fact} sourceById={sourceById} />
            </div>
          </>
        )}
      </div>
      {!editing && (
        <div className="st-fact-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)} aria-label={`Edit: ${fact.value}`} data-testid="fact-edit">
            Edit
          </button>
          <button type="button" className="btn btn-ghost" data-testid="fact-remove" onClick={() => void remove()} disabled={busy} aria-label={`Remove: ${fact.value}`}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- a conflict group ----------

interface ConflictCardProps {
  facts: ProfileFact[];
  sourceById: SourceMap;
  onKeep: (fact: ProfileFact) => Promise<void>;
}

export function ConflictCard({ facts, sourceById, onKeep }: ConflictCardProps) {
  const [busy, setBusy] = useState(false);
  async function keep(fact: ProfileFact) {
    if (busy) return;
    setBusy(true);
    await onKeep(fact);
    setBusy(false);
  }
  return (
    <div className="card st-conflict" data-testid="conflict-group">
      {facts.map((f) => (
        <div key={f.id} className="st-fact" data-testid="fact-item" data-status={f.status} data-category={f.category}>
          <div className="st-fact-main">
            <div className="st-fact-value">{f.value}</div>
            <div className="row" style={{ gap: 6 }}>
              <FactStatusChip status={f.status} />
              <SourceChips fact={f} sourceById={sourceById} />
            </div>
          </div>
          <div className="st-fact-actions">
            <button type="button" className="btn btn-secondary" data-testid="fact-keep" disabled={busy} onClick={() => void keep(f)}>
              Keep this
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- a source ----------

export function SourceRow({ source, onRemove }: { source: ContextSource; onRemove: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (busy) return;
    setBusy(true);
    await onRemove(source.id);
    setBusy(false);
  }
  return (
    <div className="st-source" data-testid="source-item" data-kind={source.kind}>
      <div className="st-source-main">
        <div className="row" style={{ gap: 6 }}>
          <strong className="st-wrap">{source.label}</strong>
          {source.kind === 'sample' && <SampleBadge />}
        </div>
        <div className="small muted">
          {SOURCE_KIND_LABELS[source.kind]} · {formatDate(source.importedAt)} · {source.charCount.toLocaleString()} characters
        </div>
      </div>
      <button type="button" className="btn btn-ghost" data-testid="source-remove" disabled={busy} onClick={() => void remove()}>
        Remove source
      </button>
    </div>
  );
}

// ---------- add an interest ----------

interface AddInterestProps {
  onAdd: (interest: string) => Promise<boolean>;
  placeholder?: string;
  buttonLabel?: string;
  testId?: string;
  inputTestId?: string;
}

export function AddInterestForm({
  onAdd,
  placeholder = 'e.g. learn to sketch, start running, try pottery',
  buttonLabel = 'Add',
  testId = 'store-add-interest',
  inputTestId = 'store-add-interest-input',
}: AddInterestProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = value.trim();
    if (v.length < 3 || busy) return;
    setBusy(true);
    const ok = await onAdd(v);
    setBusy(false);
    if (ok) setValue('');
  }
  return (
    <form className="st-inline-form" onSubmit={(e) => void submit(e)}>
      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={120}
        aria-label="Something new you want to explore"
        data-testid={inputTestId}
      />
      <button type="submit" className="btn btn-primary" data-testid={testId} disabled={busy || value.trim().length < 3}>
        {buttonLabel}
      </button>
    </form>
  );
}
