import type { ChangeEvent } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto, AppSummaryDto } from '@shared/api.ts';
import { api, describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { EmptyState, ErrorBanner, Icons, Skeleton, useToast } from '../components/ui.tsx';
import { PurposeBadge, SampleBadge } from './parts/badges.tsx';
import { pluralize, relativeTime } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

function AppTile({ app }: { app: AppSummaryDto }) {
  const launch = app.launchPath || `/apps/${app.id}/`;
  return (
    <div className="app-tile st-tile" data-testid="collection-tile" data-app-id={app.id}>
      <AppIcon icon={app.icon} size={48} title={app.name} />
      <div className="app-tile-body">
        <div className="row" style={{ gap: 6 }}>
          <span className="app-tile-name">{app.name}</span>
          {app.isSample && <SampleBadge />}
        </div>
        {app.tagline && <div className="app-tile-tagline">{app.tagline}</div>}
        <div className="app-tile-meta">
          <PurposeBadge purpose={app.purpose} />
          <span>{pluralize(app.recordCount, 'entry', 'entries')}</span>
          <span aria-hidden="true">·</span>
          <span>{app.lastOpenedAt ? `Opened ${relativeTime(app.lastOpenedAt)}` : 'New'}</span>
        </div>
      </div>
      <div className="st-tile-actions">
        <Link to={launch} className="btn btn-primary" data-testid="collection-open">
          Open app
        </Link>
        <Link to={`/apps/${app.id}/settings`} className="btn btn-ghost btn-icon" aria-label={`Settings for ${app.name}`} data-testid="collection-settings">
          {Icons.gear}
        </Link>
      </div>
    </div>
  );
}

export function CollectionPage() {
  usePageTitle('My Collection · AI App Store');
  const { toast } = useToast();
  const { data, error, loading, reload } = useLoad(() => api<{ apps: AppSummaryDto[] }>('/api/apps'));
  const apps = data?.apps ?? [];
  const pinned = apps.filter((a) => a.pinned && !a.archivedAt);
  const others = apps.filter((a) => !a.pinned && !a.archivedAt);
  const archived = apps.filter((a) => Boolean(a.archivedAt));

  async function importAppFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const format = parsed && typeof parsed === 'object' ? (parsed as { format?: unknown }).format : undefined;
      if (format !== 'ai-app-store/app-export') throw new Error('That is not an app file exported from this store.');
      const res = await api<AppDetailDto>('/api/apps/import', { method: 'POST', body: parsed });
      toast(`Imported ${res.app.name}`);
      reload();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : describeError(err), { kind: 'error' });
    }
  }

  let body;
  if (loading && !data) {
    body = (
      <div className="stack" aria-busy="true">
        <Skeleton h={78} />
        <Skeleton h={78} />
        <Skeleton h={78} />
      </div>
    );
  } else if (error && !data) {
    body = <ErrorBanner message={error} onRetry={reload} />;
  } else if (apps.length === 0) {
    body = (
      <EmptyState
        title="Your collection starts with one app."
        body="Pick a recommendation that fits you and we will build it. It lives here and on your home screen."
        action={
          <Link to="/for-you" className="btn btn-primary" data-testid="collection-see-for-you">
            See what fits you
          </Link>
        }
      />
    );
  } else {
    body = (
      <>
        {pinned.length > 0 && (
          <section className="st-section" data-testid="collection-pinned">
            <h2>Pinned</h2>
            <div className="stack">
              {pinned.map((a) => (
                <AppTile key={a.id} app={a} />
              ))}
            </div>
          </section>
        )}
        {others.length > 0 && (
          <section className="st-section" data-testid="collection-apps">
            <h2>Your apps</h2>
            <div className="stack">
              {others.map((a) => (
                <AppTile key={a.id} app={a} />
              ))}
            </div>
          </section>
        )}
        {archived.length > 0 && (
          <details className="st-details" data-testid="collection-archived">
            <summary>Archived ({archived.length})</summary>
            <div className="stack" style={{ paddingTop: 8 }}>
              {archived.map((a) => (
                <AppTile key={a.id} app={a} />
              ))}
            </div>
          </details>
        )}
      </>
    );
  }

  return (
    <div className="container-narrow stack-l">
      <header className="st-page-head">
        <h1>My Collection</h1>
        <p className="lede">A collection that grows with you.</p>
      </header>
      {error && data && <ErrorBanner message={error} onRetry={reload} />}
      {body}
      <details className="st-details">
        <summary>Import an app file</summary>
        <div className="stack" style={{ paddingTop: 4 }}>
          <p className="small muted">Choose a JSON file exported from an app's settings. It becomes a new app with its own entries.</p>
          <input type="file" className="st-file-input" accept=".json,application/json" onChange={(e) => void importAppFile(e)} data-testid="collection-import-file" />
        </div>
      </details>
    </div>
  );
}
