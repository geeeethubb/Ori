/** Rows for "What you've shared": editable facts, conflicts, sources, captures, and the add-an-interest form. */
import { useState, type FormEvent } from 'react';
import type { Capture, ContextSource, ProfileFact } from '@shared/context.ts';
import { readStatusLabel } from '@shared/context.ts';
import { Icons } from '../../components/ui.tsx';
import { ExampleTag, FactStatusChip } from './badges.tsx';
import { SOURCE_KIND_LABELS, formatDate, photoWords, relativeTime, truncate } from './helpers.ts';

export type SourceMap = Map<string, ContextSource>;

/** True when every source of a fact is the example profile: nothing the person said states it. */
export function onlyFromExample(fact: ProfileFact, sourceById: SourceMap): boolean {
  const sources = fact.sourceIds.map((id) => sourceById.get(id)).filter((s): s is ContextSource => Boolean(s));
  return sources.length > 0 && sources.every((s) => s.kind === 'sample');
}

/** A source's name as shown: Ori's own labels for shared things say "photo"; names a person typed stay as typed. */
function sourceName(source: ContextSource): string {
  return source.kind === 'capture' ? photoWords(source.label) : source.label;
}

function SourceNames({ fact, sourceById }: { fact: ProfileFact; sourceById: SourceMap }) {
  const sources = fact.sourceIds.map((id) => sourceById.get(id)).filter((s): s is ContextSource => Boolean(s));
  if (sources.length === 0) return null;
  return (
    <span className="me-from">
      from {sources.map(sourceName).join(', ')}
    </span>
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
    <li className="me-fact" data-testid="mem-fact" data-status={fact.status} data-category={fact.category}>
      {editing ? (
        <form className="me-fact-edit" onSubmit={(e) => void save(e)}>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={240} aria-label="Edit this" data-testid="mem-fact-input" autoFocus />
          <div className="row" style={{ gap: 6 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || value.trim().length < 3} data-testid="mem-fact-save">Save</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setValue(fact.value); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          <div className="me-fact-main">
            <span className="me-fact-value">{fact.value}</span>
            <span className="me-fact-meta">
              <FactStatusChip status={fact.status} example={onlyFromExample(fact, sourceById)} />
              <SourceNames fact={fact} sourceById={sourceById} />
            </span>
          </div>
          <div className="me-fact-actions">
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setEditing(true)} aria-label={`Edit: ${fact.value}`} data-testid="mem-fact-edit">{Icons.pencil}</button>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => void remove()} disabled={busy} aria-label={`Remove: ${fact.value}`} data-testid="mem-fact-remove">{Icons.trash}</button>
          </div>
        </>
      )}
    </li>
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
    <ul className="me-conflict" data-testid="mem-conflict">
      {facts.map((f) => (
        <li key={f.id} className="me-fact" data-testid="mem-fact" data-status={f.status} data-category={f.category}>
          <div className="me-fact-main">
            <span className="me-fact-value">{f.value}</span>
            <span className="me-fact-meta">
              <FactStatusChip status={f.status} example={onlyFromExample(f, sourceById)} />
              <SourceNames fact={f} sourceById={sourceById} />
            </span>
          </div>
          <div className="me-fact-actions">
            <button type="button" className="btn btn-secondary btn-sm" data-testid="mem-fact-keep" disabled={busy} onClick={() => void keep(f)}>Keep this</button>
          </div>
        </li>
      ))}
    </ul>
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
    <li className="me-source" data-testid="mem-source" data-kind={source.kind}>
      <div className="me-source-main">
        <span className="me-source-label">
          {sourceName(source)}
          {source.kind === 'sample' && <ExampleTag />}
        </span>
        <span className="me-source-meta">
          <span className="me-kind">{SOURCE_KIND_LABELS[source.kind]}</span> · {formatDate(source.importedAt)}
          {source.charCount > 0 && ` · ${source.charCount.toLocaleString()} characters`}
        </span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" data-testid="mem-source-remove" disabled={busy} onClick={() => void remove()}>Remove</button>
    </li>
  );
}

// ---------- a capture (something shared with Ori) ----------

export function CaptureRow({ capture, onForget }: { capture: Capture; onForget: (id: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function forget() {
    if (busy) return;
    setBusy(true);
    await onForget(capture.id);
    setBusy(false);
  }
  const headline = capture.text ? truncate(capture.text, 140) : capture.linkMeta?.title ?? capture.url ?? 'Photo';
  return (
    <li className="me-capture" data-testid="mem-capture" data-kind={capture.kind} data-status={capture.readStatus}>
      <span className="me-capture-icon" aria-hidden="true">{capture.kind === 'image' ? Icons.image : capture.kind === 'link' ? Icons.link : Icons.agent}</span>
      <div className="me-capture-main">
        <span className="me-capture-text">{headline}</span>
        <span className="me-capture-meta">
          {photoWords(capture.sourceLabel)} · {photoWords(readStatusLabel(capture))} · {relativeTime(capture.createdAt)}
          {capture.isExample && <ExampleTag />}
        </span>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" data-testid="mem-capture-forget" disabled={busy} onClick={() => void forget()}>Forget</button>
    </li>
  );
}

// ---------- add an interest ----------

interface AddInterestProps {
  onAdd: (interest: string) => Promise<boolean>;
  placeholder?: string;
  buttonLabel?: string;
  testId?: string;
  inputTestId?: string;
  label?: string;
}

export function AddInterestForm({
  onAdd,
  placeholder = 'e.g. birdwatching, learning Italian, a weekly dinner with friends',
  buttonLabel = 'Add',
  testId = 'mem-add-interest',
  inputTestId = 'mem-add-interest-input',
  label = 'An interest to add',
}: AddInterestProps) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = value.trim();
    if (v.length < 2 || busy) return;
    setBusy(true);
    const ok = await onAdd(v);
    setBusy(false);
    if (ok) setValue('');
  }
  return (
    <form className="st-inline-form" onSubmit={(e) => void submit(e)}>
      <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} maxLength={120} aria-label={label} data-testid={inputTestId} />
      <button type="submit" className="btn btn-primary" data-testid={testId} disabled={busy || value.trim().length < 2}>
        {busy ? 'Adding…' : buttonLabel}
      </button>
    </form>
  );
}
