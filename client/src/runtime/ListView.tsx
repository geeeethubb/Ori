/** Sorted rows: stacked cards on phones, a table from 720px up. Tap a row to edit. */
import { useMemo } from 'react';
import { fieldById, type AppSpec } from '@shared/appSpec.ts';
import { recordTitle, type AppRecord } from '@shared/records.ts';
import { FieldList, ValueDisplay } from './ValueDisplay.tsx';
import { pressable, useMediaQuery } from './runtimeUtils.ts';
import { listColumns, listRows, type ListViewSpec } from './viewLogic.ts';
import './appViews.css';

interface Props {
  spec: AppSpec;
  view: ListViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
}

export function ListView({ spec, view, records, onEdit }: Props) {
  const wide = useMediaQuery('(min-width: 720px)');
  const rows = useMemo(() => listRows(spec, view, records), [spec, view, records]);
  const cols = useMemo(() => listColumns(spec, view), [spec, view]);
  const titleLabel = fieldById(spec, view.titleFieldId)?.label ?? 'Title';

  if (wide) {
    return (
      <div className="card rt-table-card" data-testid="rt-list">
        <table className="rt-table">
          <thead>
            <tr>
              <th scope="col">{titleLabel}</th>
              {cols.map((c) => (
                <th key={c.id} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="rt-row" className={onEdit ? 'rt-pressable' : undefined} {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                <td className="rt-row-title">{recordTitle(spec, r, view.titleFieldId)}</td>
                {cols.map((c) => (
                  <td key={c.id}>
                    <ValueDisplay field={c} value={r.values[c.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ul className="rt-rows" data-testid="rt-list">
      {rows.map((r) => (
        <li key={r.id} className={`card rt-row${onEdit ? ' rt-pressable' : ''}`} data-testid="rt-row" {...pressable(onEdit ? () => onEdit(r) : undefined)}>
          <div className="rt-row-title">{recordTitle(spec, r, view.titleFieldId)}</div>
          <FieldList fields={cols} values={r.values} variant="inline" />
        </li>
      ))}
    </ul>
  );
}
