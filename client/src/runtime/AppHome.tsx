/**
 * The app itself: identity header (icon, name in the app's display face, tagline), an understated
 * way back to the collection, the rotating prompt, view tabs, the active renderer and the record
 * sheet. Each view type brings its own primary interaction: generic forms, "Add photo" uploads,
 * the practice timer's "Save session", saved sources, and one-tap completion in the queue.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto, ProposalDetailDto } from '@shared/api.ts';
import { primaryView, recordMatchesView, type AppSpec, type PromptRotationRule, type ViewSpec } from '@shared/appSpec.ts';
import type { Recommendation } from '@shared/context.ts';
import { draftEntry, type DraftEntry } from '@shared/drafts.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { currentPrompt } from '@shared/rules.ts';
import { todayIso } from '@shared/time.ts';
import { api, describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { EmptyState, Icons, useToast } from '../components/ui.tsx';
import { BoardView } from './BoardView.tsx';
import { AddPhotoButton, GalleryView } from './GalleryView.tsx';
import { JournalView } from './JournalView.tsx';
import { LinksView } from './LinksView.tsx';
import { ListView } from './ListView.tsx';
import { noteSaveSent, practiceTimerKey, readTimer, renewSessionId } from './practiceTimer.ts';
import { PracticeView, type PracticeSaveMeta } from './PracticeView.tsx';
import { QueueView } from './QueueView.tsx';
import { RecordSheet, type NewEntrySheet, type SheetState } from './RecordSheet.tsx';
import { SummaryView } from './SummaryView.tsx';
import { resolveTheme } from './theme.ts';
import type { RecordActions } from './useAppData.ts';
import { appSettingsPath, capitalize, COLLECTION_LABEL, markFirstAction, markUseful, readJson, useStandalone, viewKey, writeJson } from './runtimeUtils.ts';
import { atTime, formatClock } from './viewLogic.ts';

/** What the save form says about a practice session: measured or typed in, and anything to check. */
function practiceNote(meta: PracticeSaveMeta): string {
  if (!meta.timed) return 'You did not run the timer, so nothing was measured. Type the minutes you practised.';
  const minutes = Math.max(1, Math.round(meta.elapsedMs / 60_000));
  const rounded = Math.round(meta.elapsedMs / 1000) % 60 !== 0;
  const parts = [`Your timer measured ${formatClock(meta.elapsedMs)} of your ${meta.plannedMinutes}-minute plan, saved as ${minutes} min${rounded ? ' (rounded)' : ''}.`];
  if (meta.endedAway && meta.completedAt) parts.push(`It finished ${atTime(meta.completedAt)} while this page was closed; change the minutes if you stopped earlier.`);
  else if (meta.needsReview) parts.push('The clock changed while it ran, so check the minutes.');
  else parts.push('Change it if you stopped earlier.');
  return parts.join(' ');
}

interface Props {
  appId: string;
  detail: AppDetailDto;
  records: AppRecord[];
  /** Omitted when the app is read-only (offline copy, preview). */
  actions?: RecordActions;
  /** A proposal rendered before it exists: nothing is persisted and no events are sent. */
  preview?: boolean;
}

export function AppHome({ appId, detail, records, actions, preview = false }: Props) {
  const { spec, app } = detail;
  const standalone = useStandalone();
  const { toast } = useToast();
  const theme = useMemo(() => resolveTheme(spec), [spec]);
  const [viewId, setViewId] = useState<string>(() => (preview ? '' : (readJson<string>(viewKey(appId)) ?? '')));
  const view: ViewSpec = spec.views.find((v) => v.id === viewId) ?? primaryView(spec);
  const [sheet, setSheet] = useState<SheetState>(null);
  const promptRule = spec.rules.find((r): r is PromptRotationRule => r.type === 'prompt_rotation');
  const prompt = useMemo(() => (promptRule ? currentPrompt(promptRule) : null), [promptRule]);
  const noun = spec.entryNoun;
  const viewRecords = useMemo(() => records.filter((r) => recordMatchesView(view, r.values)), [records, view]);
  /** The view whose form the primary action uses: the active one, or the first view from a summary tab. */
  const formView: ViewSpec = view.type === 'summary' ? primaryView(spec) : view;
  const addLabel = formView.addLabel ?? `New ${noun.singular}`;

  const selectView = (id: string) => {
    setViewId(id);
    if (!preview) writeJson(viewKey(appId), id);
  };

  // ---------- "use the app you have": an Agent suggestion opens here with its entry prefilled ----------
  // Read from the address once (previews render outside the router); the parameter is then removed.
  const [fromId] = useState(() => (preview || typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('from')));
  const [suggestion, setSuggestion] = useState<{ rec: Recommendation; entry: DraftEntry } | null>(null);
  const openSuggested = (rec: Recommendation, entry: DraftEntry) =>
    setSheet({
      mode: 'new',
      view: entry.view,
      preset: entry.values,
      title: entry.view.addLabel ?? `Add to ${spec.name}`,
      fresh: true,
      note: entry.note,
      recommendationId: rec.id,
      // One entry per suggestion, however many times it is confirmed.
      recordId: `use_${rec.id}`,
      onSaved: () => {
        setSuggestion(null);
        markUseful(appId, { kind: rec.recordDraft?.kind ?? 'entry', via: 'agent' });
      },
    });
  // The offline copy cannot save, so a link opened offline waits until the app is live. Handled once.
  const live = Boolean(actions);
  const fromHandled = useRef(false);
  useEffect(() => {
    if (!fromId || !live || fromHandled.current) return;
    let alive = true;
    const drop = () => {
      fromHandled.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete('from');
      window.history.replaceState(window.history.state, '', url.toString());
    };
    api<ProposalDetailDto>(`/api/recommendations/${fromId}`)
      .then((d) => {
        if (!alive) return;
        drop();
        const rec = d.recommendation;
        if (rec.kind !== 'use_app' || rec.targetAppId !== appId) return;
        // A timer app opens on its timer: practising is the point.
        const practice = spec.views.find((v) => v.type === 'practice');
        if (practice && (!rec.recordDraft || rec.recordDraft.kind === 'source')) selectView(practice.id);
        if (rec.status === 'applied') {
          toast('Already added from your AI.');
          return;
        }
        const entry = rec.recordDraft ? draftEntry(spec, rec.recordDraft) : null;
        if (!entry || !rec.recordDraft) return;
        if (rec.recordDraft.kind === 'source') setSuggestion({ rec, entry });
        else openSuggested(rec, entry);
      })
      .catch(() => {
        if (alive) drop();
      });
    return () => {
      alive = false;
    };
    // Runs once per suggestion link, when the app can save; the param is removed so a reload never re-opens it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, live]);

  /** Edit uses the form of the view the record belongs to (an app may hold several kinds of record). */
  const viewForRecord = useCallback(
    (record: AppRecord): ViewSpec => spec.views.find((v) => v.type !== 'summary' && recordMatchesView(v, record.values)) ?? formView,
    [spec, formView],
  );
  const onEdit = actions ? (record: AppRecord) => setSheet({ mode: 'edit', record, view: viewForRecord(record) }) : undefined;

  const openNew = (target: ViewSpec, extra?: Omit<NewEntrySheet, 'mode' | 'view'>) => setSheet({ mode: 'new', view: target, ...extra });

  /**
   * A timed session's save: the timer notes a save once it is really sent. An id that cannot be used again
   * (that session was deleted, or changed elsewhere since it was saved) is replaced on the timer, keeping
   * the time, and the new id is what the next save uses.
   */
  const timedSave = (practice: ViewSpec, sessionId: string): Pick<NewEntrySheet, 'onSending' | 'onConflict' | 'conflictMessage'> => {
    // Every call names the session it is about, so another tab's newer session is never marked or renewed.
    let current = sessionId;
    return {
    onSending: () => noteSaveSent(appId, practice.id, current),
    onConflict: () => {
      renewSessionId(appId, practice.id, current);
      // Read with the default PracticeView reads it with, so nothing about the timer changes.
      const renewed = practice.type === 'practice' ? readTimer(practiceTimerKey(appId, practice.id), practice.presets[0] ?? 10).sessionId : null;
      if (!renewed || renewed === current) return undefined;
      current = renewed;
      return renewed;
    },
    conflictMessage: 'That session was changed on another device, so it was not overwritten. Save again to keep this time as a new session.',
    };
  };

  const onMove =
    actions && view.type === 'board'
      ? async (record: AppRecord, stage: string) => {
          const stageField = spec.fields.find((f) => f.id === view.stageFieldId);
          const label = stageField?.type === 'select' ? stageField.options.find((o) => o.value === stage)?.label : undefined;
          try {
            await actions.updateRecord(record.id, { [view.stageFieldId]: stage });
            toast(label ? `Moved to ${label}` : 'Moved');
          } catch (err) {
            toast(describeError(err), { kind: 'error' });
          }
        }
      : undefined;

  const onPatch = actions
    ? async (record: AppRecord, patch: RecordValues) => {
        try {
          await actions.updateRecord(record.id, patch);
        } catch (err) {
          toast(describeError(err), { kind: 'error' });
          throw err;
        }
      }
    : undefined;

  const onDelete = actions
    ? async (record: AppRecord) => {
        if (!window.confirm(`Delete this ${noun.singular}? This cannot be undone.`)) return;
        try {
          await actions.deleteRecord(record.id);
          toast('Deleted');
        } catch (err) {
          toast(describeError(err), { kind: 'error' });
        }
      }
    : undefined;

  const first = (kind: string) => {
    if (!preview) markFirstAction(appId, { kind });
  };

  // ---------- the primary action for the active view ----------
  let primaryAction: ReactNode = null;
  if (actions) {
    if (formView.type === 'gallery') {
      const gallery = formView;
      primaryAction = (
        <AddPhotoButton
          label={addLabel}
          onUploaded={(mediaId) =>
            openNew(gallery, {
              preset: { [gallery.imageFieldId]: mediaId },
              title: addLabel,
              fresh: true,
              onSaved: () => {
                first('photo');
                markUseful(appId, { kind: 'photo' });
              },
            })
          }
        />
      );
    } else if (formView.type === 'practice') {
      // The timer owns saving a session (it knows what was measured); from other tabs this goes to it,
      // instead of opening a form prefilled with the planned length as if it had been played.
      const practice = formView;
      primaryAction =
        view.type === 'practice' ? null : (
          <button type="button" className="btn btn-primary rt-new" data-testid="rt-new-entry" onClick={() => selectView(practice.id)}>
            {Icons.play}
            {practice.title ?? 'Timer'}
          </button>
        );
    } else {
      const testId = formView.type === 'links' ? 'rt-add-link' : 'rt-new-entry';
      primaryAction = (
        <button type="button" className="btn btn-primary rt-new" data-testid={testId} onClick={() => openNew(formView, { title: addLabel })}>
          {Icons.plus}
          {addLabel}
        </button>
      );
    }
  }

  const emptyView = viewRecords.length === 0 && view.type !== 'practice';
  const iconSize = theme.design.typography === 'display' ? 56 : theme.design.typography === 'compact' ? 40 : 48;

  return (
    <div className="rt-page" data-pattern={spec.pattern} data-view-type={view.type}>
      {!preview && (
        <div className="rt-topline">
          {!standalone ? (
            <Link to="/apps" className="rt-backlink" data-testid="rt-back-collection">
              {Icons.back}
              <span>{COLLECTION_LABEL}</span>
            </Link>
          ) : (
            <span />
          )}
          <Link to={appSettingsPath(appId)} className="rt-settings-btn" aria-label={`${spec.name} settings`} data-testid="rt-settings-link">
            {Icons.gear}
            <span className="rt-settings-word">Settings</span>
          </Link>
        </div>
      )}

      <header className="rt-identity">
        <AppIcon icon={spec.icon} size={iconSize} title={`${spec.name} icon`} className="rt-identity-icon" />
        <div className="rt-identity-text">
          <h1 className="rt-app-name">{spec.name}</h1>
          {spec.tagline && <p className="rt-tagline">{spec.tagline}</p>}
        </div>
        {app.isSample && (
          <span className="rt-tag" data-testid="rt-sample-tag">
            Example
          </span>
        )}
      </header>

      {prompt && promptRule && (
        <section className="rt-prompt" data-testid="rt-prompt-card" aria-label={promptRule.title}>
          <div className="rt-prompt-kicker">
            <span className="rt-prompt-title">{promptRule.title}</span>
            <span className="rt-prompt-period">{prompt.periodLabel}</span>
          </div>
          <p className="rt-prompt-text">{prompt.text}</p>
        </section>
      )}

      {suggestion && (
        <div className="banner banner-info rt-suggestion" role="status" data-testid="rt-suggestion">
          <span>{suggestion.entry.note} Save it in “{suggestion.entry.view.title ?? 'your list'}”?</span>
          <span className="rt-suggestion-actions">
            <button type="button" className="btn btn-primary btn-sm" data-testid="rt-suggestion-review" onClick={() => openSuggested(suggestion.rec, suggestion.entry)}>
              Review and save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSuggestion(null)}>
              Not now
            </button>
          </span>
        </div>
      )}

      {(spec.views.length > 1 || (!emptyView && primaryAction)) && (
        <div className="rt-toolbar">
          {spec.views.length > 1 ? (
            <div className="tabs rt-tabs" role="tablist" aria-label="Views">
              {spec.views.map((v) => (
                <button type="button" key={v.id} role="tab" aria-selected={v.id === view.id} data-testid={`rt-view-tab-${v.id}`} onClick={() => selectView(v.id)}>
                  {v.title ?? capitalize(v.type)}
                </button>
              ))}
            </div>
          ) : (
            <span className="rt-toolbar-spacer" />
          )}
          {!emptyView && primaryAction}
        </div>
      )}

      <div className="rt-view" role={spec.views.length > 1 ? 'tabpanel' : undefined}>
        <ViewBody
          appId={appId}
          spec={spec}
          view={view}
          records={viewRecords}
          allRecords={records}
          empty={emptyView}
          action={primaryAction}
          onEdit={onEdit}
          onMove={onMove}
          onPatch={onPatch}
          onDelete={onDelete}
          readOnlyNote={actions ? undefined : preview ? 'Example: sessions are saved once the app is yours.' : 'Reconnect to save a session.'}
          onPracticeSave={
            actions
              ? (preset, meta, afterSaved) =>
                  openNew(view, {
                    preset,
                    title: view.addLabel ?? 'Save session',
                    fresh: true,
                    // A timed session is saved under its own id: retrying the save cannot double it.
                    recordId: meta.sessionId ?? undefined,
                    note: practiceNote(meta),
                    ...(meta.sessionId ? timedSave(view, meta.sessionId) : {}),
                    onSaved: () => {
                      // Only time the clock measured counts as practice done; a typed-in log is kept, not counted.
                      if (meta.timed) first('session');
                      markUseful(appId, { kind: 'session', timed: meta.timed, elapsedSec: Math.round(meta.elapsedMs / 1000), endedAway: meta.endedAway });
                      afterSaved();
                    },
                  })
              : undefined
          }
          onCompleted={() => {
            first('action');
            markUseful(appId, { kind: 'task_done' });
          }}
        />
      </div>

      {actions && <RecordSheet appId={appId} spec={spec} sheet={sheet} onClose={() => setSheet(null)} actions={actions} records={records} />}
    </div>
  );
}

interface ViewBodyProps {
  appId: string;
  spec: AppSpec;
  view: ViewSpec;
  /** Records that belong to the view. */
  records: AppRecord[];
  allRecords: AppRecord[];
  empty: boolean;
  action: ReactNode;
  onEdit?: (record: AppRecord) => void;
  onMove?: (record: AppRecord, stage: string) => void;
  onPatch?: (record: AppRecord, patch: RecordValues) => Promise<void>;
  onDelete?: (record: AppRecord) => Promise<void>;
  onPracticeSave?: (preset: RecordValues, meta: PracticeSaveMeta, afterSaved: () => void) => void;
  onCompleted?: (record: AppRecord) => void;
  readOnlyNote?: string;
}

function ViewBody({ appId, spec, view, records, allRecords, empty, action, onEdit, onMove, onPatch, onDelete, onPracticeSave, onCompleted, readOnlyNote }: ViewBodyProps) {
  const noun = spec.entryNoun;
  switch (view.type) {
    case 'gallery':
      return <GalleryView spec={spec} view={view} records={records} onEdit={onEdit} onDelete={onDelete} action={action} />;
    case 'practice':
      return <PracticeView appId={appId} spec={spec} view={view} records={records} onEdit={onEdit} onSave={onPracticeSave} readOnlyNote={readOnlyNote} />;
    case 'links':
      return <LinksView spec={spec} view={view} records={records} onEdit={onEdit} action={action} />;
    case 'queue':
      return <QueueView spec={spec} view={view} records={records} onEdit={onEdit} onPatch={onPatch} onCompleted={onCompleted} action={action} />;
    default:
      break;
  }
  if (empty) {
    return (
      <EmptyState
        title={`No ${noun.plural} yet`}
        body={spec.emptyStateHint ?? `Your first ${noun.singular} can be small. Start with one thing you want to remember.`}
        action={action}
      />
    );
  }
  switch (view.type) {
    case 'journal':
      return <JournalView spec={spec} view={view} records={records} onEdit={onEdit} />;
    case 'board':
      return <BoardView spec={spec} view={view} records={records} onEdit={onEdit} onMove={onMove} />;
    case 'list':
      return <ListView spec={spec} view={view} records={records} onEdit={onEdit} />;
    case 'summary':
      return <SummaryView spec={spec} view={view} records={allRecords} onEdit={onEdit} />;
    default:
      return null;
  }
}
