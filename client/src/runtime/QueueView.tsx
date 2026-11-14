/**
 * People-style next-action queue: compact items (initials, action, context, due, channel) grouped by
 * due state or by person, completed with one tap. Message drafts can be copied; nothing is ever sent.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { fieldById, type AppSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { dueLabel, dueStatus } from '@shared/rules.ts';
import { EmptyState, Icons, useToast } from '../components/ui.tsx';
import { copyText, pressable } from './runtimeUtils.ts';
import {
  completionPatch,
  draftFieldFor,
  dueBadgeClass,
  personInitials,
  personName,
  personShortName,
  queueByPerson,
  queueGroups,
  queueRule,
  snippet,
  type QueueViewSpec,
} from './viewLogic.ts';

interface Props {
  spec: AppSpec;
  view: QueueViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  /** Applies a values patch (completion); omitted when read-only. */
  onPatch?: (record: AppRecord, patch: RecordValues) => Promise<void>;
  /** Called the first time an action is completed from this queue. */
  onCompleted?: (record: AppRecord) => void;
  action?: ReactNode;
}

export function QueueView({ spec, view, records, onEdit, onPatch, onCompleted, action }: Props) {
  const [grouping, setGrouping] = useState<'due' | 'person'>(view.groupBy);
  const rule = useMemo(() => queueRule(spec, view), [spec, view]);
  const dueGroups = useMemo(() => queueGroups(spec, view, records), [spec, view, records]);
  const people = useMemo(() => (grouping === 'person' ? queueByPerson(spec, view, records) : []), [grouping, spec, view, records]);
  const draftField = useMemo(() => draftFieldFor(spec), [spec]);
  const channelField = fieldById(spec, view.channelFieldId);
  const noun = spec.entryNoun;

  if (!records.length) {
    return <EmptyState title={`No ${noun.plural} yet`} body={spec.emptyStateHint ?? 'Add the last person you promised something to.'} action={action} />;
  }

  const openCount = records.length - (dueGroups.find((g) => g.key === 'done')?.records.length ?? 0);
  const itemProps = { spec, view, rule, draftField, channelField, onEdit, onPatch, onCompleted };

  return (
    <div className="rt-queue" data-testid="rt-queue">
      <div className="rt-queue-bar">
        <p className="small muted rt-queue-count" data-testid="rt-queue-open-count">
          {openCount === 0 ? 'Everything is done.' : `${openCount} open ${openCount === 1 ? noun.singular : noun.plural}`}
        </p>
        <div className="segmented rt-grouping" role="group" aria-label="Group by">
          <button type="button" aria-pressed={grouping === 'due'} onClick={() => setGrouping('due')} data-testid="rt-queue-group-by-due">
            By due date
          </button>
          <button type="button" aria-pressed={grouping === 'person'} onClick={() => setGrouping('person')} data-testid="rt-queue-group-by-person">
            By person
          </button>
        </div>
      </div>

      {grouping === 'due'
        ? dueGroups
            .filter((g) => g.records.length > 0)
            .map((g) =>
              g.key === 'done' ? (
                <details key={g.key} className="rt-queue-group rt-queue-done" data-testid={`rt-queue-group-${g.key}`} open={openCount === 0}>
                  <summary className="rt-queue-head">
                    <span className="rt-queue-label">{g.label}</span>
                    <span className="rt-queue-n">{g.records.length}</span>
                  </summary>
                  <ul className="rt-queue-list">
                    {g.records.map((r) => (
                      <QueueItem key={r.id} record={r} {...itemProps} />
                    ))}
                  </ul>
                </details>
              ) : (
                <section key={g.key} className={`rt-queue-group rt-queue-${g.key}`} data-testid={`rt-queue-group-${g.key}`}>
                  <header className="rt-queue-head">
                    <span className="rt-queue-label">{g.label}</span>
                    <span className="rt-queue-n">{g.records.length}</span>
                  </header>
                  <ul className="rt-queue-list">
                    {g.records.map((r) => (
                      <QueueItem key={r.id} record={r} {...itemProps} />
                    ))}
                  </ul>
                </section>
              ),
            )
        : people.map((p) => (
            <section key={p.key} className="rt-queue-group rt-queue-person" data-testid="rt-queue-person">
              <header className="rt-queue-head rt-queue-person-head">
                <span className="rt-avatar" aria-hidden="true">
                  {personInitials(p.label)}
                </span>
                <span className="rt-queue-label">{p.label}</span>
                <span className="rt-queue-n">{p.openCount === 0 ? 'all done' : `${p.openCount} open`}</span>
              </header>
              <ul className="rt-queue-list">
                {p.records.map((r) => (
                  <QueueItem key={r.id} record={r} {...itemProps} hideAvatar />
                ))}
              </ul>
            </section>
          ))}
    </div>
  );
}

interface ItemProps {
  spec: AppSpec;
  view: QueueViewSpec;
  rule: ReturnType<typeof queueRule>;
  draftField: ReturnType<typeof draftFieldFor>;
  channelField: ReturnType<typeof fieldById>;
  record: AppRecord;
  onEdit?: (record: AppRecord) => void;
  onPatch?: (record: AppRecord, patch: RecordValues) => Promise<void>;
  onCompleted?: (record: AppRecord) => void;
  hideAvatar?: boolean;
}

function QueueItem({ spec, view, rule, draftField, channelField, record, onEdit, onPatch, onCompleted, hideAvatar }: ItemProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const status = dueStatus(record, rule);
  const done = status === 'done';
  const person = personName(view, record);
  const actionRaw = record.values[view.actionFieldId];
  const actionText = typeof actionRaw === 'string' && actionRaw.trim() ? actionRaw.trim() : `Follow up with ${personShortName(person)}`;
  const context = view.contextFieldId ? snippet(record.values[view.contextFieldId]) : '';
  const due = rule.dateFieldId ? record.values[rule.dateFieldId] : undefined;
  const dueText = typeof due === 'string' ? dueLabel(status === 'done' ? 'done' : status, due) : '';
  const channel = channelField?.type === 'select' ? channelField.options.find((o) => o.value === record.values[channelField.id]) : undefined;
  const draft = draftField ? record.values[draftField.id] : undefined;
  const patch = completionPatch(spec, view, record);

  const complete = async () => {
    if (!onPatch || !patch || busy) return;
    setBusy(true);
    try {
      await onPatch(record, patch);
      if (!done) {
        toast('Marked done');
        onCompleted?.(record);
      } else {
        toast('Back in the queue');
      }
    } finally {
      setBusy(false);
    }
  };

  const copyDraft = async () => {
    if (typeof draft !== 'string' || !draft.trim()) return;
    const ok = await copyText(draft);
    toast(ok ? 'Draft copied. Nothing was sent.' : 'Could not copy. Select the draft text instead.', ok ? undefined : { kind: 'error' });
  };

  return (
    <li className={`rt-queue-item${done ? ' is-done' : ''}`} data-testid="rt-queue-item" data-status={status}>
      {!hideAvatar && (
        <span className="rt-avatar" aria-hidden="true">
          {personInitials(person)}
        </span>
      )}
      <div className={`rt-queue-main${onEdit ? ' rt-pressable' : ''}`} {...pressable(onEdit ? () => onEdit(record) : undefined)} aria-label={onEdit ? `Edit ${actionText}` : undefined}>
        <div className="rt-queue-action">{actionText}</div>
        <div className="rt-queue-who">
          <span className="rt-queue-person-name">{personShortName(person)}</span>
          {dueText && <span className={`rt-queue-due ${dueBadgeClass(status)}`}>{dueText}</span>}
          {channel && <span className="rt-kind-chip">{channel.label}</span>}
        </div>
        {context && <p className="rt-queue-context">{context}</p>}
        {typeof draft === 'string' && draft.trim() && (
          <button type="button" className="btn btn-sm btn-ghost rt-copy-draft" onClick={(e) => { e.stopPropagation(); void copyDraft(); }} data-testid={`rt-queue-copy-${record.id}`}>
            Copy draft
          </button>
        )}
      </div>
      <button
        type="button"
        className="rt-done-btn"
        aria-pressed={done}
        aria-label={done ? `Mark "${actionText}" as not done` : `Mark "${actionText}" as done`}
        data-testid={`rt-queue-done-${record.id}`}
        disabled={!onPatch || !patch || busy}
        onClick={() => void complete()}
      >
        {Icons.check}
      </button>
    </li>
  );
}
