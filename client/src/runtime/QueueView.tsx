/**
 * People-style next-action queue. "Today | Upcoming" filters the open items (due today or overdue;
 * due later or not dated yet). Each compact card shows an initial avatar, the person, the action and
 * a due chip ("Today", "Tomorrow", a weekday, or the person's own words). Expanding a card shows the
 * context, Draft message (copies the draft; with none yet, opens the form at the draft field) and
 * Mark done with Undo. Nothing is ever sent. A date suggested from the person's words is only set
 * when they confirm it. A queue grouped by person keeps each person's items together in the tab.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { fieldById, type AppSpec, type FieldSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { dueStatus } from '@shared/rules.ts';
import { parseIsoDate, suggestDateFor } from '@shared/time.ts';
import { ApiError } from '../api.ts';
import { EmptyState, Icons, Sheet, useToast } from '../components/ui.tsx';
import { RecordForm } from './RecordForm.tsx';
import { copyText } from './runtimeUtils.ts';
import {
  avatarTone,
  completionPatch,
  draftFieldFor,
  dueChip,
  focusCandidates,
  personGroups,
  personInitials,
  personName,
  personNote,
  personShortName,
  queueDateField,
  queueRule,
  queueTabs,
  shortDay,
  type QueueTab,
  type QueueViewSpec,
} from './viewLogic.ts';
import './appViews.css';

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

/**
 * The values that undo a completion: each key it changed goes back to what the item had, so a staged
 * item returns to its own stage (not the first open one). A key the item had no value for takes
 * `fallback`'s (the plain toggle back), or null.
 */
export function undoPatch(record: AppRecord, patch: RecordValues, fallback?: RecordValues | null): RecordValues {
  const out: RecordValues = {};
  for (const k of Object.keys(patch)) {
    const before = record.values[k];
    out[k] = before !== undefined && before !== null ? before : (fallback?.[k] ?? null);
  }
  return out;
}

export function QueueView({ spec, view, records, onEdit, onPatch, onCompleted, action }: Props) {
  const rule = useMemo(() => queueRule(spec, view), [spec, view]);
  const lists = useMemo(() => queueTabs(spec, view, records), [spec, view, records]);
  const draftField = useMemo(() => draftFieldFor(spec, view), [spec, view]);
  const channelField = fieldById(spec, view.channelFieldId);
  /** The tab the person picked. */
  const [chosen, setChosen] = useState<QueueTab | null>(null);
  /**
   * The tab the queue opened on: Today, unless only later items were open. Decided once, so finishing
   * today's last item shows "Nothing due today." instead of switching tabs under the person.
   */
  const opening = useRef<QueueTab | null>(null);
  if (opening.current === null && records.length) opening.current = lists.today.length || !lists.upcoming.length ? 'today' : 'upcoming';
  /** Which card is open: undefined → the first of the tab, null → none, else that card. */
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const [drafting, setDrafting] = useState<AppRecord | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Where focus goes once the control the person used leaves with its item (ids, in order of preference). */
  const focusPlan = useRef<string[] | null>(null);
  const groupsId = useId();
  const noun = spec.entryNoun;

  // Mark done, Set <date>, Reopen and Undo remove the control the person used. Focus then moves to the
  // item (when still listed), the next one, the one before, or the tab, instead of falling to the page.
  useEffect(() => {
    const plan = focusPlan.current;
    const root = rootRef.current;
    if (!plan || !root) return;
    const active = document.activeElement;
    // The control is still there: the change has not landed yet.
    if (active && active !== document.body && root.contains(active)) return;
    focusPlan.current = null;
    // The person moved on (the toast's Undo, another control): focus stays where they put it.
    if (active && active !== document.body) return;
    const targets = [...root.querySelectorAll<HTMLElement>('[data-qfocus]')].filter((el) => !el.closest('[hidden], details:not([open])'));
    const target = plan.map((id) => targets.find((el) => el.dataset.qfocus === id)).find(Boolean) ?? root.querySelector<HTMLElement>('.que-tabs [aria-pressed="true"]');
    target?.focus();
  });

  if (!records.length) {
    return <EmptyState title={`No ${noun.plural} yet`} body={spec.emptyStateHint ?? 'Add the last person you promised something to.'} action={action} />;
  }

  const tab: QueueTab = chosen ?? opening.current ?? 'today';
  const tabItems = tab === 'today' ? lists.today : lists.upcoming;
  // Grouped by person: each person's items sit together, people in the order of their soonest item.
  const groups = view.groupBy === 'person' ? personGroups(view, tabItems) : null;
  const shown = groups ? groups.flatMap((g) => g.records) : tabItems;
  const order = shown.map((r) => r.id);
  const doneOrder = lists.done.map((r) => r.id);
  const openId = expanded === undefined ? (shown[0]?.id ?? null) : expanded;
  const choose = (next: QueueTab) => {
    setChosen(next);
    setExpanded(undefined);
  };
  /** Notes where focus goes if the item leaves; the returned function drops the plan once the action is over. */
  const planFocus = (candidates: string[]) => {
    focusPlan.current = candidates;
    return () => {
      if (focusPlan.current === candidates) focusPlan.current = null;
    };
  };
  const shared = { spec, view, rule, onPatch, onCompleted };
  const allDone = !lists.today.length && !lists.upcoming.length;
  const listLabel = tab === 'today' ? 'Due today or overdue' : 'Due later or not dated yet';
  const card = (r: AppRecord) => (
    <QueueCard
      key={r.id}
      record={r}
      {...shared}
      draftField={draftField}
      channelField={channelField}
      onEdit={onEdit}
      onDraft={onPatch ? setDrafting : undefined}
      onAct={(keepSelf) => planFocus(focusCandidates(order, r.id, keepSelf))}
      open={openId === r.id}
      onToggle={() => setExpanded(openId === r.id ? null : r.id)}
    />
  );

  return (
    <div className="rt-queue que" data-testid="rt-queue" ref={rootRef}>
      <div className="que-tabs" role="group" aria-label={`Show ${noun.plural}`}>
        <button type="button" aria-pressed={tab === 'today'} onClick={() => choose('today')} data-testid="rt-queue-tab-today">
          Today
          <span className="que-tab-n">{lists.today.length}</span>
        </button>
        <button type="button" aria-pressed={tab === 'upcoming'} onClick={() => choose('upcoming')} data-testid="rt-queue-tab-upcoming">
          Upcoming
          <span className="que-tab-n">{lists.upcoming.length}</span>
        </button>
      </div>

      {shown.length > 0 && groups ? (
        <div className="que-people" role="group" aria-label={listLabel} data-testid={`rt-queue-list-${tab}`}>
          {groups.map((g, i) => (
            <section key={g.key} className="que-person" aria-labelledby={`${groupsId}-${i}`} data-testid="rt-queue-person">
              <h3 className="que-person-name" id={`${groupsId}-${i}`}>
                {g.label}
                <span className="que-tab-n">{g.records.length}</span>
              </h3>
              <ul className="que-list">{g.records.map(card)}</ul>
            </section>
          ))}
        </div>
      ) : shown.length > 0 ? (
        <ul className="que-list" aria-label={listLabel} data-testid={`rt-queue-list-${tab}`}>
          {shown.map(card)}
        </ul>
      ) : (
        <div className="que-empty" data-testid={`rt-queue-empty-${tab}`}>
          <p>{allDone ? `Nothing is waiting. Every ${noun.singular} is done.` : tab === 'today' ? 'Nothing due today.' : 'Nothing coming up after today.'}</p>
          {tab === 'today' && lists.upcoming.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose('upcoming')}>
              See what is coming up
            </button>
          )}
          {tab === 'upcoming' && lists.today.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => choose('today')}>
              Back to today
            </button>
          )}
        </div>
      )}

      {lists.done.length > 0 && (
        <details className="que-done" data-testid="rt-queue-group-done">
          <summary>
            <span>Done</span>
            <span className="que-tab-n">{lists.done.length}</span>
          </summary>
          <ul className="que-done-list">
            {lists.done.map((r) => (
              <DoneRow key={r.id} record={r} {...shared} onEdit={onEdit} onAct={(keepSelf) => planFocus(focusCandidates(doneOrder, r.id, keepSelf))} />
            ))}
          </ul>
        </details>
      )}

      {drafting && draftField && onPatch && (
        <DraftSheet spec={spec} record={drafting} field={draftField} person={personShortName(personName(view, drafting))} onPatch={onPatch} onClose={() => setDrafting(null)} />
      )}
    </div>
  );
}

/** Notes where focus goes if the item leaves its place (keepSelf: it stays listed); returns the call that ends the plan. */
type FocusPlanner = (keepSelf: boolean) => () => void;

/** Marks an item done (with Undo that puts back what it had) or reopens it. */
function useCompletion(spec: AppSpec, view: QueueViewSpec, record: AppRecord, onPatch?: Props['onPatch'], onCompleted?: Props['onCompleted'], onAct?: FocusPlanner) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const patch = completionPatch(spec, view, record);
  const done = dueStatus(record, queueRule(spec, view)) === 'done';
  const toggle = async () => {
    if (!onPatch || !patch || busy) return;
    setBusy(true);
    // Done leaves the tab (focus goes to the next item); a reopened item comes back to its tab.
    const settle = onAct?.(done);
    try {
      await onPatch(record, patch);
      if (!done) {
        // Undo is a status change on this one item (never a design undo), checked against its latest
        // saved copy, so it cannot overwrite an edit made meanwhile on another device. It puts back the
        // values the item had before.
        const now = { ...record, values: { ...record.values, ...patch } };
        const back = undoPatch(record, patch, completionPatch(spec, view, now));
        const undo = () => {
          const end = onAct?.(true);
          void onPatch(now, back)
            .catch(() => undefined)
            .finally(() => end?.());
        };
        toast('Marked done', { action: { label: 'Undo', onClick: undo }, durationMs: 6000 });
        onCompleted?.(record);
      } else {
        toast('Back in the queue');
      }
    } catch {
      /* the parent already reported it */
    } finally {
      setBusy(false);
      settle?.();
    }
  };
  return { busy, patch, toggle };
}

/** The draft field alone, in the app's own record form: written here, saved on the item, copied by the person. */
function DraftSheet({ spec, record, field, person, onPatch, onClose }: { spec: AppSpec; record: AppRecord; field: FieldSpec; person: string; onPatch: NonNullable<Props['onPatch']>; onClose: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  return (
    <Sheet open onClose={onClose} title={`Message to ${person}`}>
      <RecordForm
        spec={spec}
        appId={record.appId}
        fields={[field]}
        initial={record}
        // Its own draft: an unsaved change in Edit details is never restored here, or sent with the message.
        editScope="message"
        focusFieldId={field.id}
        submitting={saving}
        submitLabel="Save draft"
        note="Write it here, then copy it into the app you send messages with. Nothing is sent from here."
        onCancel={onClose}
        onSubmit={async (values) => {
          setSaving(true);
          try {
            await saveMessageDraft(() => onPatch(record, values), { saved: () => toast('Draft saved. Nothing is sent.'), close: onClose });
          } finally {
            setSaving(false);
          }
        }}
      />
    </Sheet>
  );
}

/**
 * Saves a message draft once. Refused because the item changed on another device since the sheet opened
 * (409 record_conflict): nothing was overwritten (the parent says so) and the card now shows the latest
 * copy, so the sheet closes and a second Save cannot go over it. Every failure is passed on, so the form
 * keeps what it may (never over the newer copy).
 */
export async function saveMessageDraft(save: () => Promise<void>, after: { saved: () => void; close: () => void }): Promise<void> {
  try {
    await save();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'record_conflict') after.close();
    throw err;
  }
  after.saved();
  after.close();
}

/** Text as it was written (line breaks kept), clamped to a few lines with Show all when it runs longer. */
function ClampText({ text, className, open, onToggle, textRef, testId }: { text: string; className: string; open: boolean; onToggle: () => void; textRef?: RefObject<HTMLParagraphElement | null>; testId?: string }) {
  const id = useId();
  const own = useRef<HTMLParagraphElement>(null);
  const ref = textRef ?? own;
  const [overflows, setOverflows] = useState(false);
  // Measured while clamped (and again when the card opens or the width changes); kept while open.
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open, ref]);
  return (
    <>
      <p id={id} ref={ref} className={`${className} rt-prewrap${open ? '' : ' is-clamped'}`} data-testid={testId}>
        {text}
      </p>
      {overflows && (
        <button type="button" className="btn btn-ghost btn-sm que-more" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          {open ? 'Show less' : 'Show all'}
        </button>
      )}
    </>
  );
}

interface SharedProps {
  spec: AppSpec;
  view: QueueViewSpec;
  rule: ReturnType<typeof queueRule>;
  record: AppRecord;
  onPatch?: (record: AppRecord, patch: RecordValues) => Promise<void>;
  onCompleted?: (record: AppRecord) => void;
}

interface CardProps extends SharedProps {
  draftField?: FieldSpec;
  channelField?: FieldSpec;
  open: boolean;
  onToggle: () => void;
  onEdit?: (record: AppRecord) => void;
  /** Opens the form at the draft field (an item with no draft yet); omitted when read-only. */
  onDraft?: (record: AppRecord) => void;
  /** Called before an action that can take this item's control away, so focus has somewhere to go. */
  onAct?: FocusPlanner;
}

function actionOf(view: QueueViewSpec, record: AppRecord, name: string): string {
  const raw = record.values[view.actionFieldId];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : `Follow up with ${name}`;
}

function QueueCard({ spec, view, rule, record, onPatch, onCompleted, draftField, channelField, open, onToggle, onEdit, onDraft, onAct }: CardProps) {
  const { toast } = useToast();
  const detailId = useId();
  const completion = useCompletion(spec, view, record, onPatch, onCompleted, onAct);
  const [settingDate, setSettingDate] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const draftRef = useRef<HTMLParagraphElement>(null);
  const status = dueStatus(record, rule);
  const full = personName(view, record);
  const name = personShortName(full);
  const actionText = actionOf(view, record, name);
  // The date the queue sorts by: the view's own field, or the app's due rule when the view leaves it to the rule.
  const dateFieldId = queueDateField(rule);
  const due = dateFieldId ? record.values[dateFieldId] : undefined;
  // The person's own words for when are kept as they said them; a date from them is only a suggestion.
  const wordsRaw = view.dueTextFieldId ? record.values[view.dueTextFieldId] : undefined;
  const said = typeof wordsRaw === 'string' ? wordsRaw.trim() : '';
  const chip = dueChip(due, said);
  const dated = typeof due === 'string' && parseIsoDate(due) !== null;
  const suggested = !dated && said && dateFieldId ? suggestDateFor(said) : null;
  const note = personNote(full);
  const contextRaw = view.contextFieldId ? record.values[view.contextFieldId] : undefined;
  const context = typeof contextRaw === 'string' ? contextRaw.trim() : '';
  const channel = channelField?.type === 'select' ? channelField.options.find((o) => o.value === record.values[channelField.id]) : undefined;
  const draftRaw = draftField ? record.values[draftField.id] : undefined;
  const draft = typeof draftRaw === 'string' ? draftRaw.trim() : '';

  const draftMessage = async () => {
    if (!draft) {
      onDraft?.(record);
      return;
    }
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ok = await copyText(draft);
    // The fallback copy borrows focus for a moment; it comes back to the button.
    if (from?.isConnected && document.activeElement !== from) from.focus({ preventScroll: true });
    if (ok) {
      toast('Copied. Nothing is sent.');
      return;
    }
    // Copy is not available here: the whole draft is shown and selected, so the person can copy it themselves.
    setDraftOpen(true);
    window.requestAnimationFrame(() => {
      const el = draftRef.current;
      if (el) window.getSelection()?.selectAllChildren(el);
    });
    toast('Could not copy here. The whole draft is selected on the card: copy it from there.', { kind: 'error' });
  };

  /** Sets the date suggested from the person's words, only because they asked; Undo takes it off again. */
  const confirmDate = async () => {
    if (!onPatch || !suggested || !dateFieldId || settingDate) return;
    const patch: RecordValues = { [dateFieldId]: suggested };
    setSettingDate(true);
    // The button goes once the date is set: focus stays on this item (or its neighbour if it moved tab).
    const settle = onAct?.(true);
    try {
      await onPatch(record, patch);
      const now = { ...record, values: { ...record.values, ...patch } };
      const undo = () => {
        const end = onAct?.(true);
        void onPatch(now, undoPatch(record, patch))
          .catch(() => undefined)
          .finally(() => end?.());
      };
      toast(`Due ${shortDay(suggested)}.`, { action: { label: 'Undo', onClick: undo }, durationMs: 6000 });
    } catch {
      /* the parent already reported it */
    } finally {
      setSettingDate(false);
      settle?.();
    }
  };

  return (
    <li className={`que-card${open ? ' is-open' : ''}`} data-testid="rt-queue-item" data-status={status}>
      <button type="button" className="que-head" aria-expanded={open} aria-controls={detailId} onClick={onToggle} data-testid={`rt-queue-toggle-${record.id}`} data-qfocus={record.id}>
        <span className="que-avatar" data-tone={avatarTone(full)} aria-hidden="true">
          {personInitials(full)}
        </span>
        <span className="que-who">
          <span className="que-name">{name}</span>
          <span className="que-action">{actionText}</span>
        </span>
        {chip && (
          <span className="que-due" data-tone={chip.tone}>
            <span className="sr-only">{chip.label}</span>
            <span aria-hidden="true">{chip.text}</span>
          </span>
        )}
        <span className="que-chevron" aria-hidden="true">
          {Icons.chevronDown}
        </span>
      </button>
      <div className="que-detail" id={detailId} hidden={!open}>
        {(note || context) && (
          <div className="que-context">
            {note && <p>{/[.!?]$/.test(note) || !/\s/.test(note) ? note : `${note}.`}</p>}
            {context && <ClampText text={context} className="que-context-text" open={contextOpen} onToggle={() => setContextOpen((v) => !v)} testId={`rt-queue-context-${record.id}`} />}
          </div>
        )}
        {said && (
          <p className="que-said">
            <span>You said “{said}”.</span>
            {suggested && onPatch && (
              <button type="button" className="btn btn-secondary btn-sm que-set-date" onClick={() => void confirmDate()} disabled={settingDate} data-testid={`rt-queue-set-date-${record.id}`}>
                Set {shortDay(suggested)}
              </button>
            )}
          </p>
        )}
        {draft && (
          // The whole message as written, line breaks too: what Draft message copies is what is shown here.
          <div className="que-draft">
            <span className="que-draft-label">Draft</span>
            <ClampText text={draft} className="que-draft-text" open={draftOpen} onToggle={() => setDraftOpen((v) => !v)} textRef={draftRef} testId={`rt-queue-draft-${record.id}`} />
          </div>
        )}
        {channel && <p className="que-channel">Via {channel.label}</p>}
        <div className="que-actions">
          {draftField && (
            <button
              type="button"
              className="btn btn-primary que-draft-btn"
              onClick={() => void draftMessage()}
              disabled={!draft && !onDraft}
              aria-label={`Draft message to ${name}`}
              data-testid={`rt-queue-copy-${record.id}`}
            >
              {Icons.send}
              Draft message
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary que-done-btn"
            onClick={() => void completion.toggle()}
            disabled={!onPatch || !completion.patch || completion.busy}
            aria-label={`Mark done: ${actionText}`}
            data-testid={`rt-queue-done-${record.id}`}
          >
            {Icons.check}
            Mark done
          </button>
        </div>
        {onEdit && (
          <button type="button" className="btn btn-ghost btn-sm que-edit" onClick={() => onEdit(record)} data-testid={`rt-queue-edit-${record.id}`}>
            Edit details
          </button>
        )}
      </div>
    </li>
  );
}

/** A completed item: kept out of the way, still editable, and one tap puts it back in the queue. */
function DoneRow({ spec, view, record, onPatch, onCompleted, onEdit, onAct }: SharedProps & { onEdit?: (record: AppRecord) => void; onAct?: FocusPlanner }) {
  const completion = useCompletion(spec, view, record, onPatch, onCompleted, onAct);
  const full = personName(view, record);
  const name = personShortName(full);
  const actionText = actionOf(view, record, name);
  return (
    <li className="que-done-row" data-testid="rt-queue-item" data-status="done">
      <span className="que-avatar is-small" data-tone={avatarTone(full)} aria-hidden="true">
        {personInitials(full)}
      </span>
      <span className="que-done-text">
        <span className="que-name">{name}</span>
        <span className="que-action">{actionText}</span>
      </span>
      <span className="que-done-actions">
        {onEdit && (
          <button type="button" className="btn btn-ghost btn-sm que-done-edit" onClick={() => onEdit(record)} aria-label={`Edit: ${actionText}`} data-testid={`rt-queue-edit-${record.id}`}>
            Edit
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm que-reopen"
          onClick={() => void completion.toggle()}
          disabled={!onPatch || !completion.patch || completion.busy}
          aria-label={`Reopen: ${actionText}`}
          data-testid={`rt-queue-done-${record.id}`}
          data-qfocus={record.id}
        >
          Reopen
        </button>
      </span>
    </li>
  );
}
