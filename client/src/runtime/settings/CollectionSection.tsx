/** "Collection": pin, archive and delete this app. */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import { api, describeError } from '../../api.ts';
import { useToast } from '../../components/ui.tsx';
import { clearCache } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  recordCount: number;
  onDetail: (detail: AppDetailDto) => void;
}

export function CollectionSection({ appId, detail, recordCount, onDetail }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState<'pin' | 'archive' | 'delete' | null>(null);
  const { app, spec } = detail;
  const archived = app.archivedAt !== null;

  const patch = async (kind: 'pin' | 'archive', body: { pinned?: boolean; archived?: boolean }, done: string) => {
    setBusy(kind);
    try {
      const d = await api<AppDetailDto>(`/api/apps/${appId}`, { method: 'PATCH', body });
      onDetail(d);
      toast(done);
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const noun = recordCount === 1 ? spec.entryNoun.singular : spec.entryNoun.plural;
    const what = recordCount === 0 ? `Delete ${spec.name}?` : `Delete ${spec.name} and its ${recordCount} ${noun}?`;
    if (!window.confirm(`${what} This cannot be undone. Export first if you want to keep a copy.`)) return;
    setBusy('delete');
    try {
      await api<{ ok: boolean }>(`/api/apps/${appId}`, { method: 'DELETE' });
      clearCache(appId);
      toast('App deleted');
      navigate('/collection', { replace: true });
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
      setBusy(null);
    }
  };

  return (
    <section className="rt-section card card-pad" data-testid="rt-collection">
      <h2>Collection</h2>
      <p className="muted small">Pinned apps sit at the top of your collection. Archived apps stay saved, just out of the way.</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" data-testid="rt-pin" disabled={busy !== null} onClick={() => void patch('pin', { pinned: !app.pinned }, app.pinned ? 'Unpinned' : 'Pinned to the top')}>
          {app.pinned ? 'Unpin' : 'Pin to top'}
        </button>
        <button type="button" className="btn btn-secondary" data-testid="rt-archive" disabled={busy !== null} onClick={() => void patch('archive', { archived: !archived }, archived ? 'Restored' : 'Archived')}>
          {archived ? 'Restore' : 'Archive'}
        </button>
      </div>
      <div className="rt-danger-zone">
        <button type="button" className="btn btn-danger" data-testid="rt-delete-app" disabled={busy !== null} onClick={() => void remove()}>
          {busy === 'delete' ? 'Deleting…' : 'Delete this app'}
        </button>
      </div>
    </section>
  );
}
