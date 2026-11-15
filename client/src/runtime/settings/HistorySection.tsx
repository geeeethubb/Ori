/** Version history (newest first) and a data-safe "Undo last change" that shows what it keeps first. */
import { useEffect, useState } from 'react';
import type { AppDetailDto, AppVersionDto, UndoPreviewDto } from '@shared/api.ts';
import { api, ApiError, describeError } from '../../api.ts';
import { ErrorBanner, Spinner, useToast } from '../../components/ui.tsx';
import { timeAgo } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  onDetail: (detail: AppDetailDto) => void;
}

/**
 * The data-safe undo of exactly the change that made `expectedVersion` (the toast's Undo). The plan is
 * read first and an undo that would leave entries out of every tab is never run; if the app changed
 * since (another change, another device, a retried tap), the server refuses it and nothing happens.
 */
export async function undoChange(appId: string, expectedVersion: number): Promise<{ detail: AppDetailDto; kept: string[]; label: UndoPreviewDto['label'] }> {
  const plan = await api<UndoPreviewDto>(`/api/apps/${appId}/revisions/undo/preview`, { method: 'POST' });
  if (!plan.ok) throw new Error(plan.blocked.join(' ') || 'This undo would lose track of entries, so it was not run.');
  const d = await api<AppDetailDto & { kept?: string[] }>(`/api/apps/${appId}/revisions/undo`, { method: 'POST', body: { expectedVersion } });
  return { detail: { app: d.app, spec: d.spec, version: d.version, canUndo: d.canUndo }, kept: d.kept ?? plan.kept, label: plan.label };
}

export function HistorySection({ appId, detail, onDetail }: Props) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<AppVersionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<UndoPreviewDto | null>(null);

  // A plan belongs to one version: any change (here or elsewhere) makes it stale.
  useEffect(() => setPlan(null), [detail.version]);

  useEffect(() => {
    let alive = true;
    api<{ versions: AppVersionDto[] }>(`/api/apps/${appId}/versions`)
      .then((r) => {
        if (alive) {
          setVersions([...r.versions].sort((a, b) => b.version - a.version));
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (alive) setError(describeError(err));
      });
    return () => {
      alive = false;
    };
  }, [appId, detail.version]);

  const askUndo = async () => {
    setBusy(true);
    try {
      setPlan(await api<UndoPreviewDto>(`/api/apps/${appId}/revisions/undo/preview`, { method: 'POST' }));
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      // The expected version makes a retried undo (lost response) fail safely instead of redoing.
      const d = await api<AppDetailDto & { kept?: string[] }>(`/api/apps/${appId}/revisions/undo`, { method: 'POST', body: { expectedVersion: detail.version } });
      onDetail({ app: d.app, spec: d.spec, version: d.version, canUndo: d.canUndo });
      toast(plan.label === 'Redo' ? 'Change brought back. Your entries are kept.' : 'Change undone. Your entries are kept.');
      setPlan(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale_preview') {
        const fresh = await api<AppDetailDto>(`/api/apps/${appId}`).catch(() => null);
        if (fresh) onDetail(fresh);
      }
      toast(describeError(err), { kind: 'error' });
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rt-section card card-pad" data-testid="rt-history" id="history" aria-labelledby="rt-history-heading">
      <div className="row-between">
        <h2 id="rt-history-heading">History and undo</h2>
        <button type="button" className="btn btn-secondary btn-sm" data-testid="rt-undo" disabled={!detail.canUndo || busy || plan !== null} onClick={() => void askUndo()}>
          {busy && !plan ? 'Checking…' : 'Undo last change'}
        </button>
      </div>
      <p className="muted small">Undo an app change without losing your saved entries.</p>
      {plan && (
        <div className={`banner ${plan.ok ? 'banner-info' : 'banner-warn'} rt-undo-plan`} role="status" data-testid="rt-undo-plan">
          <div className="stack-s">
            <strong>{plan.ok ? `${plan.label}: the design of version ${plan.restores} comes back. Your entries stay.` : 'This undo would lose track of entries, so it is not available.'}</strong>
            {[...plan.kept, ...plan.blocked].map((line) => (
              <span key={line} className="small">{line}</span>
            ))}
            <span className="rt-undo-actions">
              {plan.ok && (
                <button type="button" className="btn btn-primary btn-sm" data-testid="rt-undo-confirm" disabled={busy} onClick={() => void undo()}>
                  {busy ? 'Undoing…' : plan.label}
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" data-testid="rt-undo-cancel" disabled={busy} onClick={() => setPlan(null)}>
                {plan.ok ? 'Cancel' : 'OK'}
              </button>
            </span>
          </div>
        </div>
      )}
      {versions === null && !error && <Spinner label="Loading history…" />}
      {error && <ErrorBanner message={error} />}
      {versions && (
        <ul className="rt-history">
          {versions.map((v) => (
            <li key={v.version} data-testid="rt-version">
              <span className="badge">v{v.version}</span>
              <span className="rt-history-summary">{v.changeSummary}</span>
              {v.origin === 'undo' && <span className="tiny faint">undo</span>}
              {v.origin === 'import' && <span className="tiny faint">imported</span>}
              <span className="tiny faint">{timeAgo(v.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
