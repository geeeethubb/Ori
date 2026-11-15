/**
 * The app itself: its own header (icon, name in the app's own type, an "Edit with Ori" pill and a
 * "..." menu with real destinations only, no parent navigation), the app's headline (its tagline,
 * large), the rotating prompt (a gallery's own chip, under a practice timer, else above the view), a
 * light row of view tabs, the active renderer and the record sheet. Each view type
 * brings its own primary interaction: generic forms, "Add photo" uploads, the practice timer's "Save
 * session", saved sources, and one-tap completion in the queue. Edit with Ori and Add to home screen
 * open as sheets here (also from ?edit=1 and ?install=1, once); after the first saved action the app
 * offers Add to home screen once, small and dismissible.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppDetailDto, ProposalDetailDto } from '@shared/api.ts';
import { primaryView, recordMatchesView, type AppSpec, type PromptRotationRule, type ViewSpec } from '@shared/appSpec.ts';
import type { Recommendation } from '@shared/context.ts';
import { draftEntry, type DraftEntry } from '@shared/drafts.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { currentPrompt } from '@shared/rules.ts';
import { api, describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { OriCompanion } from '../components/ori/OriCompanion.tsx';
import { useOriMood } from '../components/ori/useOriMood.ts';
import { ActionMenu, EmptyState, Icons, useToast, type MenuItem } from '../components/ui.tsx';
import { InstallOffer, InstallSheet, takeInstallOffer } from './settings/InstallGuide.tsx';
import { EditWithOriSheet, useAppliedToast } from './settings/ReviseSection.tsx';
import './shell.css';
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
import { appSettingsPath, capitalize, markFirstAction, markUseful, readJson, useStandalone, viewKey, writeJson } from './runtimeUtils.ts';
import { atTime, formatClock } from './viewLogic.ts';

/** What the save form says about a practice session: measured or typed in, and anything to check. */
function practiceNote(meta: PracticeSaveMeta): string {
  if (!meta.timed) return 'You did not run the timer, so nothing was measured. Type the minutes you practiced.';
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
  /** Puts a changed definition in place (Edit with Ori, its Undo). Omitted when the app cannot change here. */
  onDetail?: (detail: AppDetailDto) => void;
}

/** The one-time launch actions in an app link (?edit=1, ?install=1), read once and then removed from the address. */
export function readLaunchParams(search: string): { edit: boolean; install: boolean } {
  const params = new URLSearchParams(search);
  return { edit: params.get('edit') === '1', install: params.get('install') === '1' };
}

function dropParams(names: string[]): void {
  const url = new URL(window.location.href);
  let changed = false;
  for (const n of names) {
    if (url.searchParams.has(n)) {
      url.searchParams.delete(n);
      changed = true;
    }
  }
  if (changed) window.history.replaceState(window.history.state, '', url.toString());
}

export function AppHome({ appId, detail, records, actions, preview = false, onDetail }: Props) {
  const { spec, app } = detail;
  const standalone = useStandalone();
  const { toast } = useToast();
  const theme = useMemo(() => resolveTheme(spec), [spec]);
  // The companion in the Edit with Ori pill and sheet reflects the edit actually in progress.
  const ori = useOriMood({ resetKey: appId });
  const [editOpen, setEditOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [offer, setOffer] = useState(false);
  // Where focus goes back when a sheet's opener is gone (a toast's "Review", the one-time offer).
  const pillRef = useRef<HTMLButtonElement>(null);
  const headActionsRef = useRef<HTMLDivElement>(null);
  const menuButton = useCallback(() => headActionsRef.current?.querySelector<HTMLElement>('.menu-trigger') ?? null, []);
  const pillButton = useCallback(() => pillRef.current, []);
  const live = Boolean(actions);
  const canEdit = !preview && live && Boolean(onDetail);
  const announceApplied = useAppliedToast(appId, onDetail ?? (() => undefined));

  // ?edit=1 opens Edit with Ori and ?install=1 the home-screen guide: once, then the address is clean again.
  const [launch] = useState(() => (preview || typeof window === 'undefined' ? { edit: false, install: false } : readLaunchParams(window.location.search)));
  const launchHandled = useRef(false);
  useEffect(() => {
    if (launchHandled.current || (!launch.edit && !launch.install)) return;
    launchHandled.current = true;
    dropParams(['edit', 'install']);
    if (launch.edit && canEdit) setEditOpen(true);
    else if (launch.install) setInstallOpen(true);
    else if (launch.edit) toast(`Editing ${spec.name} needs a connection. Try again when you are online.`, { kind: 'error' });
    // Once per mount; the app is loaded by the time AppHome renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** After a saved action: offer Add to home screen, once per app on this device. */
  const noteSaved = () => {
    if (takeInstallOffer(appId, { preview, standalone })) setOffer(true);
  };
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
        noteSaved();
      },
    });
  // The offline copy cannot save, so a link opened offline waits until the app is live. Handled once.
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
                noteSaved();
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
        <button type="button" className="btn btn-primary rt-new" data-testid={testId} onClick={() => openNew(formView, { title: addLabel, onSaved: noteSaved })}>
          {Icons.plus}
          {addLabel}
        </button>
      );
    }
  }

  const emptyView = viewRecords.length === 0 && view.type !== 'practice';
  const iconSize = theme.design.typography === 'compact' ? 32 : 36;
  // Inside a preview the page around it owns the only h1 (audit P2-02).
  const NameHeading = preview ? 'h2' : 'h1';
  // The rotating prompt: a gallery shows it as its own chip (a card would say it twice); a practice room
  // shows it under the timer and what to play along with, so the timer leads; elsewhere it tops the page.
  const promptCard =
    prompt && promptRule && view.type !== 'gallery' ? (
      <section className="rt-prompt" data-testid="rt-prompt-card" aria-label={promptRule.title}>
        <div className="rt-prompt-kicker">
          <span className="rt-prompt-title">{promptRule.title}</span>
          <span className="rt-prompt-period">{prompt.periodLabel}</span>
        </div>
        <p className="rt-prompt-text">{prompt.text}</p>
      </section>
    ) : null;
  const promptInView = view.type === 'practice';

  // The "..." menu: real destinations only. History, export and editing need a connection.
  const settingsPath = appSettingsPath(appId);
  const menuItems: MenuItem[] = [
    { key: 'settings', label: 'Settings', icon: Icons.gear, to: settingsPath, testId: 'rt-settings-link' },
    ...(live ? [{ key: 'history', label: 'History and undo', icon: Icons.history, to: `${settingsPath}#history`, testId: 'rt-menu-history' }] : []),
    { key: 'install', label: 'Add to home screen', icon: Icons.phone, onSelect: () => setInstallOpen(true), testId: 'rt-menu-install' },
    ...(live ? [{ key: 'export', label: 'Export data', icon: Icons.download, to: `${settingsPath}#data`, testId: 'rt-menu-export' }] : []),
    // In a browser tab (not from the home screen) there is a quiet way back to the collection.
    ...(!standalone ? [{ key: 'apps', label: 'My apps', icon: Icons.grid, to: '/apps', testId: 'rt-back-collection' }] : []),
  ];

  return (
    <div className="rt-page" data-pattern={spec.pattern} data-view-type={view.type}>
      <header className="rt-head" data-testid="rt-head" data-name={spec.name.length > 12 ? 'long' : undefined}>
        <div className="rt-head-bar">
          <div className="rt-head-id">
            <AppIcon icon={spec.icon} name={spec.name} size={iconSize} title="" className="rt-head-icon" />
            <NameHeading className="rt-head-name">{spec.name}</NameHeading>
          </div>
          {!preview && (
            <div className="rt-head-actions" ref={headActionsRef}>
              {canEdit && (
                <button type="button" ref={pillRef} className="rt-ori-pill" aria-label={`Edit ${spec.name} with Ori`} title={`Edit ${spec.name} with Ori`} data-testid="rt-edit-with-ori" onClick={() => setEditOpen(true)}>
                  <span className="rt-ori-pill-mark">
                    <OriCompanion {...ori.companion} size={26} />
                  </span>
                  <span className="rt-ori-pill-text">Edit with Ori</span>
                </button>
              )}
              <ActionMenu items={menuItems} label={`More for ${spec.name}`} testId="rt-app-menu" align="right" className="rt-head-menu" triggerClassName="rt-head-menu-btn" />
            </div>
          )}
        </div>
        {app.isSample && (
          <span className="rt-tag rt-head-tag" data-testid="rt-sample-tag">
            Example
          </span>
        )}
        {spec.tagline && <p className="rt-headline">{spec.tagline}</p>}
      </header>

      {offer && (
        <InstallOffer
          name={spec.name}
          icon={spec.icon}
          onOpen={() => {
            setOffer(false);
            setInstallOpen(true);
          }}
          onDismiss={() => setOffer(false)}
        />
      )}

      {!promptInView && promptCard}

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
            // A light row of labels (not a second pill): views such as People's queue bring their own switch.
            <div className="rt-tabs rt-view-tabs" role="tablist" aria-label="Views">
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
          prompt={promptInView ? promptCard : null}
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
                      noteSaved();
                    },
                  })
              : undefined
          }
          onCompleted={() => {
            first('action');
            markUseful(appId, { kind: 'task_done' });
            noteSaved();
          }}
        />
      </div>

      {actions && <RecordSheet appId={appId} spec={spec} sheet={sheet} onClose={() => setSheet(null)} actions={actions} records={records} />}
      {canEdit && onDetail && (
        <EditWithOriSheet
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onReopen={() => setEditOpen(true)}
          fallbackFocus={pillButton}
          appId={appId}
          detail={detail}
          records={records}
          onDetail={onDetail}
          ori={ori}
          onApplied={announceApplied}
        />
      )}
      {!preview && <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} appId={appId} name={spec.name} icon={spec.icon} fallbackFocus={menuButton} />}
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
  /** The rotating prompt card, when the view places it itself (the practice room, under its timer). */
  prompt?: ReactNode;
  onEdit?: (record: AppRecord) => void;
  onMove?: (record: AppRecord, stage: string) => void;
  onPatch?: (record: AppRecord, patch: RecordValues) => Promise<void>;
  onDelete?: (record: AppRecord) => Promise<void>;
  onPracticeSave?: (preset: RecordValues, meta: PracticeSaveMeta, afterSaved: () => void) => void;
  onCompleted?: (record: AppRecord) => void;
  readOnlyNote?: string;
}

function ViewBody({ appId, spec, view, records, allRecords, empty, action, prompt, onEdit, onMove, onPatch, onDelete, onPracticeSave, onCompleted, readOnlyNote }: ViewBodyProps) {
  const noun = spec.entryNoun;
  switch (view.type) {
    case 'gallery':
      return <GalleryView spec={spec} view={view} records={records} onEdit={onEdit} onDelete={onDelete} action={action} />;
    case 'practice':
      // Every record, so the timer lists the saved sources to practise with (they live in another tab).
      return (
        <PracticeView appId={appId} spec={spec} view={view} records={records} allRecords={allRecords} onEdit={onEdit} onSave={onPracticeSave} readOnlyNote={readOnlyNote}>
          {prompt}
        </PracticeView>
      );
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
