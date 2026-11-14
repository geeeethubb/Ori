/** The app itself: header, rotating prompt, view tabs, the active view and the new-entry sheet. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import { primaryView, type AppSpec, type PromptRotationRule, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { currentPrompt } from '@shared/rules.ts';
import { describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { EmptyState, Icons, useToast } from '../components/ui.tsx';
import { BoardView } from './BoardView.tsx';
import { JournalView } from './JournalView.tsx';
import { ListView } from './ListView.tsx';
import { RecordSheet, type SheetState } from './RecordSheet.tsx';
import { SummaryView } from './SummaryView.tsx';
import type { RecordActions } from './useAppData.ts';
import { appSettingsPath, capitalize, purposeLabel, readJson, useStandalone, viewKey, writeJson } from './runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  records: AppRecord[];
  /** Omitted when the app is read-only (offline copy). */
  actions?: RecordActions;
}

export function AppHome({ appId, detail, records, actions }: Props) {
  const { spec, app } = detail;
  const standalone = useStandalone();
  const { toast } = useToast();
  const [viewId, setViewId] = useState<string>(() => readJson<string>(viewKey(appId)) ?? '');
  const view: ViewSpec = spec.views.find((v) => v.id === viewId) ?? primaryView(spec);
  const [sheet, setSheet] = useState<SheetState>(null);
  const promptRule = spec.rules.find((r): r is PromptRotationRule => r.type === 'prompt_rotation');
  const prompt = useMemo(() => (promptRule ? currentPrompt(promptRule) : null), [promptRule]);
  const noun = spec.entryNoun;

  const selectView = (id: string) => {
    setViewId(id);
    writeJson(viewKey(appId), id);
  };
  const onEdit = actions ? (record: AppRecord) => setSheet({ mode: 'edit', record }) : undefined;
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

  const newButton = actions ? (
    <button type="button" className="btn btn-primary rt-new" data-testid="rt-new-entry" onClick={() => setSheet({ mode: 'new' })}>
      {Icons.plus}
      New {noun.singular}
    </button>
  ) : null;

  return (
    <div className="rt-page">
      {!standalone && (
        <div className="rt-topline">
          <Link to="/collection" className="rt-backlink" data-testid="rt-back-collection">
            {Icons.back}
            <span>Back to collection</span>
          </Link>
        </div>
      )}
      <header className="rt-header">
        <AppIcon icon={spec.icon} size={44} title={`${spec.name} icon`} />
        <div className="rt-header-text">
          <h1>{spec.name}</h1>
          {spec.tagline && <p className="rt-tagline">{spec.tagline}</p>}
          <div className="rt-meta">
            <span className={`badge badge-${spec.purpose}`}>{purposeLabel(spec.purpose)}</span>
            {app.isSample && <span className="badge badge-sample">Sample</span>}
          </div>
        </div>
        <Link to={appSettingsPath(appId)} className="btn btn-ghost btn-icon rt-settings-btn" aria-label="App settings" data-testid="rt-settings-link">
          {Icons.gear}
        </Link>
      </header>

      {prompt && promptRule && (
        <section className="rt-prompt" data-testid="rt-prompt-card">
          <div className="eyebrow rt-prompt-kicker">
            {promptRule.title} · {prompt.periodLabel}
          </div>
          <p className="rt-prompt-text">{prompt.text}</p>
        </section>
      )}

      {records.length === 0 ? (
        <EmptyState title={`No ${noun.plural} yet`} body={spec.emptyStateHint ?? `Your first ${noun.singular} can be small. Start with one thing you want to remember.`} action={newButton} />
      ) : (
        <>
          <div className="rt-toolbar">
            {spec.views.length > 1 ? (
              <div className="tabs rt-tabs" role="tablist" aria-label="Views">
                {spec.views.map((v) => (
                  <button type="button" key={v.id} role="tab" aria-selected={v.id === view.id} data-testid={`rt-view-tab-${v.id}`} onClick={() => selectView(v.id)}>
                    {v.title ?? capitalize(v.type)}
                  </button>
                ))}
              </div>
            ) : view.title ? (
              <h2 className="rt-view-title">{view.title}</h2>
            ) : (
              <span />
            )}
            {newButton}
          </div>
          <div className="rt-view" role={spec.views.length > 1 ? 'tabpanel' : undefined}>
            <ViewBody spec={spec} view={view} records={records} onEdit={onEdit} onMove={onMove} />
          </div>
        </>
      )}

      {actions && <RecordSheet appId={appId} spec={spec} sheet={sheet} onClose={() => setSheet(null)} actions={actions} />}
    </div>
  );
}

interface ViewBodyProps {
  spec: AppSpec;
  view: ViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  onMove?: (record: AppRecord, stage: string) => void;
}

function ViewBody({ spec, view, records, onEdit, onMove }: ViewBodyProps) {
  switch (view.type) {
    case 'journal':
      return <JournalView spec={spec} view={view} records={records} onEdit={onEdit} />;
    case 'board':
      return <BoardView spec={spec} view={view} records={records} onEdit={onEdit} onMove={onMove} />;
    case 'list':
      return <ListView spec={spec} view={view} records={records} onEdit={onEdit} />;
    case 'summary':
      return <SummaryView spec={spec} view={view} records={records} onEdit={onEdit} />;
    default:
      return null;
  }
}
