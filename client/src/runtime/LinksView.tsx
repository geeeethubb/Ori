/**
 * Saved sources (songs, lessons, articles): host and title, a note on why it mattered, a kind chip,
 * and a link out in a new tab. Nothing is fetched or embedded; the person opens the source themselves.
 */
import { useMemo, type ReactNode } from 'react';
import { fieldById, type AppSpec } from '@shared/appSpec.ts';
import { ICON_GRADIENTS } from '@shared/icons.ts';
import type { AppRecord } from '@shared/records.ts';
import { EmptyState, Icons } from '../components/ui.tsx';
import { ValueDisplay } from './ValueDisplay.tsx';
import { linkHost, linkRows, type LinksViewSpec } from './viewLogic.ts';

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
    return <EmptyState title="Nothing saved yet" body="Keep the songs, lessons and riffs you want to come back to. A link and one line about why is enough." action={action} />;
  }

  return (
    <ul className="rt-links" data-testid="rt-links" aria-label={view.title ?? 'Saved sources'}>
      {rows.map((r) => {
        const url = typeof r.values[view.urlFieldId] === 'string' ? (r.values[view.urlFieldId] as string).trim() : '';
        const host = linkHost(url);
        const titleRaw = view.titleFieldId ? r.values[view.titleFieldId] : undefined;
        const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : host || 'Saved link';
        const note = view.noteFieldId ? r.values[view.noteFieldId] : undefined;
        const kind = kindField?.type === 'select' ? kindField.options.find((o) => o.value === r.values[kindField.id]) : undefined;
        const safe = /^https?:\/\//i.test(url);
        return (
          <li key={r.id} className="card rt-link-item" data-testid="rt-link-item">
            <div className="rt-link-main">
              <div className="rt-link-meta">
                {kind && (
                  <span className="rt-kind-chip">
                    {kind.color && <span className="rt-dot" style={{ background: ICON_GRADIENTS[kind.color][0] }} aria-hidden="true" />}
                    {kind.label}
                  </span>
                )}
                {host && title !== host && <span className="rt-link-host">{host}</span>}
              </div>
              <h4 className="rt-link-title">{title}</h4>
              {typeof note === 'string' && note.trim() && <p className="rt-link-note">{note}</p>}
              {tagsField && <ValueDisplay field={tagsField} value={r.values[tagsField.id]} />}
            </div>
            <div className="rt-link-actions">
              {safe && (
                <a className="btn btn-secondary rt-link-open" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${title} in a new tab`} data-testid="rt-link-open">
                  {Icons.external}
                  Open
                </a>
              )}
              {onEdit && (
                <button type="button" className="btn btn-ghost" onClick={() => onEdit(r)} aria-label={`Edit ${title}`}>
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
