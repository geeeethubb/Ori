/**
 * Stage columns (one per option of the stage field), horizontally scrollable on phones.
 * Due badges and the attention strip come from the shared due-soon rule.
 */
import { useMemo, useState } from 'react';
import type { AppSpec, DueSoonRule, FieldSpec, SelectOption } from '@shared/appSpec.ts';
import { ICON_GRADIENTS } from '@shared/icons.ts';
import { recordTitle, type AppRecord } from '@shared/records.ts';
import { dueLabel, dueRuleFor, dueStatus, summarizeDue } from '@shared/rules.ts';
import { ErrorBanner } from '../components/ui.tsx';
import { FieldList } from './ValueDisplay.tsx';
import { pressable } from './runtimeUtils.ts';
import { boardCardFields, boardLayout, dueBadgeClass, dueSummaryLine, type BoardColumn, type BoardViewSpec, type SelectFieldSpec } from './viewLogic.ts';
import './appViews.css';

interface Props {
  spec: AppSpec;
  view: BoardViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  onMove?: (record: AppRecord, stage: string) => void;
}

const OTHER: SelectOption = { value: '__other', label: 'Other' };

export function BoardView({ spec, view, records, onEdit, onMove }: Props) {
  const rule = useMemo(() => dueRuleFor(spec, view.dueFieldId), [spec, view.dueFieldId]);
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const summary = useMemo(() => (rule ? summarizeDue(records, rule) : null), [records, rule]);
  const attentionIds = useMemo(() => (summary ? new Set(summary.attention.map((r) => r.id)) : null), [summary]);
  const filtering = filter === 'attention' && attentionIds !== null;
  const layout = useMemo(
    () => boardLayout(spec, view, records, rule, filtering && attentionIds ? (r) => attentionIds.has(r.id) : undefined),
    [spec, view, records, rule, filtering, attentionIds],
  );
  const cardFields = useMemo(() => boardCardFields(spec, view), [spec, view]);

  if (!layout.stageField) return <ErrorBanner message="This board is missing its stage field. Use Settings to make a change." />;
  const stageField = layout.stageField;
  const shownCount = layout.columns.reduce((n, c) => n + c.records.length, 0) + layout.other.length;
  const noun = spec.entryNoun;

  return (
    <div className="rt-board-wrap" data-testid="rt-board">
      {rule && summary && (
        <div className="rt-attention">
          <div className="rt-filter-chips" role="group" aria-label="Show">
            <button type="button" className="rt-filter-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </button>
            <button type="button" className="rt-filter-chip" aria-pressed={filter === 'attention'} onClick={() => setFilter('attention')} data-testid="rt-attention-filter">
              {rule.label ?? 'Needs attention'} ({summary.attention.length})
            </button>
          </div>
          <p className="small muted rt-due-line" data-testid="rt-due-summary">
            {dueSummaryLine({ overdue: summary.overdue.length, dueToday: summary.dueToday.length, dueSoon: summary.dueSoon.length }) || 'Nothing needs attention right now.'}
          </p>
        </div>
      )}
      {filtering && shownCount === 0 && <p className="small muted">Nothing needs attention. Switch to All to see every {noun.singular}.</p>}
      <div className="rt-board" role="list" aria-label={`${view.title ?? spec.name} board`}>
        {layout.columns.map((col) => (
          <Column key={col.option.value} col={col} spec={spec} view={view} stageField={stageField} rule={rule} cardFields={cardFields} onEdit={onEdit} onMove={onMove} />
        ))}
        {layout.other.length > 0 && (
          <Column col={{ option: OTHER, done: false, records: layout.other }} spec={spec} view={view} stageField={stageField} rule={rule} cardFields={cardFields} onEdit={onEdit} onMove={onMove} />
        )}
      </div>
    </div>
  );
}

interface ColumnProps {
  col: BoardColumn;
  spec: AppSpec;
  view: BoardViewSpec;
  stageField: SelectFieldSpec;
  rule: DueSoonRule | undefined;
  cardFields: FieldSpec[];
  onEdit?: (record: AppRecord) => void;
  onMove?: (record: AppRecord, stage: string) => void;
}

function Column({ col, spec, view, stageField, rule, cardFields, onEdit, onMove }: ColumnProps) {
  const color = col.option.color ? ICON_GRADIENTS[col.option.color][0] : undefined;
  return (
    <section className={`rt-col${col.done ? ' rt-col-done' : ''}`} data-testid={`rt-board-column-${col.option.value}`} role="listitem">
      <header className="rt-col-head">
        <span className="rt-col-title">
          {color && <span className="rt-dot" style={{ background: color }} aria-hidden="true" />}
          {col.option.label}
        </span>
        <span className="rt-col-count" aria-label={`${col.records.length} ${col.records.length === 1 ? spec.entryNoun.singular : spec.entryNoun.plural}`}>
          {col.records.length}
        </span>
      </header>
      <div className="rt-col-cards">
        {col.records.map((r) => (
          <Card key={r.id} record={r} spec={spec} view={view} stageField={stageField} rule={rule} cardFields={cardFields} onEdit={onEdit} onMove={onMove} />
        ))}
        {col.records.length === 0 && <p className="rt-col-empty tiny faint">Nothing here yet</p>}
      </div>
    </section>
  );
}

interface CardProps extends Omit<ColumnProps, 'col'> {
  record: AppRecord;
}

function Card({ record, spec, view, stageField, rule, cardFields, onEdit, onMove }: CardProps) {
  const title = recordTitle(spec, record, view.titleFieldId);
  const status = rule ? dueStatus(record, rule) : 'none';
  const due = rule ? record.values[rule.dateFieldId] : undefined;
  const badge = rule && status !== 'none' ? dueLabel(status, typeof due === 'string' ? due : undefined) : '';
  const stage = record.values[stageField.id];
  const stageValue = typeof stage === 'string' ? stage : '';
  const known = stageField.options.some((o) => o.value === stageValue);
  return (
    <article className="card rt-card" data-testid="rt-card">
      <div className={`rt-card-body${onEdit ? ' rt-pressable' : ''}`} {...pressable(onEdit ? () => onEdit(record) : undefined)}>
        <div className="rt-card-top">
          <h4 className="rt-card-title">{title}</h4>
          {badge && <span className={dueBadgeClass(status)}>{badge}</span>}
        </div>
        <FieldList fields={cardFields} values={record.values} variant="compact" />
      </div>
      {onMove && (
        <div className="rt-card-foot">
          <select
            className="select rt-move"
            data-testid={`rt-move-${record.id}`}
            aria-label={`Move ${title}`}
            value={known ? stageValue : ''}
            onChange={(e) => {
              if (e.target.value) onMove(record, e.target.value);
            }}
          >
            {!known && <option value="">Choose a stage</option>}
            {stageField.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </article>
  );
}
