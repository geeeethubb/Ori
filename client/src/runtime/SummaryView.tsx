/** Metric tiles computed from the records, plus the three most recent entries. */
import { useMemo } from 'react';
import type { AppSpec } from '@shared/appSpec.ts';
import { recordTitle, type AppRecord } from '@shared/records.ts';
import { computeMetric } from '@shared/rules.ts';
import { friendlyDate } from '@shared/time.ts';
import { pressable } from './runtimeUtils.ts';
import { recentRecords, recordDate, type SummaryViewSpec } from './viewLogic.ts';

interface Props {
  spec: AppSpec;
  view: SummaryViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
}

export function SummaryView({ spec, view, records, onEdit }: Props) {
  const results = useMemo(() => view.metrics.map((m) => computeMetric(records, m)), [view, records]);
  const other = spec.views.find((v) => v.type === 'journal' || v.type === 'list');
  const recent = useMemo(() => (other ? recentRecords(records, 3) : []), [other, records]);
  const dateFieldId = other?.type === 'journal' ? other.dateFieldId : undefined;

  return (
    <div className="rt-summary" data-testid="rt-summary">
      <div className="rt-metrics" data-n={Math.min(results.length, 4)}>
        {results.map((m) => (
          <div key={m.id} className="rt-metric" data-testid={`rt-metric-${m.id}`}>
            <div className="rt-metric-value">{m.display}</div>
            <div className="rt-metric-label">{m.label}</div>
          </div>
        ))}
      </div>
      {other && recent.length > 0 && (
        <section className="rt-recent" data-testid="rt-recent">
          <h3 className="rt-subhead">Recent</h3>
          <ul className="rt-recent-list">
            {recent.map((r) => (
              <li key={r.id} className={`card rt-recent-item${onEdit ? ' rt-pressable' : ''}`} {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                <span className="rt-recent-title">{recordTitle(spec, r, other.titleFieldId)}</span>
                <span className="tiny faint">{friendlyDate(recordDate(r, dateFieldId))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
