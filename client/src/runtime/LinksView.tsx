/**
 * Saved sources (songs, lessons, articles): one row each with a small glyph for its kind, the title,
 * the kind and host, a note on why it mattered, and Open (a new tab). Nothing is fetched, embedded or
 * played here; the person opens the source themselves.
 */
import { useMemo, type ReactNode } from 'react';
import { fieldById, type AppSpec } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { EmptyState, Glyph, Icons } from '../components/ui.tsx';
import { ValueDisplay } from './ValueDisplay.tsx';
import { linkHost, linkRows, sourceGlyph, type LinksViewSpec } from './viewLogic.ts';
import './appViews.css';

interface Props {
  spec: AppSpec;
  view: LinksViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  /** The primary action (add a link), shown in the empty state. */
  action?: ReactNode;
}

export function LinksView({ spec, view, records, onEdit, action }: Props) {
  const rows = useMemo(() => linkRows(records), [records]);
  const kindField = fieldById(spec, view.kindFieldId);
  const tagsField = fieldById(spec, view.tagsFieldId);

  if (!rows.length) {
    return <EmptyState title="Nothing saved yet" body="Keep the links you want to come back to. A link and one line about why is enough." action={action} />;
  }

  return (
    <ul className="rt-links src-cards" data-testid="rt-links" aria-label={view.title ?? 'Saved sources'}>
      {rows.map((r) => {
        const url = typeof r.values[view.urlFieldId] === 'string' ? (r.values[view.urlFieldId] as string).trim() : '';
        const host = linkHost(url);
        const titleRaw = view.titleFieldId ? r.values[view.titleFieldId] : undefined;
        const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : host || 'Saved link';
        const note = view.noteFieldId ? r.values[view.noteFieldId] : undefined;
        const kind = kindField?.type === 'select' ? kindField.options.find((o) => o.value === r.values[kindField.id])?.label : undefined;
        const meta = [kind, host && host !== title ? host : ''].filter(Boolean).join(' · ');
        const glyph = sourceGlyph(kind);
        const safe = /^https?:\/\//i.test(url);
        return (
          <li key={r.id} className="src-card" data-testid="rt-link-item">
            <span className="src-thumb" data-glyph={glyph} aria-hidden="true">
              <Glyph symbol={glyph} size={20} />
            </span>
            <div className="src-text">
              <h4 className="src-title">{title}</h4>
              {meta && <span className="src-meta">{meta}</span>}
              {typeof note === 'string' && note.trim() && <p className="src-note">{note}</p>}
              {tagsField && <ValueDisplay field={tagsField} value={r.values[tagsField.id]} />}
            </div>
            <div className="src-actions">
              {safe && (
                <a className="btn btn-secondary btn-sm src-open" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title} in a new tab`} data-testid="rt-link-open">
                  {Icons.external}
                  Open
                </a>
              )}
              {onEdit && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(r)} aria-label={`Edit ${title}`}>
                  Edit
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
