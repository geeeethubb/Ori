/** "Your data": export this app as JSON, or import an export as a new app. */
import { useState, type ChangeEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import type { AppDetailDto, AppExportDto } from '@shared/api.ts';
import { api, apiBase, describeError, usesBearer } from '../../api.ts';
import { useToast } from '../../components/ui.tsx';
import { appHomePath } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  name: string;
}

export function DataSection({ appId, name }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const exportHref = `${apiBase()}/api/apps/${appId}/export`;

  // On the web the cookie travels with a plain link. In the native shell (bearer token) we fetch and save instead.
  const onExport = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!usesBearer()) return;
    e.preventDefault();
    try {
      const data = await api<AppExportDto>(`/api/apps/${appId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'app'}-${appId}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 5000);
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    }
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const res = await api<AppDetailDto>('/api/apps/import', { method: 'POST', body: parsed });
      toast(`Imported ${res.app.name}`);
      navigate(appHomePath(res.app.id));
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : describeError(err), { kind: 'error' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="rt-section card card-pad" data-testid="rt-data" id="data" aria-labelledby="rt-data-heading">
      <h2 id="rt-data-heading">Your data</h2>
      <p className="muted small">Export is a complete copy of this app's definition history and entries. Importing a file creates a new app in your collection; the original is untouched.</p>
      <div className="row">
        <a className="btn btn-secondary" href={exportHref} download onClick={(e) => void onExport(e)} data-testid="rt-export">
          Export JSON
        </a>
        <label className={`btn btn-secondary rt-file-btn${importing ? ' is-busy' : ''}`} aria-disabled={importing}>
          {importing ? 'Importing…' : 'Import from file'}
          <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => void onImport(e)} disabled={importing} data-testid="rt-import-file" />
        </label>
      </div>
    </section>
  );
}
