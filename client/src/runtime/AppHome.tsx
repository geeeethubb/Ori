/**
 * The app itself: identity header (icon, name in the app's display face, tagline), an understated
 * way back to the collection, the rotating prompt, view tabs, the active renderer and the record
 * sheet. Each view type brings its own primary interaction: generic forms, "Add photo" uploads,
 * the practice timer's "Save session", saved sources, and one-tap completion in the queue.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import { primaryView, recordMatchesView, type AppSpec, type PromptRotationRule, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { currentPrompt } from '@shared/rules.ts';
import { todayIso } from '@shared/time.ts';
import { describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { EmptyState, Icons, useToast } from '../components/ui.tsx';
import { BoardView } from './BoardView.tsx';
import { AddPhotoButton, GalleryView } from './GalleryView.tsx';
import { JournalView } from './JournalView.tsx';
import { LinksView } from './LinksView.tsx';
import { ListView } from './ListView.tsx';
import { PracticeView } from './PracticeView.tsx';
import { QueueView } from './QueueView.tsx';
import { RecordSheet, type SheetState } from './RecordSheet.tsx';
import { SummaryView } from './SummaryView.tsx';
import { resolveTheme } from './theme.ts';
import type { RecordActions } from './useAppData.ts';
import { appSettingsPath, capitalize, COLLECTION_LABEL, markFirstAction, readJson, useStandalone, viewKey, writeJson } from './runtimeUtils.ts';

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

  /** Edit uses the form of the view the record belongs to (an app may hold several kinds of record). */
  const viewForRecord = useCallback(
    (record: AppRecord): ViewSpec => spec.views.find((v) => v.type !== 'summary' && recordMatchesView(v, record.values)) ?? formView,
    [spec, formView],
  );
  const onEdit = actions ? (record: AppRecord) => setSheet({ mode: 'edit', record, view: viewForRecord(record) }) : undefined;

  const openNew = (target: ViewSpec, extra?: { preset?: RecordValues; title?: string; fresh?: boolean; onSaved?: (r: AppRecord) => void }) =>
    setSheet({ mode: 'new', view: target, ...extra });

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
            openNew(gallery, { preset: { [gallery.imageFieldId]: mediaId }, title: addLabel, fresh: true, onSaved: () => first('photo') })
          }
        />
      );
    } else if (formView.type === 'practice') {
      // On the practice tab the timer owns "Save session"; from other tabs the same form opens with the default length.
      const practice = formView;
      primaryAction =
        view.type === 'practice' ? null : (
          <button
            type="button"
            className="btn btn-primary rt-new"
            data-testid="rt-new-entry"
            onClick={() => {
              const preset: RecordValues = { [practice.minutesFieldId]: practice.presets[0] ?? 10 };
              if (practice.dateFieldId) preset[practice.dateFieldId] = todayIso();
              openNew(practice, { preset, title: addLabel, onSaved: () => first('session') });
            }}
          >
            {Icons.plus}
            {addLabel}
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
              ? (preset, afterSaved) =>
                  openNew(view, {
                    preset,
                    title: view.addLabel ?? 'Save session',
                    fresh: true,
                    onSaved: () => {
                      first('session');
                      afterSaved();
                    },
                  })
              : undefined
          }
          onCompleted={() => first('action')}
        />
      </div>

      {actions && <RecordSheet appId={appId} spec={spec} sheet={sheet} onClose={() => setSheet(null)} actions={actions} />}
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
  onPracticeSave?: (preset: RecordValues, afterSaved: () => void) => void;
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
