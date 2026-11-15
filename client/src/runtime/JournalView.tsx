/** Dated entries grouped by day, newest first by default. Tap an entry to edit it. */
import { useMemo } from 'react';
import type { AppSpec } from '@shared/appSpec.ts';
import { recordTitle, type AppRecord } from '@shared/records.ts';
import { friendlyDate, parseIsoDate } from '@shared/time.ts';
import { FieldList } from './ValueDisplay.tsx';
import { pressable } from './runtimeUtils.ts';
import { journalFields, journalGroups, type JournalViewSpec } from './viewLogic.ts';
import './appViews.css';

interface Props {
  spec: AppSpec;
  view: JournalViewSpec;
  records: AppRecord[];
  /** Omitted when the app is read-only (offline copy). */
  onEdit?: (record: AppRecord) => void;
}

function longDate(iso: string): string {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : iso;
}

const RELATIVE = new Set(['Today', 'Yesterday', 'Tomorrow']);

export function JournalView({ spec, view, records, onEdit }: Props) {
  const groups = useMemo(() => journalGroups(view, records), [view, records]);
  const fields = useMemo(() => journalFields(spec, view), [spec, view]);
  const plural = spec.entryNoun.plural;

  return (
    <div className="rt-entries" data-testid="rt-journal">
      {groups.map((g) => {
        const label = g.date ? friendlyDate(g.date) : 'Undated';
        return (
          <section key={g.date || 'undated'} className="rt-day">
            <div className="rt-date-heading">
              <h3>{label}</h3>
              {RELATIVE.has(label) && <span className="tiny faint">{longDate(g.date)}</span>}
              {g.records.length > 1 && <span className="tiny faint rt-day-count">{`${g.records.length} ${plural}`}</span>}
            </div>
            <div className="rt-day-entries">
              {g.records.map((r) => (
                <article key={r.id} className={`card rt-entry${onEdit ? ' rt-pressable' : ''}`} data-testid="rt-entry" {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                  <h4 className="rt-entry-title">{recordTitle(spec, r, view.titleFieldId)}</h4>
                  <FieldList fields={fields} values={r.values} />
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
