/** Version history (newest first) and "Undo last change". */
import { useEffect, useState } from 'react';
import type { AppDetailDto, AppVersionDto } from '@shared/api.ts';
import { api, describeError } from '../../api.ts';
import { ErrorBanner, Spinner, useToast } from '../../components/ui.tsx';
import { timeAgo } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  onDetail: (detail: AppDetailDto) => void;
}

export function HistorySection({ appId, detail, onDetail }: Props) {
  const { toast } = useToast();
  const [versions, setVersions] = useState<AppVersionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const undo = async () => {
    setBusy(true);
    try {
      const d = await api<AppDetailDto>(`/api/apps/${appId}/revisions/undo`, { method: 'POST' });
      onDetail(d);
      toast('Change undone');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rt-section card card-pad" data-testid="rt-history">
      <div className="row-between">
        <h2>History</h2>
        <button type="button" className="btn btn-secondary btn-sm" data-testid="rt-undo" disabled={!detail.canUndo || busy} onClick={() => void undo()}>
          {busy ? 'Undoing…' : 'Undo last change'}
        </button>
      </div>
      <p className="muted small">Every change is kept as a version. Undo adds a new version that brings back the previous one, so nothing is ever lost.</p>
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
